-- Fix storage RLS for videos bucket: allow teacher OR admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can upload their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can upload their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can update their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can update their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Teachers can delete their own videos') THEN
    EXECUTE 'DROP POLICY "Teachers can delete their own videos" ON storage.objects';
  END IF;

  -- Also drop any newer renamed variants if they exist (defensive)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Creators can upload their own videos') THEN
    EXECUTE 'DROP POLICY "Creators can upload their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Creators can update their own videos') THEN
    EXECUTE 'DROP POLICY "Creators can update their own videos" ON storage.objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Creators can delete their own videos') THEN
    EXECUTE 'DROP POLICY "Creators can delete their own videos" ON storage.objects';
  END IF;
END $$;

CREATE POLICY "Creators can upload their own videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Creators can update their own videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos'
  AND (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Creators can delete their own videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
  AND (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND auth.uid()::text = (storage.foldername(name))[1]
);
