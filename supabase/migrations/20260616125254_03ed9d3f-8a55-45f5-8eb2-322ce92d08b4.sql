CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_club_id UUID;
  display TEXT;
  club_name TEXT;
BEGIN
  display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  club_name := NEW.raw_user_meta_data->>'club_name';

  -- profile
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, display);

  -- New signups always become Owners of their own freshly created club.
  -- The platform 'creator' role is NEVER granted via public signup; it must
  -- be seeded out-of-band (manual SQL by an operator) to avoid the
  -- "first registrant becomes platform admin" privilege-escalation vector.
  IF club_name IS NULL OR length(trim(club_name)) = 0 THEN
    club_name := display || '''s club';
  END IF;

  INSERT INTO public.clubs (name, created_by) VALUES (club_name, NEW.id) RETURNING id INTO new_club_id;
  INSERT INTO public.user_roles (user_id, role, club_id) VALUES (NEW.id, 'owner', new_club_id);
  RETURN NEW;
END;
$function$;