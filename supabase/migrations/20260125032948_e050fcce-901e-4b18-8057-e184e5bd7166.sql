-- Fix migration: create thumbnail column, bucket, and policies with valid dynamic SQL.

-- 1) Courses: add thumbnail URL
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- 2) Storage bucket for course thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-thumbnails', 'course-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policies on storage.objects (public read, teacher/admin write within their own folder)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Course thumbnails: public read'
  ) THEN
    EXECUTE 'CREATE POLICY "Course thumbnails: public read" ON storage.objects FOR SELECT USING (bucket_id = ''course-thumbnails'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Course thumbnails: teacher/admin insert'
  ) THEN
    EXECUTE 'CREATE POLICY "Course thumbnails: teacher/admin insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''course-thumbnails'' AND (public.has_role(auth.uid(), ''admin''::public.app_role) OR (public.has_role(auth.uid(), ''teacher''::public.app_role) AND auth.uid()::text = (storage.foldername(name))[1])))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Course thumbnails: teacher/admin update'
  ) THEN
    EXECUTE 'CREATE POLICY "Course thumbnails: teacher/admin update" ON storage.objects FOR UPDATE USING (bucket_id = ''course-thumbnails'' AND (public.has_role(auth.uid(), ''admin''::public.app_role) OR (public.has_role(auth.uid(), ''teacher''::public.app_role) AND auth.uid()::text = (storage.foldername(name))[1])))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Course thumbnails: teacher/admin delete'
  ) THEN
    EXECUTE 'CREATE POLICY "Course thumbnails: teacher/admin delete" ON storage.objects FOR DELETE USING (bucket_id = ''course-thumbnails'' AND (public.has_role(auth.uid(), ''admin''::public.app_role) OR (public.has_role(auth.uid(), ''teacher''::public.app_role) AND auth.uid()::text = (storage.foldername(name))[1])))';
  END IF;
END$$;

-- 4) Teacher analytics: allow teachers/admins to read quiz_attempts + video_event_completions for their owned content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='quiz_attempts' AND policyname='Quiz attempts: teacher/admin select for owned content'
  ) THEN
    EXECUTE 'CREATE POLICY "Quiz attempts: teacher/admin select for owned content" ON public.quiz_attempts AS PERMISSIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR (public.has_role(auth.uid(), ''teacher''::public.app_role) AND EXISTS (SELECT 1 FROM public.timeline_events e JOIN public.videos v ON v.id = e.video_id WHERE e.id = public.quiz_attempts.event_id AND v.owner_id = auth.uid())))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='video_event_completions' AND policyname='Completions: teacher/admin select for owned content'
  ) THEN
    EXECUTE 'CREATE POLICY "Completions: teacher/admin select for owned content" ON public.video_event_completions AS PERMISSIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR (public.has_role(auth.uid(), ''teacher''::public.app_role) AND EXISTS (SELECT 1 FROM public.timeline_events e JOIN public.videos v ON v.id = e.video_id WHERE e.id = public.video_event_completions.event_id AND v.owner_id = auth.uid())))';
  END IF;
END$$;
