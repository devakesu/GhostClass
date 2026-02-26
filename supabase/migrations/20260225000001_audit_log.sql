-- Structured audit log for sensitive database actions.
--
-- Covered operations:
--   tracker.insert  – manual attendance record added (AddAttendanceDialog, calendar write)
--   tracker.update  – tracker record status changed (cron sync conflict resolution)
--   tracker.delete  – manual record removed (calendar delete, cron sync cleanup)
--   account.delete  – user account and all data permanently deleted
--
-- Implementation:
--   • tracker mutations  → AFTER trigger on public.tracker (catches ALL writers including cron)
--   • account.delete     → explicit INSERT in delete_user_account() BEFORE wiping rows
--
-- Security posture:
--   • audit_log has NO RLS policy granting anon/authenticated access.
--   • The SECURITY DEFINER trigger and delete_user_account run as postgres
--     (the table owner) and can INSERT unconditionally.
--   • Only the service_role (admin client / Supabase dashboard) can query the table.
--   • A failed audit write raises a WARNING and never blocks the actual mutation.

-- ============================================================================
-- 1.  audit_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
  "id"           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "auth_user_id" uuid,          -- Caller's auth.users.id (nullable post-account-deletion)
  "action"       text    NOT NULL,   -- 'tracker.insert' | 'tracker.update' | 'tracker.delete' | 'account.delete'
  "table_name"   text,               -- Affected table name
  "record_id"    text,               -- Stringified PK of the affected row
  "old_data"     jsonb,              -- Row snapshot before change (UPDATE / DELETE)
  "new_data"     jsonb,              -- Row snapshot after change  (INSERT / UPDATE)
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."audit_log" OWNER TO "postgres";

COMMENT ON TABLE "public"."audit_log" IS
  'Append-only structured audit trail for sensitive data mutations (tracker changes, account deletion).';

COMMENT ON COLUMN "public"."audit_log"."auth_user_id" IS
  'auth.users.id of the actor. No FK constraint — entry must survive account deletion.';

COMMENT ON COLUMN "public"."audit_log"."action" IS
  'Dot-separated action name: <table>.<operation>  e.g. tracker.insert, account.delete';

COMMENT ON COLUMN "public"."audit_log"."old_data" IS
  'JSONB snapshot of the row BEFORE the mutation (populated for UPDATE and DELETE).';

COMMENT ON COLUMN "public"."audit_log"."new_data" IS
  'JSONB snapshot of the row AFTER the mutation (populated for INSERT and UPDATE).';

-- Indexes for admin investigation queries
CREATE INDEX "idx_audit_log_user_created"
  ON "public"."audit_log" ("auth_user_id", "created_at" DESC);

CREATE INDEX "idx_audit_log_action_created"
  ON "public"."audit_log" ("action", "created_at" DESC);

-- ============================================================================
-- 2.  RLS – lock down the table; no role other than service_role can touch it
-- ============================================================================

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke so any future role grants to other tables don't accidentally
-- cascade here.
REVOKE ALL ON TABLE "public"."audit_log" FROM "anon";
REVOKE ALL ON TABLE "public"."audit_log" FROM "authenticated";

-- No RLS policies granting access are created; the table is write-only for
-- SECURITY DEFINER functions (which run as the table owner, bypassing RLS)
-- and read-only for the service_role (which also bypasses RLS).
-- An explicit deny-all RESTRICTIVE policy is added so automated RLS scanners
-- see a policy without changing the effective access semantics.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_no_access'
  ) THEN
    CREATE POLICY "audit_log_no_access"
      ON "public"."audit_log"
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END
$$;

-- ============================================================================
-- 3.  Trigger function: audit_tracker_changes
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."audit_tracker_changes"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_action    text;
  v_record_id text;
  v_user_id   uuid;
  v_old_data  jsonb;
  v_new_data  jsonb;
BEGIN
  -- Determine affected row identity from whichever record is available
  IF TG_OP = 'DELETE' THEN
    v_action    := 'tracker.delete';
    v_record_id := OLD.id::text;
    v_user_id   := OLD.auth_user_id;
    -- Exclude auth_user_id from the payload (it is stored as a dedicated column)
    v_old_data  := to_jsonb(OLD) - 'auth_user_id';
    v_new_data  := NULL;

  ELSIF TG_OP = 'INSERT' THEN
    v_action    := 'tracker.insert';
    v_record_id := NEW.id::text;
    v_user_id   := NEW.auth_user_id;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW) - 'auth_user_id';

  ELSIF TG_OP = 'UPDATE' THEN
    v_action    := 'tracker.update';
    v_record_id := NEW.id::text;
    v_user_id   := NEW.auth_user_id;
    v_old_data  := to_jsonb(OLD) - 'auth_user_id';
    v_new_data  := to_jsonb(NEW) - 'auth_user_id';
  END IF;

  -- Write audit entry; never let a failure here break the actual DML
  BEGIN
    INSERT INTO public.audit_log (auth_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, v_action, 'tracker', v_record_id, v_old_data, v_new_data);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[audit_tracker_changes] Could not write audit entry for % on tracker.id=%: %',
      v_action, v_record_id, SQLERRM;
  END;

  -- Return the appropriate record for the trigger type
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."audit_tracker_changes"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."audit_tracker_changes"() IS
  'AFTER trigger on public.tracker – appends a row to audit_log for every INSERT, UPDATE, or DELETE.';

-- ============================================================================
-- 4.  Attach trigger to tracker
-- ============================================================================

DROP TRIGGER IF EXISTS "audit_tracker_mutations" ON "public"."tracker";

CREATE TRIGGER "audit_tracker_mutations"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."tracker"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."audit_tracker_changes"();

-- ============================================================================
-- 5.  Update delete_user_account to emit an audit entry BEFORE wiping data
--
--     This supersedes the version in 20260223000001_fix_delete_user_account_storage.sql.
--     The audit INSERT must happen first so that:
--       (a) auth_user_id is still resolvable, and
--       (b) tracker_records_deleted reflects the count before deletion.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."delete_user_account"()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
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

COMMENT ON FUNCTION "public"."delete_user_account"() IS
  'Deletes the calling user''s account and all associated data after writing an audit_log entry.';
