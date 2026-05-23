-- Harden RLS/integrity for class, course, and instructor access paths.

BEGIN;

-- 1) Ensure one public.users profile per auth user.
-- If duplicates already exist, this index creation will fail and surface rows to clean.
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_unique_idx
  ON public.users (auth_id)
  WHERE auth_id IS NOT NULL;

-- 2) Prevent authenticated users from self-reassigning class_id.
CREATE OR REPLACE FUNCTION public.prevent_class_id_self_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
  -- Allow backend/admin paths (no JWT subject), but block self-service class moves.
  IF auth.uid() IS NOT NULL
     AND OLD.auth_id = auth.uid()
     AND NEW.class_id IS DISTINCT FROM OLD.class_id THEN
    RAISE EXCEPTION 'class_id cannot be modified by the account owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_class_id_change ON public.users;
CREATE TRIGGER prevent_self_class_id_change
BEFORE UPDATE OF class_id ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_class_id_self_change();

-- 3) Add missing DELETE policy for class_courses to avoid RLS delete failures.
CREATE POLICY "Users can delete courses in their class"
ON public.class_courses
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  )
);

-- 4) Enforce instructor mapping integrity against class_courses context.
-- NOT VALID avoids failing immediately on historical drift; validation can be run
-- after data cleanup if needed.
ALTER TABLE public.course_instructors
  ADD CONSTRAINT course_instructors_class_course_fkey
  FOREIGN KEY (class_id, course_code, academic_year, semester)
  REFERENCES public.class_courses (class_id, course_code, academic_year, semester)
  ON UPDATE CASCADE
  ON DELETE CASCADE
  NOT VALID;

-- 5) Reduce accidental anon function exposure.
REVOKE ALL ON FUNCTION public.prevent_class_id_self_change() FROM anon;
REVOKE ALL ON FUNCTION public.audit_generic_changes() FROM anon;
REVOKE ALL ON FUNCTION public.check_225_attendance_limit() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;

COMMIT;
