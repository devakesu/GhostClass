import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { authRateLimiter } from "@/lib/ratelimit";
import { headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { redact, getClientIp, egressFetch } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { setAuthCookie } from "@/lib/security/auth-cookie";
import { getAdminClient } from "@/lib/supabase/admin";
import { performProfileSync } from "@/lib/user/sync";
import { withSecurity } from "@/lib/security/app-check";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";

export const dynamic = "force-dynamic";

const SaveTokenRequestSchema = z.object({
  token: z
    .string()
    .min(18, "Token too short")
    .max(2048, "Token too long")
    .trim(),
  fcm_token: z.string().trim().optional(),
});

const EzygoUserSchema = z.object({
  username: z.string().min(1).max(100),
  id: z.union([z.string(), z.number()]).transform((val) => String(val)),
  email: z.string().email(),
  mobile: z.string().optional(),
});

const AUTH_LOCK_TTL = (() => {
  const raw = process.env.AUTH_LOCK_TTL;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (isNaN(parsed) || parsed <= 0) return 20;
  return Math.max(15, Math.min(parsed, 60));
})();

async function acquireAuthLock(userId: string): Promise<string | null> {
  const lockKey = `auth_lock:${userId}`;
  const lockValue = crypto.randomBytes(16).toString("hex");
  try {
    const result = await redis.set(lockKey, lockValue, {
      nx: true,
      ex: AUTH_LOCK_TTL,
    });
    return result === "OK" ? lockValue : null;
  } catch (error) {
    logger.error("Failed to acquire auth lock:", error);
    Sentry.captureException(error, {
      tags: { type: "redis_lock_error", location: "acquire_auth_lock" },
      extra: { userId: redact("id", userId) },
    });
    throw error;
  }
}

async function releaseAuthLock(
  userId: string,
  lockValue: string
): Promise<void> {
  const lockKey = `auth_lock:${userId}`;
  try {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(luaScript, [lockKey], [lockValue]);
    if (result === 0) {
      logger.warn(
        `Lock for user ${redact("id", userId)} was already released or expired`
      );
    }
  } catch (error) {
    logger.error("Failed to release auth lock:", error);
    Sentry.captureException(error, {
      tags: { type: "redis_lock_error", location: "release_auth_lock" },
      extra: { userId: redact("id", userId) },
    });
    throw error;
  }
}

async function validateOrigin(headerList: Headers, isMobileApp: boolean) {
  if (isMobileApp || process.env.NODE_ENV === "development") return null;

  const origin = headerList.get("origin");
  const host = headerList.get("host");
  if (!origin || !host) return "Invalid origin";

  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (!appDomain?.trim() || appDomain.includes("://")) return "Server configuration error";

  try {
    const originHostname = new URL(origin).hostname.toLowerCase();
    const headerHostname = new URL(`http://${host}`).hostname.toLowerCase();
    if (originHostname !== headerHostname) return "Invalid origin";

    const appDomainHostname = new URL(`https://${appDomain.trim()}`).hostname
      .toLowerCase();
    if (originHostname !== appDomainHostname) return "Invalid origin";
  } catch {
    return "Invalid origin";
  }
  return null;
}

async function verifyEzygoToken(token: string) {
  const abortCtrl = new AbortController();
  const timeout = setTimeout(() => abortCtrl.abort(), 15000);
  try {
    const res = await egressFetch("user", {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortCtrl.signal,
    });
    if (res.status === 401) throw { status: 401, message: "Invalid or expired token" };
    if (res.status !== 200) throw { status: 502, message: "Service error" };

    const data = await res.json().catch(() => null);
    const validation = EzygoUserSchema.safeParse(data);
    if (!validation.success) throw { status: 502, message: "Invalid data" };

    return validation.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleOrphanUser(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  email: string
) {
  let page = 1;
  const PER_PAGE = 1000;
  while (page <= 10) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    const found = data.users.find((u: { email?: string; id: string }) => u.email === email);
    if (found) {
      await supabaseAdmin.auth.admin.deleteUser(found.id);
      return;
    }
    if (data.users.length < PER_PAGE) break;
    page++;
  }
  throw new Error("Orphan user not found");
}

async function validateClientIpAndRateLimit(headerList: Headers): Promise<NextResponse | null> {
  const ip = getClientIp(headerList);
  if (!ip) {
    return NextResponse.json({ error: "Unable to determine client IP" }, { status: 400 });
  }

  const { success } = await authRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Rate limit" }, { status: 429 });
  }

  return null;
}

async function provisionSupabaseAuthUser(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  email: string,
  verifiedId: string
): Promise<{ authUserId: string; passwordToUse: string; isFirstLogin: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", verifiedId)
    .single();

  if (existing?.auth_id) {
    if (!existing.auth_password) {
      const canonicalPass = crypto.randomBytes(32).toString("hex");
      await supabaseAdmin.auth.admin.updateUserById(existing.auth_id, { password: canonicalPass });
      const { iv: pIv, content: pContent } = encrypt(canonicalPass);
      await supabaseAdmin
        .from("users")
        .update({ auth_password: pContent, auth_password_iv: pIv })
        .eq("id", verifiedId)
        .is("auth_password", null)
        .select();

      return {
        authUserId: existing.auth_id,
        passwordToUse: canonicalPass,
        isFirstLogin: false,
      };
    }

    return {
      authUserId: existing.auth_id,
      passwordToUse: decrypt(existing.auth_password_iv!, existing.auth_password!),
      isFirstLogin: false,
    };
  }

  const canonicalPass = crypto.randomBytes(32).toString("hex");
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: canonicalPass,
    email_confirm: true,
    user_metadata: { ezygo_id: verifiedId },
  });

  if (!createError) {
    return { authUserId: createData.user.id, passwordToUse: canonicalPass, isFirstLogin: true };
  }

  await handleOrphanUser(supabaseAdmin, email);
  const { data: retry, error: retryError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: canonicalPass,
    email_confirm: true,
  });

  if (retryError || !retry.user) {
    throw new Error("Retry creation failed");
  }

  return { authUserId: retry.user.id, passwordToUse: canonicalPass, isFirstLogin: true };
}

