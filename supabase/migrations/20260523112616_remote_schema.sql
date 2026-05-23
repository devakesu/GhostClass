


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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
  -- Keys to redact to prevent sensitive credential duplication and PII exposure in the audit log
  v_sensitive_keys text[] := ARRAY[
    'ezygo_token', 'ezygo_iv', 
    'auth_password', 'auth_password_iv',
    'phone', 'phone_iv',
    'gender', 'gender_iv',
    'birth_date', 'birth_date_iv',
    'fcm_token'
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
$$;


ALTER FUNCTION "public"."audit_generic_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_225_attendance_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  attendance_225_count INTEGER;
BEGIN
  -- Only check if attendance is 225
  IF NEW.attendance != 225 THEN
    RETURN NEW;
  END IF;

  -- Count existing 225 attendance records for this course in this semester/year
  SELECT COUNT(*)
  INTO attendance_225_count
  FROM public.tracker
  WHERE auth_user_id = NEW.auth_user_id
    AND course = NEW.course
    AND semester = NEW.semester
    AND year = NEW.year
    AND attendance = 225
    AND id != COALESCE(NEW.id, 0); -- Exclude current record for updates

  -- Enforce limit
  IF attendance_225_count >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 Duty Leaves exceeded for course: %', NEW.course
      USING HINT = 'Only 5 duty leaves allowed per semester per course';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_225_attendance_limit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_225_attendance_limit"() IS 'Enforces maximum 5 DLs per semester per course';



CREATE OR REPLACE FUNCTION "public"."delete_user_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  requesting_user_id uuid;
  v_tracker_count    integer;
BEGIN
  requesting_user_id := auth.uid();

  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Snapshot how many tracker records will be wiped (included in the audit payload)
  SELECT count(*)
    INTO v_tracker_count
    FROM public.tracker
   WHERE auth_user_id = requesting_user_id;

  -- Write audit entry BEFORE deleting rows so the user ID is still valid in the log
  BEGIN
    INSERT INTO public.audit_log (
      auth_user_id,
      action,
      table_name,
      record_id,
      new_data
    ) VALUES (
      requesting_user_id,
      'account.delete',
      'users',
      requesting_user_id::text,
      jsonb_build_object(
        'tracker_records_deleted', v_tracker_count,
        'initiated_by',            'user'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit failure must not prevent the deletion the user requested
    RAISE WARNING '[delete_user_account] Could not write audit entry: %', SQLERRM;
  END;

  -- NOTE: Storage objects (e.g. avatars) are deleted client-side via the
  -- Supabase Storage JS API before this function is invoked.

  -- 1. Delete from public tables (order matters due to foreign keys)
  DELETE FROM public.tracker       WHERE auth_user_id = requesting_user_id;
  DELETE FROM public.notification  WHERE auth_user_id = requesting_user_id;
  DELETE FROM public.user_settings WHERE user_id      = requesting_user_id;

  -- 2. Delete the public profile
  DELETE FROM public.users WHERE auth_id = requesting_user_id;

  -- 3. Finally, delete the auth user itself
  DELETE FROM auth.users WHERE id = requesting_user_id;
END;
$$;


ALTER FUNCTION "public"."delete_user_account"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_user_account"() IS 'Deletes the calling user''s account and all associated data after writing an audit_log entry.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "auth_user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Append-only structured audit trail for sensitive data mutations (tracker changes, account deletion).';



COMMENT ON COLUMN "public"."audit_log"."auth_user_id" IS 'auth.users.id of the actor. No FK constraint — entry must survive account deletion.';



COMMENT ON COLUMN "public"."audit_log"."action" IS 'Dot-separated action name: <table>.<operation>  e.g. tracker.insert, account.delete';



COMMENT ON COLUMN "public"."audit_log"."old_data" IS 'JSONB snapshot of the row BEFORE the mutation (populated for UPDATE and DELETE).';



COMMENT ON COLUMN "public"."audit_log"."new_data" IS 'JSONB snapshot of the row AFTER the mutation (populated for INSERT and UPDATE).';



ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."class_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "course_code" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "academic_year" "text",
    "semester" "text",
    CONSTRAINT "class_courses_academic_year_check" CHECK ((("academic_year" IS NOT NULL) AND ("academic_year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$'::"text"))),
    CONSTRAINT "class_courses_course_code_check" CHECK ((("course_code" = "upper"("btrim"("course_code"))) AND ("course_code" ~ '^[A-Z0-9]+$'::"text"))),
    CONSTRAINT "class_courses_course_code_not_empty" CHECK (("btrim"("course_code") <> ''::"text")),
    CONSTRAINT "class_courses_course_name_not_empty" CHECK (("btrim"("course_name") <> ''::"text")),
    CONSTRAINT "class_courses_semester_check" CHECK ((("semester" IS NOT NULL) AND ("semester" = ANY (ARRAY['odd'::"text", 'even'::"text"]))))
);


ALTER TABLE "public"."class_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_group_id" "text",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "programme_config_group_id" bigint,
    "sem" "text",
    "year" "text"
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."classes"."external_group_id" IS 'Stable section/division-level ID (e.g. "709-B" or "manual-computerscience-b"). Enables division-specific isolation for custom courses and instructor names.';



CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_messages" IS 'Stores Contact Messages';



CREATE TABLE IF NOT EXISTS "public"."course_instructors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "course_code" "text" NOT NULL,
    "semester" "text" NOT NULL,
    "academic_year" "text" NOT NULL,
    "instructor_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "course_instructors_academic_year_check" CHECK ((("academic_year" IS NOT NULL) AND ("academic_year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$'::"text"))),
    CONSTRAINT "course_instructors_course_code_check" CHECK ((("course_code" = "upper"("btrim"("course_code"))) AND ("course_code" ~ '^[A-Z0-9]+$'::"text"))),
    CONSTRAINT "course_instructors_course_code_not_empty" CHECK (("btrim"("course_code") <> ''::"text")),
    CONSTRAINT "course_instructors_instructor_name_not_empty" CHECK (("btrim"("instructor_name") <> ''::"text")),
    CONSTRAINT "course_instructors_semester_check" CHECK ((("semester" IS NOT NULL) AND ("semester" = ANY (ARRAY['odd'::"text", 'even'::"text"]))))
);


ALTER TABLE "public"."course_instructors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."course_instructors"."semester" IS 'The academic semester (odd/even) for the instructor mapping';



CREATE TABLE IF NOT EXISTS "public"."course_mappings" (
    "ezygo_id" bigint NOT NULL,
    "university_code" "text" NOT NULL,
    "course_name" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_mappings_university_code_check" CHECK ((("university_code" = "upper"("btrim"("university_code"))) AND ("university_code" ~ '^[A-Z0-9]+$'::"text")))
);


ALTER TABLE "public"."course_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "topic" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "auth_user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."notification" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification" IS 'Stores User Notifications';



ALTER TABLE "public"."notification" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notification_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tracker" (
    "id" bigint NOT NULL,
    "course" "text" NOT NULL,
    "date" "date" NOT NULL,
    "session" "text" NOT NULL,
    "semester" "text" NOT NULL,
    "year" "text" NOT NULL,
    "status" "text" DEFAULT 'correction'::"text" NOT NULL,
    "attendance" numeric DEFAULT '110'::numeric NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    CONSTRAINT "tracker_attendance_check" CHECK (("attendance" = ANY (ARRAY[(110)::numeric, (111)::numeric, (112)::numeric, (225)::numeric]))),
    CONSTRAINT "tracker_semester_check" CHECK ((("semester" IS NOT NULL) AND ("semester" = ANY (ARRAY['odd'::"text", 'even'::"text"])))),
    CONSTRAINT "tracker_status_check" CHECK (("status" = ANY (ARRAY['correction'::"text", 'extra'::"text"]))),
    CONSTRAINT "tracker_year_check" CHECK (("year" ~ '^[0-9]{4}-([0-9]{4}|[0-9]{2})$'::"text"))
);


ALTER TABLE "public"."tracker" OWNER TO "postgres";


COMMENT ON TABLE "public"."tracker" IS 'Stores User-added Attendance Tracking Records';



COMMENT ON COLUMN "public"."tracker"."semester" IS 'The academic semester (odd/even) for the tracker entry';



ALTER TABLE "public"."tracker" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tracker_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "bunk_calculator_enabled" boolean DEFAULT true,
    "target_percentage" integer DEFAULT 75,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "disabled_courses" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "user_settings_target_percentage_check" CHECK ((("target_percentage" IS NULL) OR (("target_percentage" >= 1) AND ("target_percentage" <= 100))))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_settings" IS 'Stores User Settings';



COMMENT ON COLUMN "public"."user_settings"."disabled_courses" IS 'Per-semester map of disabled course codes and their reasons. Schema: { "year-sem": { "courseCode": "reason" } }';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" bigint NOT NULL,
    "username" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "first_name" "text",
    "last_name" "text",
    "birth_date" "text",
    "gender" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ezygo_token" "text",
    "ezygo_iv" "text",
    "last_synced_at" timestamp with time zone,
    "auth_id" "uuid",
    "terms_accepted_at" timestamp with time zone,
    "terms_version" "text",
    "auth_password" "text",
    "auth_password_iv" "text",
    "birth_date_iv" "text",
    "gender_iv" "text",
    "phone_iv" "text",
    "class_id" "uuid",
    "ezygo_created_at" timestamp with time zone,
    "fcm_token" "text",
    "has_mobile_app" boolean DEFAULT false NOT NULL,
    CONSTRAINT "check_auth_password_consistency" CHECK (((("auth_password" IS NULL) AND ("auth_password_iv" IS NULL)) OR (("auth_password" IS NOT NULL) AND ("auth_password_iv" IS NOT NULL)))),
    CONSTRAINT "check_auth_password_iv_format" CHECK ((("auth_password_iv" IS NULL) OR ("auth_password_iv" ~* '^[a-f0-9]{24}$'::"text"))),
    CONSTRAINT "check_auth_password_iv_not_empty" CHECK ((("auth_password_iv" IS NULL) OR ("auth_password_iv" <> ''::"text"))),
    CONSTRAINT "check_auth_password_not_empty" CHECK ((("auth_password" IS NULL) OR ("auth_password" <> ''::"text"))),
    CONSTRAINT "check_birth_date_consistency" CHECK (((("birth_date" IS NULL) AND ("birth_date_iv" IS NULL)) OR (("birth_date" IS NOT NULL) AND ("birth_date_iv" IS NOT NULL)))),
    CONSTRAINT "check_birth_date_iv_format" CHECK ((("birth_date_iv" IS NULL) OR ("birth_date_iv" ~* '^[a-f0-9]{24}$'::"text"))),
    CONSTRAINT "check_birth_date_iv_not_empty" CHECK ((("birth_date_iv" IS NULL) OR ("birth_date_iv" <> ''::"text"))),
    CONSTRAINT "check_birth_date_not_empty" CHECK ((("birth_date" IS NULL) OR ("birth_date" <> ''::"text"))),
    CONSTRAINT "check_ezygo_iv_format" CHECK ((("ezygo_iv" IS NULL) OR ("ezygo_iv" ~* '^[a-f0-9]{24}$'::"text"))),
    CONSTRAINT "check_gender_consistency" CHECK (((("gender" IS NULL) AND ("gender_iv" IS NULL)) OR (("gender" IS NOT NULL) AND ("gender_iv" IS NOT NULL)))),
    CONSTRAINT "check_gender_iv_format" CHECK ((("gender_iv" IS NULL) OR ("gender_iv" ~* '^[a-f0-9]{24}$'::"text"))),
    CONSTRAINT "check_gender_iv_not_empty" CHECK ((("gender_iv" IS NULL) OR ("gender_iv" <> ''::"text"))),
    CONSTRAINT "check_gender_not_empty" CHECK ((("gender" IS NULL) OR ("gender" <> ''::"text"))),
    CONSTRAINT "check_phone_consistency" CHECK (((("phone" IS NULL) AND ("phone_iv" IS NULL)) OR (("phone" IS NOT NULL) AND ("phone_iv" IS NOT NULL)))),
    CONSTRAINT "check_phone_iv_format" CHECK ((("phone_iv" IS NULL) OR ("phone_iv" ~* '^[a-f0-9]{24}$'::"text"))),
    CONSTRAINT "check_phone_iv_not_empty" CHECK ((("phone_iv" IS NULL) OR ("phone_iv" <> ''::"text"))),
    CONSTRAINT "check_phone_not_empty" CHECK ((("phone" IS NULL) OR ("phone" <> ''::"text")))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Stores User Information';



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_courses"
    ADD CONSTRAINT "class_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_instructors"
    ADD CONSTRAINT "course_instructors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_mappings"
    ADD CONSTRAINT "course_mappings_pkey" PRIMARY KEY ("ezygo_id");



ALTER TABLE ONLY "public"."notification"
    ADD CONSTRAINT "notification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker"
    ADD CONSTRAINT "tracker_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker"
    ADD CONSTRAINT "unique_attendance_slot" UNIQUE ("auth_user_id", "course", "date", "session");



ALTER TABLE ONLY "public"."class_courses"
    ADD CONSTRAINT "unique_class_course_context" UNIQUE ("class_id", "course_code", "academic_year", "semester");



ALTER TABLE ONLY "public"."course_instructors"
    ADD CONSTRAINT "unique_class_course_term" UNIQUE ("class_id", "course_code", "semester", "academic_year");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE UNIQUE INDEX "classes_lookup_idx" ON "public"."classes" USING "btree" ("programme_config_group_id", "sem", "year", "name");



CREATE INDEX "idx_audit_log_action_created" ON "public"."audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_audit_log_user_created" ON "public"."audit_log" USING "btree" ("auth_user_id", "created_at" DESC);



CREATE INDEX "idx_contact_created" ON "public"."contact_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contact_messages_user" ON "public"."contact_messages" USING "btree" ("user_id");



CREATE INDEX "idx_contact_status_created" ON "public"."contact_messages" USING "btree" ("status", "created_at" DESC);



COMMENT ON INDEX "public"."idx_contact_status_created" IS 'Speeds up admin queries for filtering contact messages by status';



CREATE INDEX "idx_course_mappings_course_name" ON "public"."course_mappings" USING "btree" ("course_name");



CREATE INDEX "idx_course_mappings_university_code" ON "public"."course_mappings" USING "btree" ("university_code");



CREATE INDEX "idx_notification_topic_unread" ON "public"."notification" USING "btree" ("auth_user_id", "topic", "is_read", "created_at" DESC) WHERE ("is_read" = false);



COMMENT ON INDEX "public"."idx_notification_topic_unread" IS 'Optimizes queries for unread notification counts grouped by topic';



CREATE INDEX "idx_notification_unread" ON "public"."notification" USING "btree" ("auth_user_id", "created_at" DESC) WHERE ("is_read" = false);



COMMENT ON INDEX "public"."idx_notification_unread" IS 'Optimizes queries for unread notifications (most common use case)';



CREATE INDEX "idx_notification_user_read_created" ON "public"."notification" USING "btree" ("auth_user_id", "is_read", "created_at" DESC);



COMMENT ON INDEX "public"."idx_notification_user_read_created" IS 'Optimizes queries for all notifications with read status filter';



CREATE INDEX "idx_tracker_course_date" ON "public"."tracker" USING "btree" ("course", "date" DESC) WHERE ("auth_user_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_tracker_course_date" IS 'Improves performance for course-specific attendance history queries';



CREATE INDEX "idx_tracker_date" ON "public"."tracker" USING "btree" ("date" DESC) WHERE ("status" IS NOT NULL);



CREATE INDEX "idx_tracker_semester_year" ON "public"."tracker" USING "btree" ("auth_user_id", "semester", "year", "date" DESC);



COMMENT ON INDEX "public"."idx_tracker_semester_year" IS 'Enables fast filtering of tracker records by academic semester and year';



CREATE INDEX "idx_tracker_user_status" ON "public"."tracker" USING "btree" ("auth_user_id", "status");



COMMENT ON INDEX "public"."idx_tracker_user_status" IS 'Optimizes queries filtering tracker records by user and status (correction/extra)';



CREATE INDEX "idx_user_settings_target" ON "public"."user_settings" USING "btree" ("target_percentage", "bunk_calculator_enabled");



COMMENT ON INDEX "public"."idx_user_settings_target" IS 'Enables analytics queries on user preference distributions';



CREATE INDEX "idx_users_auth_email" ON "public"."users" USING "btree" ("auth_id", "email") WHERE ("auth_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_users_auth_email" IS 'Speeds up user lookups by auth_id with email joins';



CREATE INDEX "idx_users_auth_id" ON "public"."users" USING "btree" ("auth_id");



CREATE INDEX "idx_users_class_id" ON "public"."users" USING "btree" ("class_id");



CREATE INDEX "idx_users_sync_priority" ON "public"."users" USING "btree" ("last_synced_at" NULLS FIRST) WHERE ("ezygo_token" IS NOT NULL);



COMMENT ON INDEX "public"."idx_users_sync_priority" IS 'Optimizes cron sync queries that order by last_synced_at for users with tokens';



CREATE INDEX "users_auth_password_idx" ON "public"."users" USING "btree" ("auth_password");



CREATE INDEX "users_auth_password_iv_idx" ON "public"."users" USING "btree" ("auth_password_iv");



CREATE INDEX "users_avatar_url_idx" ON "public"."users" USING "btree" ("avatar_url");



CREATE INDEX "users_birth_date_idx" ON "public"."users" USING "btree" ("birth_date");



CREATE INDEX "users_birth_date_iv_idx" ON "public"."users" USING "btree" ("birth_date_iv");



CREATE INDEX "users_created_at_idx" ON "public"."users" USING "btree" ("created_at");



CREATE INDEX "users_ezygo_iv_idx" ON "public"."users" USING "btree" ("ezygo_iv");



CREATE INDEX "users_ezygo_token_idx" ON "public"."users" USING "btree" ("ezygo_token");



CREATE INDEX "users_first_name_idx" ON "public"."users" USING "btree" ("first_name");



CREATE INDEX "users_gender_idx" ON "public"."users" USING "btree" ("gender");



CREATE INDEX "users_gender_iv_idx" ON "public"."users" USING "btree" ("gender_iv");



CREATE INDEX "users_last_name_idx" ON "public"."users" USING "btree" ("last_name");



CREATE INDEX "users_last_synced_at_idx" ON "public"."users" USING "btree" ("last_synced_at");



CREATE INDEX "users_phone_idx" ON "public"."users" USING "btree" ("phone");



CREATE INDEX "users_phone_iv_idx" ON "public"."users" USING "btree" ("phone_iv");



CREATE INDEX "users_terms_accepted_at_idx" ON "public"."users" USING "btree" ("terms_accepted_at");



CREATE INDEX "users_terms_version_idx" ON "public"."users" USING "btree" ("terms_version");



CREATE INDEX "users_updated_at_idx" ON "public"."users" USING "btree" ("updated_at");



CREATE OR REPLACE TRIGGER "audit_tracker_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."tracker" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();



CREATE OR REPLACE TRIGGER "audit_user_settings_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();



CREATE OR REPLACE TRIGGER "audit_users_mutations" AFTER INSERT OR DELETE OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_generic_changes"();



CREATE OR REPLACE TRIGGER "enforce_225_attendance_limit" BEFORE INSERT OR UPDATE ON "public"."tracker" FOR EACH ROW WHEN (("new"."attendance" = (225)::numeric)) EXECUTE FUNCTION "public"."check_225_attendance_limit"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."course_instructors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."class_courses"
    ADD CONSTRAINT "class_courses_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_courses"
    ADD CONSTRAINT "class_courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_instructors"
    ADD CONSTRAINT "course_instructors_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_instructors"
    ADD CONSTRAINT "course_instructors_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification"
    ADD CONSTRAINT "notification_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tracker"
    ADD CONSTRAINT "tracker_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



CREATE POLICY "Anyone can insert contact messages" ON "public"."contact_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can read classes" ON "public"."classes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read mappings" ON "public"."course_mappings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Service Role Full Access" ON "public"."class_courses" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."classes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."course_instructors" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."course_mappings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."notification" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."tracker" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."user_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service Role Full Access" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can add courses to their class" ON "public"."class_courses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "class_courses"."class_id")))));



