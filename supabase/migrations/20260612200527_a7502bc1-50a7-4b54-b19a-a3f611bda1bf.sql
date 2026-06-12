
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.support_mode_sessions FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.clubs FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_support_session(uuid, uuid) FROM anon, authenticated, public;
