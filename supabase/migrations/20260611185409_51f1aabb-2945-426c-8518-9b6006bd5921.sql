
-- 1. Rename enum value pitboss -> manager
ALTER TYPE public.app_role RENAME VALUE 'pitboss' TO 'manager';

-- 2. support_mode_sessions
CREATE TABLE public.support_mode_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX support_sessions_active_idx
  ON public.support_mode_sessions (user_id, club_id) WHERE ended_at IS NULL;

GRANT SELECT ON public.support_mode_sessions TO authenticated;
GRANT ALL ON public.support_mode_sessions TO service_role;
ALTER TABLE public.support_mode_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_read_support_sessions ON public.support_mode_sessions
  FOR SELECT TO authenticated
  USING (private.is_creator(auth.uid()));

-- writes go through SECURITY DEFINER helpers below

CREATE OR REPLACE FUNCTION public.has_active_support_session(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_mode_sessions
    WHERE user_id = _user_id AND club_id = _club_id AND ended_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.start_support_session(_club_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_creator(v_uid) THEN RAISE EXCEPTION 'forbidden: creator only'; END IF;

  -- close any active session for this club by this user first
  UPDATE public.support_mode_sessions
    SET ended_at = now()
    WHERE user_id = v_uid AND club_id = _club_id AND ended_at IS NULL;

  INSERT INTO public.support_mode_sessions (user_id, club_id, reason)
    VALUES (v_uid, _club_id, _reason)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_support_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.support_mode_sessions
    SET ended_at = now()
    WHERE id = _session_id AND user_id = v_uid AND ended_at IS NULL;
END;
$$;

-- 3. audit_log (schema + helper, no call sites)
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  via_support_session_id uuid REFERENCES public.support_mode_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_club_idx ON public.audit_log (club_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_user_id, created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_or_owner_read_audit ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    private.is_creator(auth.uid())
    OR (club_id IS NOT NULL AND private.has_club_role(auth.uid(), club_id, 'owner'::app_role))
  );

CREATE OR REPLACE FUNCTION public.log_action(
  _club_id uuid,
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session uuid;
  v_id uuid;
BEGIN
  IF _club_id IS NOT NULL AND v_uid IS NOT NULL THEN
    SELECT id INTO v_session FROM public.support_mode_sessions
      WHERE user_id = v_uid AND club_id = _club_id AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.audit_log (actor_user_id, club_id, action, entity_type, entity_id, details, via_support_session_id)
    VALUES (v_uid, _club_id, _action, _entity_type, _entity_id, COALESCE(_details, '{}'::jsonb), v_session)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
