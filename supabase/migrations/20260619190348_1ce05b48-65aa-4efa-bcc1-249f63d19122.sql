
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.search_public_clubs(text)',
    'public.find_club_by_invite(text)',
    'public.request_club_access(uuid, text, text)',
    'public.approve_membership_request(uuid, public.app_role)',
    'public.reject_membership_request(uuid)',
    'public.cancel_membership_request(uuid)',
    'public.count_pending_requests_for_me()',
    'public.list_pending_requests_for_me()',
    'public.gen_invite_code()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
