-- Enforce strict semester values while keeping legacy rows readable.
--
-- This migration:
--   1. Normalizes common historical semester variants to `odd` / `even`.
--   2. Adds CHECK constraints for future writes without blocking existing rows.
--   3. Adds the missing UPDATE policy on class_courses so upserts work through RLS.
--   4. Adds term-scoped indexes for the primary lookup patterns.
--   5. Documents the semester columns that are part of the academic model.

-- ============================================================================
-- 1. Normalize known semester aliases in existing rows
-- ============================================================================

UPDATE "public"."class_courses"
SET "semester" = CASE
  WHEN lower(btrim("semester")) LIKE '%odd%' OR lower(btrim("semester")) = '1' THEN 'odd'
  WHEN lower(btrim("semester")) LIKE '%even%' OR lower(btrim("semester")) = '2' THEN 'even'
  ELSE "semester"
END
WHERE "semester" IS NOT NULL;

UPDATE "public"."course_instructors"
SET "semester" = CASE
  WHEN lower(btrim("semester")) LIKE '%odd%' OR lower(btrim("semester")) = '1' THEN 'odd'
  WHEN lower(btrim("semester")) LIKE '%even%' OR lower(btrim("semester")) = '2' THEN 'even'
  ELSE "semester"
END
WHERE "semester" IS NOT NULL;

UPDATE "public"."tracker"
SET "semester" = CASE
  WHEN lower(btrim("semester")) LIKE '%odd%' OR lower(btrim("semester")) = '1' THEN 'odd'
  WHEN lower(btrim("semester")) LIKE '%even%' OR lower(btrim("semester")) = '2' THEN 'even'
  ELSE "semester"
END
WHERE "semester" IS NOT NULL;

-- ============================================================================
-- 2. Add semester integrity constraints for new writes
-- ============================================================================

ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID;

ALTER TABLE "public"."course_instructors"
  ADD CONSTRAINT "course_instructors_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID;

ALTER TABLE "public"."tracker"
  ADD CONSTRAINT "tracker_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID;

-- ============================================================================
-- 3. Add term-scoped indexes for lookup performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_class_courses_class_term"
  ON "public"."class_courses" USING btree ("class_id", "academic_year", "semester");

CREATE INDEX IF NOT EXISTS "idx_course_instructors_class_term"
  ON "public"."course_instructors" USING btree ("class_id", "academic_year", "semester");

-- ============================================================================
-- 4. RLS: allow authenticated users to upsert class courses in their class
-- ============================================================================

DROP POLICY IF EXISTS "Users can update courses in their class" ON "public"."class_courses";

CREATE POLICY "Users can update courses in their class"
  ON "public"."class_courses"
  FOR UPDATE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE auth_id = auth.uid()
        AND class_id = class_courses.class_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE auth_id = auth.uid()
        AND class_id = class_courses.class_id
    )
  );

-- ============================================================================
-- 5. Document academic-term columns
-- ============================================================================

COMMENT ON COLUMN "public"."tracker"."semester" IS 'The academic semester (odd/even) for the tracker entry';
COMMENT ON COLUMN "public"."course_instructors"."semester" IS 'The academic semester (odd/even) for the instructor mapping';

-- ============================================================================
-- 6. Additional bounded-value checks for long-term data integrity
-- ============================================================================

ALTER TABLE "public"."user_settings"
  ADD CONSTRAINT "user_settings_target_percentage_check"
  CHECK ("target_percentage" IS NULL OR ("target_percentage" >= 1 AND "target_percentage" <= 100)) NOT VALID;

ALTER TABLE "public"."tracker"
  ADD CONSTRAINT "tracker_attendance_check"
  CHECK ("attendance" IN (110, 111, 112, 225)) NOT VALID;

ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_course_code_check"
  CHECK ("course_code" = upper(btrim("course_code")) AND "course_code" ~ '^[A-Z0-9]+$') NOT VALID;

ALTER TABLE "public"."course_instructors"
  ADD CONSTRAINT "course_instructors_course_code_check"
  CHECK ("course_code" = upper(btrim("course_code")) AND "course_code" ~ '^[A-Z0-9]+$') NOT VALID;

ALTER TABLE "public"."course_mappings"
  ADD CONSTRAINT "course_mappings_university_code_check"
  CHECK ("university_code" = upper(btrim("university_code")) AND "university_code" ~ '^[A-Z0-9]+$') NOT VALID;