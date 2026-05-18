-- Harden class_courses and course_instructors tables to prevent nulls and empty strings.
--
-- This migration:
--   1. Adds strict non-null constraints and formats to academic_year (supporting YYYY-YYYY or YYYY-YY).
--   2. Ensures course_code and course_name cannot be empty strings.

-- ============================================================================
-- 1. class_courses Hardening
-- ============================================================================

-- Ensure academic_year is NOT NULL and strictly matches YYYY-YYYY or YYYY-YY format
ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_academic_year_check"
  CHECK ("academic_year" IS NOT NULL AND "academic_year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$') NOT VALID;

ALTER TABLE "public"."class_courses" VALIDATE CONSTRAINT "class_courses_academic_year_check";

-- Ensure course_code and course_name are not empty or blank strings
ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_course_code_not_empty"
  CHECK (btrim("course_code") <> '') NOT VALID,
  ADD CONSTRAINT "class_courses_course_name_not_empty"
  CHECK (btrim("course_name") <> '') NOT VALID;

ALTER TABLE "public"."class_courses" VALIDATE CONSTRAINT "class_courses_course_code_not_empty";
ALTER TABLE "public"."class_courses" VALIDATE CONSTRAINT "class_courses_course_name_not_empty";


-- ============================================================================
-- 2. course_instructors Hardening
-- ============================================================================

-- Ensure academic_year strictly matches YYYY-YYYY or YYYY-YY format
ALTER TABLE "public"."course_instructors"
  ADD CONSTRAINT "course_instructors_academic_year_check"
  CHECK ("academic_year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$') NOT VALID;

ALTER TABLE "public"."course_instructors" VALIDATE CONSTRAINT "course_instructors_academic_year_check";

-- Ensure course_code and instructor_name are not empty or blank strings
ALTER TABLE "public"."course_instructors"
  ADD CONSTRAINT "course_instructors_course_code_not_empty"
  CHECK (btrim("course_code") <> '') NOT VALID,
  ADD CONSTRAINT "course_instructors_instructor_name_not_empty"
  CHECK (btrim("instructor_name") <> '') NOT VALID;

ALTER TABLE "public"."course_instructors" VALIDATE CONSTRAINT "course_instructors_course_code_not_empty";
ALTER TABLE "public"."course_instructors" VALIDATE CONSTRAINT "course_instructors_instructor_name_not_empty";
