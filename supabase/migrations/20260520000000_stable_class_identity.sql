-- Stable class identity: use programme_config_group_id instead of usersubgroup.id.
--
-- Background:
--   classes.external_group_id was previously set to usersubgroup.id, which is
--   semester-scoped (EzyGo creates a new usersubgroup for every new term).
--   When an admin initialises a new semester, the sync upserted a brand-new
--   classes row, shifting users' class_id and orphaning all manually-added
--   class_courses from the previous term.
--
-- Fix:
--   Switch to programme_config_group_id (still a BIGINT — no type change needed).
--   Two real EzyGo responses for the same cohort across S1 (odd) and S2 (even)
--   confirmed programme_config_group_id = 710 in both, while usersubgroup.id
--   changed from 9888 → 11509 and the admin-set name changed from
--   "CU12025-2029" → "CB2 2025-2029". programme_config_group_id is stable.
--   Fallback: if the field is absent, sync.ts falls back to usergroup.id.
--
-- This migration also fixes a pre-existing RLS bug on class_courses where the
-- policy condition compared a column to itself (always true), making the table
-- effectively world-readable to all authenticated users.

-- ============================================================================
-- 1. Fix RLS on class_courses — replace self-referential no-op condition
-- ============================================================================

DROP POLICY IF EXISTS "Users can read courses in their class" ON public.class_courses;
DROP POLICY IF EXISTS "Users can add courses to their class"  ON public.class_courses;
-- Also drop the update policy if it was re-added elsewhere, to recreate cleanly
DROP POLICY IF EXISTS "Users can update courses in their class" ON public.class_courses;

CREATE POLICY "Users can read courses in their class"
  ON public.class_courses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  ));

CREATE POLICY "Users can add courses to their class"
  ON public.class_courses
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  ));

CREATE POLICY "Users can update courses in their class"
  ON public.class_courses
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  ));

-- ============================================================================
-- 2. Document the identity change on the classes table
--    (No schema type change: external_group_id stays BIGINT)
-- ============================================================================

COMMENT ON COLUMN public.classes.external_group_id IS
  'Stable section-level ID from EzyGo (usersubgroup.programme_config_group_id). '
  'Falls back to usersubgroup.usergroup.id (programme-level) if the field is absent. '
  'Confirmed stable across consecutive semesters for the same student cohort. '
  'Previously used usersubgroup.id which was semester-scoped and orphaned '
  'class_courses on every new-term initialisation by the admin.';

-- ============================================================================
-- 3. One-time orphan cleanup helper (run manually after all users re-sync)
--    Do NOT run this immediately — wait for the rollout window to pass.
--
-- DELETE FROM public.classes
-- WHERE id NOT IN (
--   SELECT DISTINCT class_id FROM public.users WHERE class_id IS NOT NULL
-- );
-- ============================================================================
