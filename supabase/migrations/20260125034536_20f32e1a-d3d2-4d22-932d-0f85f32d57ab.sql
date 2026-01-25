-- C) Public teacher profile card support (safe public fields only)

CREATE TABLE IF NOT EXISTS public.teacher_public_profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  headline text NULL,
  bio text NULL,
  avatar_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_public_profiles ENABLE ROW LEVEL SECURITY;

-- Public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_public_profiles' AND policyname='Teacher public profiles: public read'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher public profiles: public read" ON public.teacher_public_profiles FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_public_profiles' AND policyname='Teacher public profiles: self insert'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher public profiles: self insert" ON public.teacher_public_profiles FOR INSERT WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(), ''teacher''::public.app_role) OR public.has_role(auth.uid(), ''admin''::public.app_role)))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_public_profiles' AND policyname='Teacher public profiles: self update'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher public profiles: self update" ON public.teacher_public_profiles FOR UPDATE USING (auth.uid() = user_id AND (public.has_role(auth.uid(), ''teacher''::public.app_role) OR public.has_role(auth.uid(), ''admin''::public.app_role))) WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(), ''teacher''::public.app_role) OR public.has_role(auth.uid(), ''admin''::public.app_role)))';
  END IF;
END$$;

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_teacher_public_profiles_updated_at'
  ) THEN
    CREATE TRIGGER update_teacher_public_profiles_updated_at
    BEFORE UPDATE ON public.teacher_public_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;
