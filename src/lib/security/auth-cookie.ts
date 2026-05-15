// src/lib/security/auth-cookie.ts
"use server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { redact } from "@/lib/utils.server";

export async function setAuthCookie(token: string, days = 31) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  (await cookies()).set("ezygo_access_token", token, {
    httpOnly: true,
    secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
    sameSite: "lax",
    path: "/",
    expires,
  });
}  

export async function clearAuthCookie() {
  (await cookies()).delete("ezygo_access_token");
}

export async function getAuthTokenServer() {
  return (await cookies()).get("ezygo_access_token")?.value;
}

// Compatibility export used by backend proxy route.
export async function getAuthTokenWithFallback() {
  const cookieToken = await getAuthTokenServer();
  if (cookieToken) return cookieToken;

  // Self-Healing Fallback: Restore token from DB if cookie is missing but Supabase session exists
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;

    const supabaseAdmin = getAdminClient();
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("ezygo_token, ezygo_iv")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (dbUser?.ezygo_token && dbUser?.ezygo_iv) {
      const token = decrypt(dbUser.ezygo_iv, dbUser.ezygo_token);
      // Attempt to restore the cookie for future requests
      await setAuthCookie(token);
      logger.info("[auth-cookie] EzyGo token healed from database fallback", { userId: redact("id", user.id) });
      return token;
    }
  } catch (err) {
    logger.warn("[auth-cookie] Self-healing fallback failed", err);
  }

  return undefined;
}