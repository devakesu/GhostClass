-- Add disabled_courses JSONB column to user_settings
-- Schema: { "year-sem": { "courseCode": "reason" } }
-- Example: { "2025-2026-even": { "GXEST204": "Challenge passed" } }
-- NOT NULL with DEFAULT '{}' so all rows always have a valid map; no NULL checks needed in application code.

ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "disabled_courses" jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN "public"."user_settings"."disabled_courses"
  IS 'Per-semester map of disabled course codes and their reasons. Schema: { "year-sem": { "courseCode": "reason" } }';
