-- 1) Make teacher/admin required for content writes (courses/videos/events/quizzes)

-- Courses
DROP POLICY IF EXISTS "Courses: owner/admin insert" ON public.courses;
CREATE POLICY "Courses: teacher/admin insert"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Courses: owner/admin update" ON public.courses;
CREATE POLICY "Courses: teacher/admin update"
ON public.courses
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Courses: owner/admin delete" ON public.courses;
CREATE POLICY "Courses: teacher/admin delete"
ON public.courses
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- Videos: add missing columns
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS exam_url text,
  ADD COLUMN IF NOT EXISTS simulation_url text;

DROP POLICY IF EXISTS "Videos: owner/admin insert" ON public.videos;
CREATE POLICY "Videos: teacher/admin insert"
ON public.videos
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Videos: owner/admin update" ON public.videos;
CREATE POLICY "Videos: teacher/admin update"
ON public.videos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Videos: owner/admin delete" ON public.videos;
CREATE POLICY "Videos: teacher/admin delete"
ON public.videos
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- Timeline events
DROP POLICY IF EXISTS "Events: owner/admin insert" ON public.timeline_events;
CREATE POLICY "Events: teacher/admin insert"
ON public.timeline_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Events: owner/admin update" ON public.timeline_events;
CREATE POLICY "Events: teacher/admin update"
ON public.timeline_events
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Events: owner/admin delete" ON public.timeline_events;
CREATE POLICY "Events: teacher/admin delete"
ON public.timeline_events
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- Quizzes write policy: restrict to teacher/admin too
DROP POLICY IF EXISTS "Quizzes: owner/admin write" ON public.quizzes;
CREATE POLICY "Quizzes: teacher/admin write"
ON public.quizzes
FOR ALL
TO authenticated
USING (
  exists (
    select 1
    from public.timeline_events e
    where e.id = quizzes.event_id
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or (e.owner_id = auth.uid() and public.has_role(auth.uid(), 'teacher'::public.app_role))
      )
  )
)
WITH CHECK (
  exists (
    select 1
    from public.timeline_events e
    where e.id = quizzes.event_id
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or (e.owner_id = auth.uid() and public.has_role(auth.uid(), 'teacher'::public.app_role))
      )
  )
);

-- 2) Storage bucket for uploaded video files (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for videos bucket
DO $$
BEGIN
  -- avoid duplicate policy errors by dropping if present
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Video files are publicly accessible') THEN
    EXECUTE 'DROP POLICY "Video files are publicly accessible" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can upload their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can upload their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can update their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can update their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can delete their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can delete their own videos" ON storage.objects';
  END IF;
END $$;

CREATE POLICY "Video files are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Teachers can upload their own videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Teachers can update their own videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Teachers can delete their own videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND auth.uid()::text = (storage.foldername(name))[1]
);
