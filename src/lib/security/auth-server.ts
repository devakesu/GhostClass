import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";
import "server-only";

export type UserContextResult =
  | { success: true; user: User; classId: string; supabase: unknown }
  | { success: false; error: string };

/**
 * Consolidate Supabase user retrieval and class context validation.
 */
export async function getAuthenticatedUserContext(
  notLoggedInMsg: string,
  logErrorMsg: string,
): Promise<UserContextResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: notLoggedInMsg };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("class_id")
    .eq("auth_id", user.id)
    .single();

  if (profileError || !profile?.class_id) {
    logger.error(logErrorMsg, profileError);
    return { success: false, error: "No class associated with your profile" };
  }

  return { success: true, user, classId: profile.class_id, supabase };
}
