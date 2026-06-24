CREATE OR REPLACE FUNCTION public.approve_membership_request(_request_id uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ON CONFLICT (user_id, role, club_id) DO NOTHING;

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
END; $function$;