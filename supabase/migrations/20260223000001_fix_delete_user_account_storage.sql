-- Fix delete_user_account: remove direct storage.objects deletion.
-- Supabase forbids direct DML on storage tables ("Use the Storage API instead").
-- Storage objects are now deleted client-side via the Storage JS client before
-- this RPC is called, so removing that step here is safe.

CREATE OR REPLACE FUNCTION "public"."delete_user_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  requesting_user_id uuid;
begin
  -- Get the ID of the user calling the function
  requesting_user_id := auth.uid();

  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- NOTE: Storage objects (e.g. avatars) are deleted client-side via the
  -- Supabase Storage JS API before this function is invoked.

  -- 1. Delete from public tables (order matters due to foreign keys)
  delete from public.tracker where auth_user_id = requesting_user_id;
  delete from public.notification where auth_user_id = requesting_user_id;
  delete from public.user_settings where user_id = requesting_user_id;

  -- 2. Delete the public profile
  delete from public.users where auth_id = requesting_user_id;

  -- 3. Finally, delete the auth user itself
  delete from auth.users where id = requesting_user_id;
end;
$$;