async function validateRequestHeaders(headerList: Headers, isAppCheck: boolean): Promise<NextResponse | null> {
  const originError = await validateOrigin(headerList, isAppCheck);
  if (originError) {
    const status = originError === "Server configuration error" ? 500 : 403;
    return NextResponse.json({ error: originError }, { status });
  }

  const rateLimitErr = await validateClientIpAndRateLimit(headerList);
  if (rateLimitErr) return rateLimitErr;

  return null;
}

function handleAuthError(error: unknown) {
  logger.error("Auth Failed:", error);
  const errObj = error as { status?: number; message?: string; name?: string } | undefined;
  if (errObj?.status) {
    return NextResponse.json({ message: errObj.message || "Auth error" }, { status: errObj.status });
  }
  if (errObj?.name === "AbortError" || errObj?.message === "AbortError") {
    return NextResponse.json({ message: "Gateway Timeout" }, { status: 504 });
  }
  if (errObj?.message?.includes("Redis")) {
    return NextResponse.json({ message: "Service Unavailable" }, { status: 503 });
  }
  return NextResponse.json({ error: "Auth failed" }, { status: 500 });
}

const handler = async (
  req: Request,
  { decryptedBody, authType }: { decryptedBody?: unknown; authType?: string }
) => {
  const headerList = await headers();
  const headerErr = await validateRequestHeaders(headerList, authType === "app-check");
  if (headerErr) return headerErr;

  let lockValue: string | null = null;
  let verifiedId = "";

  try {
    const body = decryptedBody || (await req.json());
    const validation = SaveTokenRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: "Invalid request format" }, { status: 400 });
    }

    const { token, fcm_token } = validation.data;
    const ezyUser = await verifyEzygoToken(token);
    verifiedId = ezyUser.id;

    if (!/^[a-zA-Z0-9-_]+$/.test(verifiedId)) {
      return NextResponse.json({ message: "Invalid user identifier" }, { status: 400 });
    }

    lockValue = await acquireAuthLock(verifiedId);
    if (!lockValue) {
      return NextResponse.json({ error: "Lock contention" }, { status: 409 });
    }

    const supabaseAdmin = getAdminClient();
    const ghostDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    const email = `ezygo_${verifiedId}@${ghostDomain}`;

    const { authUserId, passwordToUse, isFirstLogin } = await provisionSupabaseAuthUser(
      supabaseAdmin,
      email,
      verifiedId
    );

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => headerList as unknown as { name: string; value: string }[],
          setAll: () => {},
        },
      }
    );

    const { data: signInData } = await supabase.auth.signInWithPassword({
      email,
      password: passwordToUse,
    });

    const { iv: tIv, content: tContent } = encrypt(token);
    const updateData: Record<string, unknown> = {
      id: verifiedId,
      username: ezyUser.username,
      ezygo_token: tContent,
      ezygo_iv: tIv,
      auth_id: authUserId,
      updated_at: new Date().toISOString(),
      ...(fcm_token && { fcm_token }),
    };

    if (isFirstLogin) {
      const { iv: pIv, content: pContent } = encrypt(passwordToUse);
      updateData.auth_password = pContent;
      updateData.auth_password_iv = pIv;
    }

    const { error: upsertErr } = await supabaseAdmin.from("users").upsert(updateData);
    if (upsertErr) throw new Error("Upsert failed");

    const syncRes = await performProfileSync(token, verifiedId, authUserId);
    const info = calculateCurrentAcademicInfo();

    const response = {
      success: true,
      userId: authUserId,
      current_semester: syncRes?.academic?.current_semester ?? info.current_semester,
      current_year: syncRes?.academic?.current_year ?? info.current_year,
    };

    if (authType !== "app-check") {
      await setAuthCookie(token);
      return NextResponse.json(response);
    }

    return NextResponse.json({
      ...response,
      session: signInData.session,
      ezygo_token: token,
    });

  } catch (error: unknown) {
    return handleAuthError(error);
  } finally {
    if (lockValue && verifiedId) {
      await releaseAuthLock(verifiedId, lockValue);
    }
  }
};

export const POST = withSecurity(handler as unknown as Parameters<typeof withSecurity>[0]);
