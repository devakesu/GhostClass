-- Classes, shared courses, and audit system.

-- 1. Classes table
CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "external_group_id" BIGINT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Class Courses table
CREATE TABLE IF NOT EXISTS "public"."class_courses" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "class_id" UUID NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
    "course_code" TEXT NOT NULL,
    "course_name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "academic_year" TEXT,
    "semester" TEXT,
    CONSTRAINT "unique_class_course_context" UNIQUE ("class_id", "course_code", "academic_year", "semester")
);

-- 3. Course Instructors table
CREATE TABLE IF NOT EXISTS "public"."course_instructors" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "class_id" UUID NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
    "course_code" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "instructor_name" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updated_by" UUID,
    CONSTRAINT "unique_class_course_term" UNIQUE ("class_id", "course_code", "semester", "academic_year")
);

-- 4. Course Mappings table
CREATE TABLE IF NOT EXISTS "public"."course_mappings" (
    "ezygo_id" BIGINT NOT NULL PRIMARY KEY,
    "university_code" TEXT NOT NULL,
    "course_name" TEXT,
    "last_seen_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Audit Generic Changes function
CREATE OR REPLACE FUNCTION "public"."audit_generic_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action         text;
  v_record_id      text;
  v_user_id        uuid;
  v_old_data       jsonb;
  v_new_data       jsonb;
  v_sensitive_keys text[] := ARRAY['ezygo_token', 'ezygo_iv', 'auth_password', 'auth_password_iv'];
  v_key            text;
BEGIN
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

  FOREACH v_key IN ARRAY v_sensitive_keys LOOP
    IF v_old_data ? v_key THEN v_old_data := v_old_data || jsonb_build_object(v_key, '[REDACTED]'); END IF;
    IF v_new_data ? v_key THEN v_new_data := v_new_data || jsonb_build_object(v_key, '[REDACTED]'); END IF;
  END LOOP;

  IF v_old_data IS NOT NULL THEN v_old_data := v_old_data - 'auth_user_id' - 'auth_id' - 'user_id'; END IF;
  IF v_new_data IS NOT NULL THEN v_new_data := v_new_data - 'auth_user_id' - 'auth_id' - 'user_id'; END IF;

  BEGIN
    INSERT INTO public.audit_log (auth_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, v_action, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[audit_generic_changes] Could not write audit entry: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 6. Attach triggers to existing tables
CREATE OR REPLACE TRIGGER "audit_tracker_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."tracker" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();
CREATE OR REPLACE TRIGGER "audit_user_settings_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();
CREATE OR REPLACE TRIGGER "audit_users_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();
