
-- =========================================================================
-- Phase 2.1 — club_members table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','left','removed','banned')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS club_members_active_unique
  ON public.club_members (club_id, user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS club_members_club_status_idx
  ON public.club_members (club_id, status);
CREATE INDEX IF NOT EXISTS club_members_user_idx
  ON public.club_members (user_id);

GRANT SELECT ON public.club_members TO authenticated;
GRANT ALL ON public.club_members TO service_role;

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members and creator can read club_members"
  ON public.club_members FOR SELECT
  TO authenticated
  USING (
    public.is_member_of_club(auth.uid(), club_id)
    OR public.is_creator(auth.uid())
  );

-- updated_at trigger (reuse existing helper if present)
CREATE OR REPLACE FUNCTION public.touch_club_members()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_club_members ON public.club_members;
CREATE TRIGGER trg_touch_club_members
  BEFORE UPDATE ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_club_members();

-- =========================================================================
-- Phase 2.2 — Backfill from user_roles
-- =========================================================================

WITH ranked AS (
  SELECT
    ur.user_id,
    ur.club_id,
    ur.role,
    ur.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY ur.club_id, ur.user_id
      ORDER BY CASE ur.role
        WHEN 'owner' THEN 1
        WHEN 'co_owner' THEN 2
        WHEN 'manager' THEN 3
        WHEN 'dealer' THEN 4
        WHEN 'player' THEN 5
        ELSE 9
      END
    ) AS rn
  FROM public.user_roles ur
  WHERE ur.club_id IS NOT NULL
    AND ur.role <> 'creator'
)
INSERT INTO public.club_members (club_id, user_id, display_name, role, status, joined_at)
SELECT
  r.club_id,
  r.user_id,
  COALESCE(p.display_name, ''),
  r.role,
  CASE WHEN r.rn = 1 THEN 'active' ELSE 'left' END,
  r.created_at
FROM ranked r
LEFT JOIN public.profiles p ON p.id = r.user_id
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Phase 2.3 — RPCs (single source of change)
-- =========================================================================

