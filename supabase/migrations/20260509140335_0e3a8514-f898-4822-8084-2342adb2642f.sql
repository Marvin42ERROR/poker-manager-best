
-- 1. Enum ролей
CREATE TYPE public.app_role AS ENUM ('creator', 'owner', 'pitboss', 'dealer', 'player');

-- 2. Таблица клубов
CREATE TABLE public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Профили
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Роли (творца — без club_id; всех остальных — с club_id)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, club_id)
);

CREATE INDEX user_roles_user_idx ON public.user_roles(user_id);
CREATE INDEX user_roles_club_idx ON public.user_roles(club_id);

-- 5. Security definer helpers
CREATE OR REPLACE FUNCTION public.is_creator(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'creator'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_club_role(_user_id UUID, _club_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND club_id = _club_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_club(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = 'creator' OR club_id = _club_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_clubs(_user_id UUID)
RETURNS TABLE(club_id UUID, role public.app_role)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.club_id, ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.club_id IS NOT NULL;
$$;

-- 6. Трегер автоматического создания профиля + назначения роли
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_club_id UUID;
  display TEXT;
  club_name TEXT;
  is_first BOOLEAN;
BEGIN
  display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  club_name := NEW.raw_user_meta_data->>'club_name';

  -- profile
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, display);

  -- первый пользователь — создатель
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'creator') INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role, club_id) VALUES (NEW.id, 'creator', NULL);
    RETURN NEW;
  END IF;

  -- иначе — новый владелец клуба
  IF club_name IS NULL OR length(trim(club_name)) = 0 THEN
    club_name := display || '''s club';
  END IF;

  INSERT INTO public.clubs (name, created_by) VALUES (club_name, NEW.id) RETURNING id INTO new_club_id;
  INSERT INTO public.user_roles (user_id, role, club_id) VALUES (NEW.id, 'owner', new_club_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. RLS
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- clubs
CREATE POLICY "members_or_creator_read_clubs" ON public.clubs
FOR SELECT TO authenticated
USING (public.is_creator(auth.uid()) OR public.is_member_of_club(auth.uid(), id));

CREATE POLICY "creator_or_owner_update_clubs" ON public.clubs
FOR UPDATE TO authenticated
USING (public.is_creator(auth.uid()) OR public.has_club_role(auth.uid(), id, 'owner'));

CREATE POLICY "creator_delete_clubs" ON public.clubs
FOR DELETE TO authenticated
USING (public.is_creator(auth.uid()));

-- профили: видны самому пользователю и членам того же клуба и творцу
CREATE POLICY "self_or_creator_read_profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_creator(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles me, public.user_roles other
    WHERE me.user_id = auth.uid()
      AND other.user_id = profiles.id
      AND me.club_id IS NOT NULL
      AND me.club_id = other.club_id
  )
);

CREATE POLICY "self_update_profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid());

-- user_roles
CREATE POLICY "members_read_roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_creator(auth.uid())
  OR (club_id IS NOT NULL AND public.is_member_of_club(auth.uid(), club_id))
);

-- никто не может вставлять/обновлять/удалять роли через клиента (только триггеры/будущие server fn)
-- (creator может через будущий admin endpoint; пока запрещаем всё)
