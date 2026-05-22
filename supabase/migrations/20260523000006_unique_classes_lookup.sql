-- Drop the non-unique lookup index if it exists.
DROP INDEX IF EXISTS public.classes_lookup_idx;

-- Create the lookup index as a UNIQUE index to support ON CONFLICT upserting.
CREATE UNIQUE INDEX IF NOT EXISTS classes_lookup_idx ON public.classes (programme_config_group_id, sem, year, name);