-- Extend approve_membership_request to also mirror into club_members.
CREATE OR REPLACE FUNCTION public.approve_membership_request(_request_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
  v_display TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _role IS NULL THEN RAISE EXCEPTION 'role required'; END IF;
  IF _role = 'creator' THEN RAISE EXCEPTION 'cannot assign creator role'; END IF;

  SELECT * INTO v_req FROM public.membership_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  IF NOT private.can_manage_club(v_uid, v_req.club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _role IN ('owner','co_owner') THEN
    IF NOT (
      private.is_creator(v_uid)
      OR private.has_club_role(v_uid, v_req.club_id, 'owner')
    ) THEN
      RAISE EXCEPTION 'only Owner or Creator can assign owner/co-owner';
    END IF;
  END IF;

  -- Mirror role into user_roles (RLS gate)
  INSERT INTO public.user_roles (user_id, role, club_id)
  VALUES (v_req.user_id, _role, v_req.club_id)
  ON CONFLICT (user_id, role, club_id) DO NOTHING;

  -- Create or reactivate club_members row (single source of truth for people)
  SELECT COALESCE(display_name, '') INTO v_display FROM public.profiles WHERE id = v_req.user_id;

  UPDATE public.club_members
    SET status = 'active',
        role = _role,
        joined_at = now(),
        left_at = NULL
    WHERE club_id = v_req.club_id AND user_id = v_req.user_id
      AND status <> 'active';

  IF NOT FOUND THEN
    INSERT INTO public.club_members (club_id, user_id, display_name, role, status)
    VALUES (v_req.club_id, v_req.user_id, COALESCE(v_display, ''), _role, 'active')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.membership_requests
  SET status = 'approved',
      assigned_role = _role,
      decided_by = v_uid,
      decided_at = now()
  WHERE id = _request_id;

  PERFORM public.log_action(
    v_req.club_id, 'membership_request.approved', 'membership_request', _request_id::text,
    jsonb_build_object('user_id', v_req.user_id, 'role', _role)
  );
END; $$;

-- List members of a club (readable by members + creator)
CREATE OR REPLACE FUNCTION public.list_club_members(_club_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  display_name text,
  role public.app_role,
  status text,
  joined_at timestamptz,
  left_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.is_member_of_club(auth.uid(), _club_id) OR public.is_creator(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT cm.id, cm.user_id,
           COALESCE(NULLIF(cm.display_name, ''), p.display_name, ''),
           cm.role, cm.status, cm.joined_at, cm.left_at
    FROM public.club_members cm
    LEFT JOIN public.profiles p ON p.id = cm.user_id
    WHERE cm.club_id = _club_id
    ORDER BY
      CASE cm.status WHEN 'active' THEN 0 ELSE 1 END,
      CASE cm.role
        WHEN 'owner' THEN 1
        WHEN 'co_owner' THEN 2
        WHEN 'manager' THEN 3
        WHEN 'dealer' THEN 4
        WHEN 'player' THEN 5
        ELSE 9 END,
      cm.joined_at;
END; $$;

-- Helper: count active owners in a club
CREATE OR REPLACE FUNCTION private.count_active_owners(_club_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.club_members
    WHERE club_id = _club_id AND status = 'active' AND role = 'owner';
$$;

-- Change role
CREATE OR REPLACE FUNCTION public.change_member_role(_member_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _role = 'creator' THEN RAISE EXCEPTION 'cannot assign creator role'; END IF;

  SELECT * INTO v_m FROM public.club_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found'; END IF;
  IF v_m.status <> 'active' THEN RAISE EXCEPTION 'member not active'; END IF;

  IF NOT private.can_manage_club(v_uid, v_m.club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _role IN ('owner','co_owner') THEN
    IF NOT (private.is_creator(v_uid) OR private.has_club_role(v_uid, v_m.club_id, 'owner')) THEN
      RAISE EXCEPTION 'only Owner or Creator can assign owner/co-owner';
    END IF;
  END IF;

  IF v_m.role = 'owner' AND _role <> 'owner'
     AND private.count_active_owners(v_m.club_id) <= 1 THEN
    RAISE EXCEPTION 'cannot demote the last owner';
  END IF;

  IF v_m.role = _role THEN RETURN; END IF;

  -- Update club_members
  UPDATE public.club_members SET role = _role WHERE id = _member_id;

  -- Sync user_roles: drop old, insert new
  DELETE FROM public.user_roles
    WHERE user_id = v_m.user_id AND club_id = v_m.club_id AND role = v_m.role;
  INSERT INTO public.user_roles (user_id, role, club_id)
    VALUES (v_m.user_id, _role, v_m.club_id)
    ON CONFLICT (user_id, role, club_id) DO NOTHING;

  PERFORM public.log_action(
    v_m.club_id, 'member.role_changed', 'club_member', _member_id::text,
    jsonb_build_object('user_id', v_m.user_id, 'from', v_m.role, 'to', _role)
  );
END; $$;

-- Remove member (by owner/creator)
CREATE OR REPLACE FUNCTION public.remove_member(_member_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_m FROM public.club_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found'; END IF;
  IF v_m.status <> 'active' THEN RAISE EXCEPTION 'member not active'; END IF;

  IF NOT private.can_manage_club(v_uid, v_m.club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_m.user_id = v_uid THEN
    RAISE EXCEPTION 'use leave_club to remove yourself';
  END IF;

  IF v_m.role = 'owner' AND private.count_active_owners(v_m.club_id) <= 1 THEN
    RAISE EXCEPTION 'cannot remove the last owner';
  END IF;

  UPDATE public.club_members
    SET status = 'removed', left_at = now()
    WHERE id = _member_id;

  DELETE FROM public.user_roles
    WHERE user_id = v_m.user_id AND club_id = v_m.club_id;

  PERFORM public.log_action(
    v_m.club_id, 'member.removed', 'club_member', _member_id::text,
    jsonb_build_object('user_id', v_m.user_id, 'role', v_m.role)
  );
END; $$;

-- Leave club (self)
CREATE OR REPLACE FUNCTION public.leave_club(_club_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_m FROM public.club_members
    WHERE club_id = _club_id AND user_id = v_uid AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not an active member'; END IF;

  IF v_m.role = 'owner' AND private.count_active_owners(_club_id) <= 1 THEN
    RAISE EXCEPTION 'last owner cannot leave the club';
  END IF;

  UPDATE public.club_members
    SET status = 'left', left_at = now()
    WHERE id = v_m.id;

  DELETE FROM public.user_roles
    WHERE user_id = v_uid AND club_id = _club_id;

  PERFORM public.log_action(
    _club_id, 'member.left', 'club_member', v_m.id::text,
    jsonb_build_object('user_id', v_uid, 'role', v_m.role)
  );
END; $$;

-- Rename member (club-scoped display name)
CREATE OR REPLACE FUNCTION public.rename_member(_member_id uuid, _display_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m RECORD;
  v_trim TEXT := trim(COALESCE(_display_name, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(v_trim) = 0 THEN RAISE EXCEPTION 'display_name required'; END IF;
  IF length(v_trim) > 80 THEN RAISE EXCEPTION 'display_name too long'; END IF;

  SELECT * INTO v_m FROM public.club_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found'; END IF;

  IF NOT (v_m.user_id = v_uid OR private.can_manage_club(v_uid, v_m.club_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.club_members SET display_name = v_trim WHERE id = _member_id;

  PERFORM public.log_action(
    v_m.club_id, 'member.renamed', 'club_member', _member_id::text,
    jsonb_build_object('user_id', v_m.user_id, 'display_name', v_trim)
  );
END; $$;
