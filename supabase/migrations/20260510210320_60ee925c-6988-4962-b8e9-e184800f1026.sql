CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_creator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'creator'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_member_of_club(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = 'creator' OR club_id = _club_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.has_club_role(_user_id uuid, _club_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND club_id = _club_id
  );
$$;

CREATE OR REPLACE FUNCTION private.get_user_clubs(_user_id uuid)
RETURNS TABLE(club_id uuid, role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ur.club_id, ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.club_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION private.is_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_member_of_club(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_club_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_user_clubs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_member_of_club(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_club_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_clubs(uuid) TO authenticated;

DROP POLICY IF EXISTS members_or_creator_read_clubs ON public.clubs;
DROP POLICY IF EXISTS creator_or_owner_update_clubs ON public.clubs;
DROP POLICY IF EXISTS creator_delete_clubs ON public.clubs;
DROP POLICY IF EXISTS self_or_creator_read_profiles ON public.profiles;
DROP POLICY IF EXISTS self_update_profile ON public.profiles;
DROP POLICY IF EXISTS members_read_roles ON public.user_roles;

CREATE POLICY members_or_creator_read_clubs
ON public.clubs
FOR SELECT
TO authenticated
USING (private.is_creator(auth.uid()) OR private.is_member_of_club(auth.uid(), id));

CREATE POLICY creator_or_owner_update_clubs
ON public.clubs
FOR UPDATE
TO authenticated
USING (private.is_creator(auth.uid()) OR private.has_club_role(auth.uid(), id, 'owner'));

CREATE POLICY creator_delete_clubs
ON public.clubs
FOR DELETE
TO authenticated
USING (private.is_creator(auth.uid()));

CREATE POLICY self_or_creator_read_profiles
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR private.is_creator(auth.uid()));

CREATE POLICY self_update_profile
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY members_read_roles
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.is_creator(auth.uid())
  OR (club_id IS NOT NULL AND private.is_member_of_club(auth.uid(), club_id))
);

REVOKE ALL ON FUNCTION public.is_creator(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_member_of_club(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_club_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_clubs(uuid) FROM PUBLIC, anon, authenticated;