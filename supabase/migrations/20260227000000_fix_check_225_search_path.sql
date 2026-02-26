-- Fix: set an explicit, immutable search_path on check_225_attendance_limit.
--
-- Without a fixed search_path the function resolves object names (tables,
-- types, functions) using the caller's mutable search_path at runtime.
-- This can cause correctness issues across roles/environments and is an
-- attack surface for privilege escalation via object shadowing.
--
-- Changes:
--   1. Added SET search_path = public, pg_temp to the function header.
--   2. Schema-qualified "tracker" → "public"."tracker" inside the body.
--
-- Body is otherwise identical to the original.

CREATE OR REPLACE FUNCTION "public"."check_225_attendance_limit"()
  RETURNS "trigger"
  LANGUAGE "plpgsql"
  SET search_path = public, pg_temp
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

COMMENT ON FUNCTION "public"."check_225_attendance_limit"() IS 'Enforces maximum 5 DLs per semester per course';
