-- Silence the "RLS enabled but no policies" linter warning on audit_log.
--
-- Design intent (see 20260225000001_audit_log.sql):
--   • audit_log is an append-only admin-only table.
--   • SECURITY DEFINER functions (audit_tracker_changes, delete_user_account)
--     run as the table owner (postgres) and bypass RLS unconditionally.
--   • service_role bypasses RLS by Supabase convention — admin reads work.
--   • anon and authenticated have all privileges explicitly revoked, so RLS
--     would never be evaluated for them anyway.
--
-- This explicit deny-all policy makes the intent machine-readable and
-- satisfies automated RLS scanners without changing actual access semantics.

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
