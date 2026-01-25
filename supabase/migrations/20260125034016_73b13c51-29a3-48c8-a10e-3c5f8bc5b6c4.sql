-- Teacher role request workflow

-- 1) Requests table
CREATE TABLE IF NOT EXISTS public.teacher_role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL
);

-- Basic status validation (immutable check is OK for fixed set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teacher_role_requests_status_check'
  ) THEN
    ALTER TABLE public.teacher_role_requests
      ADD CONSTRAINT teacher_role_requests_status_check
      CHECK (status IN ('pending','approved','rejected'));
  END IF;
END$$;

-- Only one pending request per user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_teacher_role_requests_pending
ON public.teacher_role_requests (user_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_teacher_role_requests_status_created
ON public.teacher_role_requests (status, created_at DESC);

ALTER TABLE public.teacher_role_requests ENABLE ROW LEVEL SECURITY;

-- 2) RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_role_requests' AND policyname='Teacher requests: self insert'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher requests: self insert" ON public.teacher_role_requests FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_role_requests' AND policyname='Teacher requests: self select'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher requests: self select" ON public.teacher_role_requests FOR SELECT USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_role_requests' AND policyname='Teacher requests: admins select'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher requests: admins select" ON public.teacher_role_requests FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teacher_role_requests' AND policyname='Teacher requests: admins update'
  ) THEN
    EXECUTE 'CREATE POLICY "Teacher requests: admins update" ON public.teacher_role_requests FOR UPDATE USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;
END$$;