CREATE POLICY "Users can delete own tracker" ON "public"."tracker" FOR DELETE USING (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can edit instructors in their class" ON "public"."course_instructors" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "course_instructors"."class_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "course_instructors"."class_id")))));



CREATE POLICY "Users can insert own notifications" ON "public"."notification" FOR INSERT WITH CHECK (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own settings" ON "public"."user_settings" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own tracker" ON "public"."tracker" FOR INSERT WITH CHECK (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can read courses in their class" ON "public"."class_courses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "class_courses"."class_id")))));



CREATE POLICY "Users can read instructors in their class" ON "public"."course_instructors" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "course_instructors"."class_id")))));



CREATE POLICY "Users can read own notification" ON "public"."notification" FOR SELECT USING (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can read own profile" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can read own tracker" ON "public"."tracker" FOR SELECT USING (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can see own messages" ON "public"."contact_messages" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update courses in their class" ON "public"."class_courses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "class_courses"."class_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."class_id" = "class_courses"."class_id")))));



CREATE POLICY "Users can update own notifications" ON "public"."notification" FOR UPDATE USING (("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("auth_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own settings" ON "public"."user_settings" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own tracker" ON "public"."tracker" FOR UPDATE TO "authenticated" USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own settings" ON "public"."user_settings" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_no_access" ON "public"."audit_log" AS RESTRICTIVE USING (false);



ALTER TABLE "public"."class_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_instructors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracker" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."audit_generic_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_generic_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_generic_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_225_attendance_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_225_attendance_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_225_attendance_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."class_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."class_courses" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";
GRANT INSERT ON TABLE "public"."contact_messages" TO "anon";



GRANT ALL ON TABLE "public"."course_instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."course_instructors" TO "service_role";



GRANT ALL ON TABLE "public"."course_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."course_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."notification" TO "authenticated";
GRANT ALL ON TABLE "public"."notification" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notification_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notification_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tracker" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tracker_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tracker_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke delete on table "public"."audit_log" from "anon";

revoke insert on table "public"."audit_log" from "anon";

revoke references on table "public"."audit_log" from "anon";

revoke select on table "public"."audit_log" from "anon";

revoke trigger on table "public"."audit_log" from "anon";

revoke truncate on table "public"."audit_log" from "anon";

revoke update on table "public"."audit_log" from "anon";

revoke delete on table "public"."audit_log" from "authenticated";

revoke insert on table "public"."audit_log" from "authenticated";

revoke references on table "public"."audit_log" from "authenticated";

revoke select on table "public"."audit_log" from "authenticated";

revoke trigger on table "public"."audit_log" from "authenticated";

revoke truncate on table "public"."audit_log" from "authenticated";

revoke update on table "public"."audit_log" from "authenticated";

revoke delete on table "public"."class_courses" from "anon";

revoke insert on table "public"."class_courses" from "anon";

revoke references on table "public"."class_courses" from "anon";

revoke select on table "public"."class_courses" from "anon";

revoke trigger on table "public"."class_courses" from "anon";

revoke truncate on table "public"."class_courses" from "anon";

revoke update on table "public"."class_courses" from "anon";

revoke delete on table "public"."classes" from "anon";

revoke insert on table "public"."classes" from "anon";

revoke references on table "public"."classes" from "anon";

revoke select on table "public"."classes" from "anon";

revoke trigger on table "public"."classes" from "anon";

revoke truncate on table "public"."classes" from "anon";

revoke update on table "public"."classes" from "anon";

revoke delete on table "public"."contact_messages" from "anon";

revoke references on table "public"."contact_messages" from "anon";

revoke select on table "public"."contact_messages" from "anon";

revoke trigger on table "public"."contact_messages" from "anon";

revoke truncate on table "public"."contact_messages" from "anon";

revoke update on table "public"."contact_messages" from "anon";

revoke delete on table "public"."course_instructors" from "anon";

revoke insert on table "public"."course_instructors" from "anon";

revoke references on table "public"."course_instructors" from "anon";

revoke select on table "public"."course_instructors" from "anon";

revoke trigger on table "public"."course_instructors" from "anon";

revoke truncate on table "public"."course_instructors" from "anon";

revoke update on table "public"."course_instructors" from "anon";

revoke delete on table "public"."course_mappings" from "anon";

revoke insert on table "public"."course_mappings" from "anon";

revoke references on table "public"."course_mappings" from "anon";

revoke select on table "public"."course_mappings" from "anon";

revoke trigger on table "public"."course_mappings" from "anon";

revoke truncate on table "public"."course_mappings" from "anon";

revoke update on table "public"."course_mappings" from "anon";

revoke delete on table "public"."notification" from "anon";

revoke insert on table "public"."notification" from "anon";

revoke references on table "public"."notification" from "anon";

revoke select on table "public"."notification" from "anon";

revoke trigger on table "public"."notification" from "anon";

revoke truncate on table "public"."notification" from "anon";

revoke update on table "public"."notification" from "anon";

revoke delete on table "public"."tracker" from "anon";

revoke insert on table "public"."tracker" from "anon";

revoke references on table "public"."tracker" from "anon";

revoke select on table "public"."tracker" from "anon";

revoke trigger on table "public"."tracker" from "anon";

revoke truncate on table "public"."tracker" from "anon";

revoke update on table "public"."tracker" from "anon";

revoke delete on table "public"."user_settings" from "anon";

revoke insert on table "public"."user_settings" from "anon";

revoke references on table "public"."user_settings" from "anon";

revoke select on table "public"."user_settings" from "anon";

revoke trigger on table "public"."user_settings" from "anon";

revoke truncate on table "public"."user_settings" from "anon";

revoke update on table "public"."user_settings" from "anon";

revoke delete on table "public"."users" from "anon";

revoke insert on table "public"."users" from "anon";

revoke references on table "public"."users" from "anon";

revoke select on table "public"."users" from "anon";

revoke trigger on table "public"."users" from "anon";

revoke truncate on table "public"."users" from "anon";

revoke update on table "public"."users" from "anon";


  create policy "Authenticated User Upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Public Read Access"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "User Delete Own File"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND (owner = auth.uid())));



  create policy "User Update Own File"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND (owner = auth.uid())));



