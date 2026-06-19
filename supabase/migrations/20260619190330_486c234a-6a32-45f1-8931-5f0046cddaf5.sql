
-- ============================================================
-- 2. club_settings: per-club visibility + invite code
-- ============================================================
CREATE TABLE IF NOT EXISTS public.club_settings (
  club_id     UUID PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.club_settings TO authenticated;
GRANT ALL ON public.club_settings TO service_role;
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
  tries INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.club_settings WHERE invite_code = code);
    tries := tries + 1;
    IF tries > 25 THEN RAISE EXCEPTION 'could not generate unique invite code'; END IF;
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_club()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.club_settings (club_id, invite_code)
  VALUES (NEW.id, public.gen_invite_code())
  ON CONFLICT (club_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_club ON public.clubs;
CREATE TRIGGER trg_handle_new_club
  AFTER INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_club();

INSERT INTO public.club_settings (club_id, invite_code)
SELECT c.id, public.gen_invite_code()
FROM public.clubs c
WHERE NOT EXISTS (SELECT 1 FROM public.club_settings s WHERE s.club_id = c.id);

-- ============================================================
-- 3. Manager helper
-- ============================================================
CREATE OR REPLACE FUNCTION private.can_manage_club(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'creator'
        OR (club_id = _club_id AND role IN ('owner', 'co_owner'))
      )
  );
$$;

DROP POLICY IF EXISTS members_read_club_settings ON public.club_settings;
CREATE POLICY members_read_club_settings ON public.club_settings
  FOR SELECT TO authenticated
  USING (
    private.is_creator(auth.uid())
    OR private.is_member_of_club(auth.uid(), club_id)
  );

DROP POLICY IF EXISTS managers_update_club_settings ON public.club_settings;
CREATE POLICY managers_update_club_settings ON public.club_settings
  FOR UPDATE TO authenticated
  USING (private.can_manage_club(auth.uid(), club_id))
  WITH CHECK (private.can_manage_club(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.touch_club_settings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_club_settings ON public.club_settings;
CREATE TRIGGER trg_touch_club_settings BEFORE UPDATE ON public.club_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_club_settings();

-- ============================================================
-- 4. membership_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.membership_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  message       TEXT,
  assigned_role public.app_role,
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_requests_one_pending
  ON public.membership_requests(user_id, club_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_membership_requests_club_status
  ON public.membership_requests(club_id, status);

GRANT SELECT, UPDATE ON public.membership_requests TO authenticated;
GRANT ALL ON public.membership_requests TO service_role;
ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_membership_requests ON public.membership_requests;
CREATE POLICY read_membership_requests ON public.membership_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.can_manage_club(auth.uid(), club_id)
  );

DROP POLICY IF EXISTS cancel_own_membership_request ON public.membership_requests;
CREATE POLICY cancel_own_membership_request ON public.membership_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('pending','cancelled'));

CREATE OR REPLACE FUNCTION public.touch_membership_requests()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_membership_requests ON public.membership_requests;
CREATE TRIGGER trg_touch_membership_requests BEFORE UPDATE ON public.membership_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_membership_requests();

-- ============================================================
-- 5. RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_public_clubs(_q TEXT)
RETURNS TABLE(id UUID, name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name
  FROM public.clubs c
  JOIN public.club_settings s ON s.club_id = c.id
  WHERE s.is_public = true
    AND (_q IS NULL OR _q = '' OR c.name ILIKE '%' || _q || '%')
  ORDER BY c.name
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.find_club_by_invite(_code TEXT)
RETURNS TABLE(id UUID, name TEXT, is_public BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, s.is_public
  FROM public.clubs c
  JOIN public.club_settings s ON s.club_id = c.id
  WHERE upper(s.invite_code) = upper(_code)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.request_club_access(
  _club_id UUID,
  _invite_code TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_public BOOLEAN;
  v_invite TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT s.is_public, s.invite_code INTO v_is_public, v_invite
  FROM public.club_settings s WHERE s.club_id = _club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'club not found'; END IF;

  IF NOT v_is_public THEN
    IF _invite_code IS NULL OR upper(_invite_code) <> upper(v_invite) THEN
      RAISE EXCEPTION 'invalid invite code';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND (role = 'creator' OR club_id = _club_id)
  ) THEN
    RAISE EXCEPTION 'already a member';
  END IF;

  SELECT id INTO v_id FROM public.membership_requests
  WHERE user_id = v_uid AND club_id = _club_id AND status = 'pending';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.membership_requests (club_id, user_id, message)
  VALUES (_club_id, v_uid, NULLIF(trim(_message), ''))
  RETURNING id INTO v_id;

  PERFORM public.log_action(
    _club_id, 'membership_request.created', 'membership_request', v_id::text,
    jsonb_build_object('user_id', v_uid)
  );

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.approve_membership_request(
  _request_id UUID,
  _role public.app_role
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
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

  INSERT INTO public.user_roles (user_id, role, club_id)
  VALUES (v_req.user_id, _role, v_req.club_id)
  ON CONFLICT (user_id, role) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.reject_membership_request(_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_req FROM public.membership_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;
  IF NOT private.can_manage_club(v_uid, v_req.club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.membership_requests
  SET status = 'rejected', decided_by = v_uid, decided_at = now()
  WHERE id = _request_id;

  PERFORM public.log_action(
    v_req.club_id, 'membership_request.rejected', 'membership_request', _request_id::text,
    jsonb_build_object('user_id', v_req.user_id)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_membership_request(_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_req FROM public.membership_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.user_id <> v_uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  UPDATE public.membership_requests
  SET status = 'cancelled', decided_at = now()
  WHERE id = _request_id;

  PERFORM public.log_action(
    v_req.club_id, 'membership_request.cancelled', 'membership_request', _request_id::text,
    jsonb_build_object('user_id', v_uid)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.count_pending_requests_for_me()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(COUNT(*), 0)::int
  FROM public.membership_requests r
  WHERE r.status = 'pending'
    AND private.can_manage_club(auth.uid(), r.club_id);
$$;

CREATE OR REPLACE FUNCTION public.list_pending_requests_for_me()
RETURNS TABLE(
  id UUID,
  club_id UUID,
  club_name TEXT,
  user_id UUID,
  display_name TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.club_id, c.name, r.user_id,
         COALESCE(p.display_name, ''), r.message, r.created_at
  FROM public.membership_requests r
  JOIN public.clubs c ON c.id = r.club_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.status = 'pending'
    AND private.can_manage_club(auth.uid(), r.club_id)
  ORDER BY r.created_at DESC;
$$;
