import { NextRequest, NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { authRateLimiter } from "@/lib/ratelimit";
import { headers, cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { z } from "zod";
import { getClientIp, egressFetch } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { setAuthCookie } from "@/lib/security/auth-cookie";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/fetch";
import { performProfileSync } from "@/lib/user/sync";
import { withSecurity } from "@/lib/security/app-check";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import { getAuthLock, releaseAuthLock as releaseAuthLockUtil } from "@/lib/security/auth-lock";
import { getAllowedHosts, resolveRequestHostname } from "@/lib/security/origin-validation";

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

// Auth-lock TTL in seconds (15–60 s), converted to ms when calling auth-lock module.
const AUTH_LOCK_TTL = (() => {
  const raw = process.env.AUTH_LOCK_TTL;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (isNaN(parsed) || parsed <= 0) return 20;
  return Math.max(15, Math.min(parsed, 60));
})();

async function validateOrigin(headerList: Headers, isMobileApp: boolean) {
  if (isMobileApp || process.env.NODE_ENV === "development") return null;

  let allowedHosts: Set<string> | null;
  try {
    allowedHosts = getAllowedHosts();
  } catch {
    return "Server configuration error";
  }
  if (!allowedHosts) return "Server configuration error";

  const origin = headerList.get("origin");
  if (!origin) {
    const secFetchSite = headerList.get("sec-fetch-site")?.toLowerCase();
    const requestHostname = resolveRequestHostname({
      headers: headerList,
      nextUrl: { hostname: headerList.get("host") ?? "" },
    } as NextRequest);
    if (!(secFetchSite === "same-origin" && !!requestHostname && allowedHosts.has(requestHostname))) {
      return "Invalid origin";
    }
    return null;
  }

  try {
    const originHostname = new URL(origin).hostname.toLowerCase();
    if (!allowedHosts.has(originHostname)) return "Invalid origin";
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
  const { url, key } = getSupabaseConfig("admin");
  const endpoint = new URL("/auth/v1/admin/users", url);
  endpoint.searchParams.set("email", email);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("per_page", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Orphan user lookup failed");
  }

  const payload = await response.json().catch(() => null) as { users?: Array<{ email?: string; id: string }> } | null;
  const found = payload?.users?.find((u) => u.email === email);
  if (found) {
    await supabaseAdmin.auth.admin.deleteUser(found.id);
    return;
  }
  throw new Error("Orphan user not found");
}

async function validateClientIpAndRateLimit(headerList: Headers): Promise<NextResponse | null> {
  const ip = getClientIp(headerList);
  if (!ip) {
    return NextResponse.json({ message: "Unable to determine client IP" }, { status: 400 });
  }

  const { success } = await authRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ message: "Rate limit" }, { status: 429 });
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
      passwordToUse: decrypt({ iv: existing.auth_password_iv!, content: existing.auth_password! }),
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
    user_metadata: { ezygo_id: verifiedId },
  });

  if (retryError || !retry.user) {
    throw new Error("Retry creation failed");
  }

  return { authUserId: retry.user.id, passwordToUse: canonicalPass, isFirstLogin: true };
}

async function signInToSupabase(
  supabase: ReturnType<typeof createServerClient>,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  authUserId: string,
  email: string,
  passwordToUse: string
) {
  let signInEmail = email;
  let signInRes = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password: passwordToUse,
  });
  if (signInRes.error) {
    // First attempt failed — try to resolve the canonical email and retry.
    try {
      const { data: adminUserData } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      const fetchedEmail = adminUserData?.user?.email;
      if (fetchedEmail && typeof fetchedEmail === "string" && fetchedEmail.trim().length > 0) {
        signInEmail = fetchedEmail;
        signInRes = await supabase.auth.signInWithPassword({
          email: signInEmail,
          password: passwordToUse,
        });
      }
    } catch {
      // If admin lookup fails, preserve the original sign-in error below.
    }
  }

  if (signInRes.error) {
    throw signInRes.error;
  }

  return signInRes.data;
}

async function upsertUserData(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  payload: {
    verifiedId: string;
    username: string | null;
    token: string;
    authUserId: string;
    fcm_token?: string;
    isFirstLogin: boolean;
    passwordToUse: string;
  }
) {
  const { verifiedId, username, token, authUserId, fcm_token, isFirstLogin, passwordToUse } = payload;
  const { iv: tIv, content: tContent } = encrypt(token);
  const updateData: Record<string, unknown> = {
    id: verifiedId,
    username,
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
}

async function validateRequestHeaders(headerList: Headers, isAppCheck: boolean): Promise<NextResponse | null> {
  const originError = await validateOrigin(headerList, isAppCheck);
  if (originError) {
    const status = originError === "Server configuration error" ? 500 : 403;
    return NextResponse.json({ message: originError }, { status });
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
  // L-1: Standardised to {message} to match all other error responses in this handler.
  return NextResponse.json({ message: "Auth failed" }, { status: 500 });
}

const handler = async (
  req: Request,
  { decryptedBody, authType }: { decryptedBody?: unknown; authType?: string }
) => {
  const headerList = await headers();
  const cookieStore = await cookies();
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

    // C-3: Use canonical auth-lock module (removes duplicated Lua script).
    lockValue = await getAuthLock(verifiedId, AUTH_LOCK_TTL * 1000);
    if (!lockValue) {
      return NextResponse.json({ message: "Lock contention" }, { status: 409 });
    }

    const supabaseAdmin = getAdminClient();
    const ghostDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    const email = `ezygo_${verifiedId}@${ghostDomain}`;

    const { authUserId, passwordToUse, isFirstLogin } = await provisionSupabaseAuthUser(
      supabaseAdmin,
      email,
      verifiedId
    );

    // C-1: Mirror the isProd guard from proxy.ts so dev/staging sessions are set
    // against the correct Supabase project and match the middleware's session cookies.
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig("client");

    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (error) {
              logger.warn("Non-critical: Failed to set Supabase session cookies in save-token route", error);
            }
          },
        },
      }
    );

    const signInData = await signInToSupabase(
      supabase,
      supabaseAdmin,
      authUserId,
      email,
      passwordToUse
    );

    await upsertUserData(supabaseAdmin, {
      verifiedId,
      username: ezyUser.username,
      token,
      authUserId,
      fcm_token,
      isFirstLogin,
      passwordToUse,
    });

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
    });

  } catch (error: unknown) {
    return handleAuthError(error);
  } finally {
    if (lockValue && verifiedId) {
      await releaseAuthLockUtil(verifiedId, lockValue);
    }
  }
};

export const POST = withSecurity(handler as unknown as Parameters<typeof withSecurity>[0]);
