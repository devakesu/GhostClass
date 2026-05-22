-- Drop the legacy batch/end_year column from classes.
-- Rebuild the lookup index to cover the remaining class identity fields.
DROP INDEX IF EXISTS public.classes_lookup_idx;
ALTER TABLE public.classes DROP COLUMN IF EXISTS end_year;
CREATE INDEX IF NOT EXISTS classes_lookup_idx ON public.classes (programme_config_group_id, sem, year, name);
