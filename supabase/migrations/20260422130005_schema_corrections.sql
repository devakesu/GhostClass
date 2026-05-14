drop policy "Users can update courses in their class" on "public"."class_courses";

ALTER TABLE "public"."class_courses" DROP CONSTRAINT "class_courses_course_code_check";

ALTER TABLE "public"."class_courses" DROP CONSTRAINT "class_courses_semester_check";

ALTER TABLE "public"."course_instructors" DROP CONSTRAINT "course_instructors_course_code_check";

ALTER TABLE "public"."course_instructors" DROP CONSTRAINT "course_instructors_semester_check";

ALTER TABLE "public"."course_mappings" DROP CONSTRAINT "course_mappings_university_code_check";

ALTER TABLE "public"."tracker" DROP CONSTRAINT "tracker_attendance_check";

ALTER TABLE "public"."tracker" DROP CONSTRAINT "tracker_semester_check";

ALTER TABLE "public"."user_settings" DROP CONSTRAINT "user_settings_target_percentage_check";

drop function if exists "public"."audit_tracker_changes"();

drop index if exists "public"."idx_class_courses_class_term";

drop index if exists "public"."idx_course_instructors_class_term";

ALTER TABLE "public"."class_courses" enable row level security;

ALTER TABLE "public"."classes" enable row level security;

ALTER TABLE "public"."course_instructors" enable row level security;

ALTER TABLE "public"."course_mappings" enable row level security;

ALTER TABLE "public"."users" ADD COLUMN "class_id" uuid;

ALTER TABLE "public"."users" ADD COLUMN "ezygo_created_at" timestamp with time zone;

CREATE INDEX idx_users_class_id ON public.users USING btree (class_id);

ALTER TABLE "public"."class_courses" add constraint "class_courses_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

ALTER TABLE "public"."class_courses" validate constraint "class_courses_created_by_fkey";

ALTER TABLE "public"."course_instructors" add constraint "course_instructors_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

ALTER TABLE "public"."course_instructors" validate constraint "course_instructors_updated_by_fkey";

ALTER TABLE "public"."users" add constraint "users_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL not valid;

ALTER TABLE "public"."users" validate constraint "users_class_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

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
  -- Keys to redact to prevent sensitive credential duplication in the audit log
  v_sensitive_keys text[] := ARRAY['ezygo_token', 'ezygo_iv', 'auth_password', 'auth_password_iv'];
  v_key            text;
BEGIN
  -- Determine operation and capture row snapshots
  IF TG_OP = 'DELETE' THEN
    v_action   := TG_TABLE_NAME || '.delete';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    -- Determine User ID and Record ID from OLD
    v_user_id   := COALESCE(
      (v_old_data->>'auth_user_id')::uuid,
      (v_old_data->>'auth_id')::uuid,
      (v_old_data->>'user_id')::uuid
    );
    v_record_id := COALESCE(
      v_old_data->>'id',
      v_old_data->>'auth_id',
      v_old_data->>'user_id'
    );
  ELSIF TG_OP = 'INSERT' THEN
    v_action   := TG_TABLE_NAME || '.insert';
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    -- Determine User ID and Record ID from NEW
    v_user_id   := COALESCE(
      (v_new_data->>'auth_user_id')::uuid,
      (v_new_data->>'auth_id')::uuid,
      (v_new_data->>'user_id')::uuid
    );
    v_record_id := COALESCE(
      v_new_data->>'id',
      v_new_data->>'auth_id',
      v_new_data->>'user_id'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action   := TG_TABLE_NAME || '.update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    -- Determine User ID and Record ID from NEW
    v_user_id   := COALESCE(
      (v_new_data->>'auth_user_id')::uuid,
      (v_new_data->>'auth_id')::uuid,
      (v_new_data->>'user_id')::uuid
    );
    v_record_id := COALESCE(
      v_new_data->>'id',
      v_new_data->>'auth_id',
      v_new_data->>'user_id'
    );
  END IF;

  -- Redact sensitive keys from snapshots
  FOREACH v_key IN ARRAY v_sensitive_keys LOOP
    IF v_old_data ? v_key THEN
      v_old_data := v_old_data || jsonb_build_object(v_key, '[REDACTED]');
    END IF;
    IF v_new_data ? v_key THEN
      v_new_data := v_new_data || jsonb_build_object(v_key, '[REDACTED]');
    END IF;
  END LOOP;

  -- Always exclude the user linkage IDs from the payload to avoid redundancy
  -- (they are already stored in the auth_user_id column of the audit_log table)
  IF v_old_data IS NOT NULL THEN
    v_old_data := v_old_data - 'auth_user_id' - 'auth_id' - 'user_id';
  END IF;
  IF v_new_data IS NOT NULL THEN
    v_new_data := v_new_data - 'auth_user_id' - 'auth_id' - 'user_id';
  END IF;

  -- Write to audit_log; ensure audit failures never block business data
  BEGIN
    INSERT INTO public.audit_log (
      auth_user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data
    ) VALUES (
      v_user_id,
      v_action,
      TG_TABLE_NAME,
      v_record_id,
      v_old_data,
      v_new_data
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[audit_generic_changes] Could not write audit entry for % on %: %',
      v_action, TG_TABLE_NAME, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_225_attendance_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;


  CREATE POLICY "Service Role Full Access"
  on "public"."class_courses"
  as permissive
  for all
  to service_role
USING (true)
WITH CHECK (true);



  CREATE POLICY "Users can add courses to their class"
  on "public"."class_courses"
  as permissive
  for insert
  to authenticated
WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND (class_courses.class_id = class_courses.class_id)))));



  CREATE POLICY "Users can read courses in their class"
  on "public"."class_courses"
  as permissive
  for select
  to authenticated
USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND (class_courses.class_id = class_courses.class_id)))));



  CREATE POLICY "Authenticated users can read classes"
  on "public"."classes"
  as permissive
  for select
  to authenticated
USING (true);



  CREATE POLICY "Service Role Full Access"
  on "public"."classes"
  as permissive
  for all
  to service_role
USING (true)
WITH CHECK (true);



  CREATE POLICY "Users can edit instructors in their class"
  on "public"."course_instructors"
  as permissive
  for all
  to authenticated
USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND (users.class_id = course_instructors.class_id)))))
WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND (users.class_id = course_instructors.class_id)))));



  CREATE POLICY "Users can read instructors in their class"
  on "public"."course_instructors"
  as permissive
  for select
  to authenticated
USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND (users.class_id = course_instructors.class_id)))));



  CREATE POLICY "Authenticated users can read mappings"
  on "public"."course_mappings"
  as permissive
  for select
  to authenticated
USING (true);



  CREATE POLICY "Service Role Full Access"
  on "public"."course_mappings"
  as permissive
  for all
  to service_role
USING (true)
WITH CHECK (true);


CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.course_instructors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


