
REVOKE ALL ON FUNCTION public.start_support_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_support_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_support_session(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_action(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_support_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_support_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_support_session(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_action(uuid, text, text, text, jsonb) TO service_role;
