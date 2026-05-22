-- Migration to support sem/year scoped classes
-- Drop the UNIQUE and NOT NULL constraints on classes.external_group_id
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_external_group_id_key;
ALTER TABLE public.classes ALTER COLUMN external_group_id DROP NOT NULL;

-- Drop division/usersubgroup columns if they exist
ALTER TABLE public.classes DROP COLUMN IF EXISTS division;
ALTER TABLE public.classes DROP COLUMN IF EXISTS usersubgroup_name;

-- Add new columns for matching and scoping
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS programme_config_group_id BIGINT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS end_year TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sem TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS year TEXT;

-- Create a lookup index for fast queries
DROP INDEX IF EXISTS public.classes_lookup_idx;
CREATE INDEX IF NOT EXISTS classes_lookup_idx ON public.classes (programme_config_group_id, end_year, sem, year);
