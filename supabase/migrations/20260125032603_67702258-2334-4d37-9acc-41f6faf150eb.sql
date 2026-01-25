-- Add tags + featured metadata to courses
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS featured_rank integer NOT NULL DEFAULT 0;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_courses_featured_rank ON public.courses (featured, featured_rank);
CREATE INDEX IF NOT EXISTS idx_courses_tags_gin ON public.courses USING GIN (tags);
