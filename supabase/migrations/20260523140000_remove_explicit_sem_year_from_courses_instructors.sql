-- Migration to remove explicit semester and academic_year columns from class_courses and course_instructors tables.
-- Since classes are already tied to a specific semester and year, these columns are redundant.

BEGIN;

-- 1) Drop dependent foreign keys first
ALTER TABLE public.course_instructors
  DROP CONSTRAINT IF EXISTS course_instructors_class_course_fkey;

-- 2) Drop unique constraints on class_courses and course_instructors
ALTER TABLE ONLY public.class_courses
  DROP CONSTRAINT IF EXISTS unique_class_course_context;

ALTER TABLE ONLY public.course_instructors
  DROP CONSTRAINT IF EXISTS unique_class_course_term;

-- 3) Drop check constraints on class_courses and course_instructors (if any)
ALTER TABLE public.class_courses
  DROP CONSTRAINT IF EXISTS class_courses_academic_year_check,
  DROP CONSTRAINT IF EXISTS class_courses_semester_check;

ALTER TABLE public.course_instructors
  DROP CONSTRAINT IF EXISTS course_instructors_academic_year_check,
  DROP CONSTRAINT IF EXISTS course_instructors_semester_check;

-- 4) Drop columns from class_courses
ALTER TABLE public.class_courses
  DROP COLUMN IF EXISTS academic_year,
  DROP COLUMN IF EXISTS semester;

-- 5) Drop columns from course_instructors
ALTER TABLE public.course_instructors
  DROP COLUMN IF EXISTS academic_year,
  DROP COLUMN IF EXISTS semester;

-- 6) Add new unique constraints without academic_year/semester
ALTER TABLE ONLY public.class_courses
  ADD CONSTRAINT unique_class_course_context UNIQUE (class_id, course_code);

ALTER TABLE ONLY public.course_instructors
  ADD CONSTRAINT unique_class_course_term UNIQUE (class_id, course_code);

-- 7) Add foreign key constraint back
ALTER TABLE public.course_instructors
  ADD CONSTRAINT course_instructors_class_course_fkey
  FOREIGN KEY (class_id, course_code)
  REFERENCES public.class_courses (class_id, course_code)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

COMMIT;
