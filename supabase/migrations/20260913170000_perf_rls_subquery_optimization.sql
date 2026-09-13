-- Optimize RLS subquery evaluation on class context tables (course_instructors, class_courses)
-- Eliminates N+1 query overhead by replacing row-level EXISTS (SELECT 1 FROM users WHERE ...)
-- with a STABLE SECURITY DEFINER helper function.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_current_user_class_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT class_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

ALTER FUNCTION public.get_current_user_class_id() OWNER TO postgres;

-- Restrict function execution
REVOKE ALL ON FUNCTION public.get_current_user_class_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_class_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_current_user_class_id() IS 'Returns current authenticated user class_id using STABLE evaluation to prevent RLS N+1 overhead.';

-- 1) Recreate course_instructors edit policy with optimized function
DROP POLICY IF EXISTS "Users can edit instructors in their class" ON public.course_instructors;
CREATE POLICY "Users can edit instructors in their class"
ON public.course_instructors
TO authenticated
USING (class_id = public.get_current_user_class_id())
WITH CHECK (class_id = public.get_current_user_class_id());

-- 2) Recreate class_courses read policy with optimized function
DROP POLICY IF EXISTS "Users can read courses in their class" ON public.class_courses;
CREATE POLICY "Users can read courses in their class"
ON public.class_courses
FOR SELECT
TO authenticated
USING (class_id = public.get_current_user_class_id());

-- 3) Recreate course_instructors read policy with optimized function
DROP POLICY IF EXISTS "Users can read instructors in their class" ON public.course_instructors;
CREATE POLICY "Users can read instructors in their class"
ON public.course_instructors
FOR SELECT
TO authenticated
USING (class_id = public.get_current_user_class_id());

COMMIT;
