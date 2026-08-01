// src/lib/security/auth-cookie.ts
"use server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { isCookieSecure } from "@/lib/security/cookie-utils";
import { redact } from "@/lib/utils.server";

import { redis } from "@/lib/redis";

export async function setAuthCookie(token: string, days = 31) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  (await cookies()).set("ezygo_access_token", token, {
    httpOnly: true,
    secure: isCookieSecure(),
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
export async function getAuthTokenWithFallback(userId?: string) {
  const cookieToken = await getAuthTokenServer();
  if (cookieToken) return cookieToken;

  // Self-Healing Fallback: Restore token from DB if cookie is missing but Supabase session exists
  try {
    let finalUserId = userId;
    if (!finalUserId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return undefined;
      finalUserId = user.id;
    }

    // M-8: Try Redis cache first to avoid DB query penalty
    const cacheKey = `healed_token:${finalUserId}`;
    try {
      const cachedToken = await redis.get<string>(cacheKey);
      if (cachedToken) {
        logger.info("[auth-cookie] EzyGo token healed from Redis cache", {
          userId: redact("id", finalUserId),
        });
        // Attempt to restore the cookie for future requests
        try {
          await setAuthCookie(cachedToken);
        } catch (cookieErr) {
          logger.dev(
            "[auth-cookie] Could not set auth cookie in cache fallback",
            cookieErr,
          );
        }
        return cachedToken;
      }
    } catch (redisErr) {
      logger.dev("[auth-cookie] Redis cache check failed", redisErr);
    }

    logger.warn(
      "[auth-cookie] Cold start: EzyGo cookie missing. Falling back to DB healing.",
      { userId: redact("id", finalUserId) },
    );

    const supabaseAdmin = getAdminClient();
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("ezygo_token, ezygo_iv")
      .eq("auth_id", finalUserId)
      .maybeSingle();

    if (dbUser?.ezygo_token && dbUser?.ezygo_iv) {
      const token = decrypt({
        iv: dbUser.ezygo_iv,
        content: dbUser.ezygo_token,
      });

      // Cache in Redis for 5 minutes (300 seconds)
      try {
        await redis.set(cacheKey, token, { ex: 300 });
      } catch (redisErr) {
        logger.dev("[auth-cookie] Failed to cache token in Redis", redisErr);
      }

      // Attempt to restore the cookie for future requests
      try {
        await setAuthCookie(token);
      } catch (cookieErr) {
        logger.dev(
          "[auth-cookie] Could not set auth cookie in fallback",
          cookieErr,
        );
      }
      logger.info("[auth-cookie] EzyGo token healed from database fallback", {
        userId: redact("id", finalUserId),
      });
      return token;
    }
  } catch (err) {
    logger.warn("[auth-cookie] Self-healing fallback failed", err);
  }

  return undefined;
}
