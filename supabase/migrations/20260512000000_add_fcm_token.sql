-- Add FCM Token and Mobile App Flags
-- Extends the users table to track mobile application installation and secure push notification device tokens.

ALTER TABLE "public"."users" 
  ADD COLUMN IF NOT EXISTS "fcm_token" text,
  ADD COLUMN IF NOT EXISTS "has_mobile_app" boolean DEFAULT false NOT NULL;

-- Redact fcm_token from audit logs to prevent exposing device identifiers
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
$function$;
