-- Audit Hardening and Fixes
-- This migration addresses security bugs, missing constraints, and performance issues identified in the audit.

-- 1. REVOKE ANON ACCESS
-- New tables added in previous migrations should not have default grants for 'anon' role.
REVOKE ALL ON TABLE "public"."classes"            FROM "anon";
REVOKE ALL ON TABLE "public"."class_courses"      FROM "anon";
REVOKE ALL ON TABLE "public"."course_instructors" FROM "anon";
REVOKE ALL ON TABLE "public"."course_mappings"    FROM "anon";

-- 2. FIX RLS LOGIC IN CLASS_COURSES
-- Fixes self-comparison bug where class_courses.class_id was compared to itself instead of users.class_id.
DROP POLICY IF EXISTS "Users can add courses to their class" ON "public"."class_courses";
DROP POLICY IF EXISTS "Users can read courses in their class" ON "public"."class_courses";

CREATE POLICY "Users can add courses to their class"
ON "public"."class_courses"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  )
);

CREATE POLICY "Users can read courses in their class"
ON "public"."class_courses"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.class_id = class_courses.class_id
  )
);

-- 3. ADD MISSING SERVICE ROLE ACCESS
-- Ensure administrative operations are not blocked on course_instructors.
CREATE POLICY "Service Role Full Access"
ON "public"."course_instructors"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. RESTORE INTEGRITY CONSTRAINTS
-- Re-adding constraints that were dropped in 20260422130005_schema_corrections.sql.
ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID,
  ADD CONSTRAINT "class_courses_course_code_check"
  CHECK ("course_code" = upper(btrim("course_code")) AND "course_code" ~ '^[A-Z0-9]+$') NOT VALID;

ALTER TABLE "public"."course_instructors"
  ADD CONSTRAINT "course_instructors_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID,
  ADD CONSTRAINT "course_instructors_course_code_check"
  CHECK ("course_code" = upper(btrim("course_code")) AND "course_code" ~ '^[A-Z0-9]+$') NOT VALID;

ALTER TABLE "public"."tracker"
  ADD CONSTRAINT "tracker_semester_check"
  CHECK ("semester" IS NOT NULL AND "semester" IN ('odd', 'even')) NOT VALID,
  ADD CONSTRAINT "tracker_attendance_check"
  CHECK ("attendance" IN (110, 111, 112, 225)) NOT VALID;

ALTER TABLE "public"."user_settings"
  ADD CONSTRAINT "user_settings_target_percentage_check"
  CHECK ("target_percentage" IS NULL OR ("target_percentage" >= 1 AND "target_percentage" <= 100)) NOT VALID;

ALTER TABLE "public"."course_mappings"
  ADD CONSTRAINT "course_mappings_university_code_check"
  CHECK ("university_code" = upper(btrim("university_code")) AND "university_code" ~ '^[A-Z0-9]+$') NOT VALID;

-- Validate constraints (standard practice to avoid long locks on large tables)
ALTER TABLE "public"."class_courses" VALIDATE CONSTRAINT "class_courses_semester_check";
ALTER TABLE "public"."class_courses" VALIDATE CONSTRAINT "class_courses_course_code_check";
ALTER TABLE "public"."course_instructors" VALIDATE CONSTRAINT "course_instructors_semester_check";
ALTER TABLE "public"."course_instructors" VALIDATE CONSTRAINT "course_instructors_course_code_check";
ALTER TABLE "public"."tracker" VALIDATE CONSTRAINT "tracker_semester_check";
ALTER TABLE "public"."tracker" VALIDATE CONSTRAINT "tracker_attendance_check";
ALTER TABLE "public"."user_settings" VALIDATE CONSTRAINT "user_settings_target_percentage_check";
ALTER TABLE "public"."course_mappings" VALIDATE CONSTRAINT "course_mappings_university_code_check";

-- 5. HARDENED AUDIT LOG (REDACT PII)
-- Update audit_generic_changes to redact encrypted PII fields.
CREATE OR REPLACE FUNCTION public.audit_generic_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action         text;
  v_record_id      text;
  v_user_id        uuid;
  v_old_data       jsonb;
  v_new_data       jsonb;
  -- Keys to redact to prevent sensitive credential duplication and PII exposure in the audit log
  v_sensitive_keys text[] := ARRAY[
    'ezygo_token', 'ezygo_iv', 
    'auth_password', 'auth_password_iv',
    'phone', 'phone_iv',
    'gender', 'gender_iv',
    'birth_date', 'birth_date_iv'
  ];
  v_key            text;
BEGIN
  -- Determine operation and capture row snapshots
  IF TG_OP = 'DELETE' THEN
    v_action   := TG_TABLE_NAME || '.delete';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_user_id   := COALESCE((v_old_data->>'auth_user_id')::uuid, (v_old_data->>'auth_id')::uuid, (v_old_data->>'user_id')::uuid);
    v_record_id := COALESCE(v_old_data->>'id', v_old_data->>'auth_id', v_old_data->>'user_id');
  ELSIF TG_OP = 'INSERT' THEN
    v_action   := TG_TABLE_NAME || '.insert';
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_user_id   := COALESCE((v_new_data->>'auth_user_id')::uuid, (v_new_data->>'auth_id')::uuid, (v_new_data->>'user_id')::uuid);
    v_record_id := COALESCE(v_new_data->>'id', v_new_data->>'auth_id', v_new_data->>'user_id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action   := TG_TABLE_NAME || '.update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_user_id   := COALESCE((v_new_data->>'auth_user_id')::uuid, (v_new_data->>'auth_id')::uuid, (v_new_data->>'user_id')::uuid);
    v_record_id := COALESCE(v_new_data->>'id', v_new_data->>'auth_id', v_new_data->>'user_id');
  END IF;

  -- Redact sensitive keys from snapshots
  FOREACH v_key IN ARRAY v_sensitive_keys LOOP
    IF v_old_data ? v_key THEN v_old_data := v_old_data || jsonb_build_object(v_key, '[REDACTED]'); END IF;
    IF v_new_data ? v_key THEN v_new_data := v_new_data || jsonb_build_object(v_key, '[REDACTED]'); END IF;
  END LOOP;

  -- Always exclude the user linkage IDs from the payload to avoid redundancy
  IF v_old_data IS NOT NULL THEN v_old_data := v_old_data - 'auth_user_id' - 'auth_id' - 'user_id'; END IF;
  IF v_new_data IS NOT NULL THEN v_new_data := v_new_data - 'auth_user_id' - 'auth_id' - 'user_id'; END IF;

  -- Write to audit_log
  BEGIN
    INSERT INTO public.audit_log (auth_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, v_action, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[audit_generic_changes] Could not write audit entry: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- 6. PERFORMANCE OPTIMIZATION
-- Add indexes for course lookups which are frequent during synchronization and mapping.
CREATE INDEX IF NOT EXISTS "idx_course_mappings_university_code" ON "public"."course_mappings" ("university_code");
CREATE INDEX IF NOT EXISTS "idx_course_mappings_course_name" ON "public"."course_mappings" ("course_name");
