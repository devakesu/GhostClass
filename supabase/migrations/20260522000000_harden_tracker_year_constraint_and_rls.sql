-- Harden tracker table constraints and RLS to ensure uniformity and completeness.
--
-- This migration:
--   1. Enforces academic year format uniformity on tracker.year column matching other academic tables.
--   2. Adds complete RLS UPDATE policy on tracker table for authenticated users.

-- ============================================================================
-- 1. Enforce Academic Year Format Uniformity on tracker.year
-- ============================================================================

-- Ensure tracker.year strictly matches YYYY-YYYY or YYYY-YY format
ALTER TABLE "public"."tracker"
  ADD CONSTRAINT "tracker_year_check"
  CHECK ("year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$') NOT VALID;

ALTER TABLE "public"."tracker" VALIDATE CONSTRAINT "tracker_year_check";

-- ============================================================================
-- 2. Complete RLS UPDATE Policy on public.tracker
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own tracker" ON "public"."tracker";

CREATE POLICY "Users can update own tracker"
  ON "public"."tracker"
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
