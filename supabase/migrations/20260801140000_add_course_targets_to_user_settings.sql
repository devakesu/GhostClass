-- Add course_targets JSONB column to public.user_settings
ALTER TABLE "public"."user_settings"
ADD COLUMN IF NOT EXISTS "course_targets" jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN "public"."user_settings"."course_targets" IS 'Course-specific target attendance percentages. Schema: { "CS101": 85, "GXEST204": 80 }';
