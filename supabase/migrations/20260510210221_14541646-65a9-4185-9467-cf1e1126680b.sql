GRANT EXECUTE ON FUNCTION public.is_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_club(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_club_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_clubs(uuid) TO authenticated;