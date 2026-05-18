import { after, type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { getAuthTokenWithFallback } from "@/lib/security/auth-cookie";
import { getAllowedHosts, resolveRequestHostname } from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { egressFetch, getClientIp } from "@/lib/utils.server";
import { authRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";
import { withSecurity } from "@/lib/security/app-check";
import { toTitleCase } from "@/lib/utils";
import { performProfileSync } from "@/lib/user/sync";
import { safeResponseJson } from "@/lib/json";
import { getProfileBundle } from "@/lib/user/profile-bundle";

export const dynamic = "force-dynamic";

interface EzygoProfileData {
  mobile?: string;
  gender?: string;
  birth_date?: string;
  user_id?: string | number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  created_at?: string;
  current_semester?: string;
  current_term?: string;
  current_year?: string;
  academic_year?: string;
  user?: {
    mobile?: string;
    username?: string;
    email?: string;
  };
}

interface EzygoProfileResponse extends EzygoProfileData {
  data?: EzygoProfileData;
}

function resolve(
  local: string | null | undefined,
  remote: string | number | null | undefined
): string | null {
  if (local && local !== "") return local;
  return remote ? String(remote) : null;
}

function validateRequestOrigin(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;
  const allowedHosts = getAllowedHosts();
  if (!allowedHosts) {
    logger.error("[profile GET] Server misconfiguration: NEXT_PUBLIC_APP_DOMAIN missing");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const origin = req.headers.get("origin");
  if (!origin) {
    const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
    const requestHostname = resolveRequestHostname(req);
    if (!(secFetchSite === "same-origin" && !!requestHostname && allowedHosts.has(requestHostname))) {
      return NextResponse.json({ error: "Origin required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  } else {
    const originHostname = new URL(origin).hostname.toLowerCase();
    if (!allowedHosts.has(originHostname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }
  return null;
}

async function authenticateUser(req: NextRequest, supabaseAdmin: ReturnType<typeof getAdminClient>): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (!token) return null;
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !authUser) return null;
    return authUser;
  }
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return authUser;
}

async function ingestNewProfile(user: { id: string }, supabaseAdmin: ReturnType<typeof getAdminClient>): Promise<NextResponse> {
  const token = await getAuthTokenWithFallback(user.id);
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let ezygoRes: Response;
  try {
    ezygoRes = await egressFetch("myprofile", { headers: { Authorization: `Bearer ${token}` } });
    if (!ezygoRes.ok) {
      logger.error("[profile GET] EzyGo profile fetch failed:", ezygoRes.status);
      Sentry.captureException(
        new Error(`EzyGo profile fetch failed with status ${ezygoRes.status}`),
        { tags: { type: "ezygo_api_error", location: "api/profile/get" } },
      );
      return NextResponse.json({ error: "Failed to reach EzyGo profile service" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[profile GET] EzyGo profile fetch exception:", err);
    Sentry.captureException(err, { tags: { type: "ezygo_network_error", location: "api/profile/get" } });
    return NextResponse.json({ error: "Failed to reach EzyGo profile service" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const json = await safeResponseJson<EzygoProfileResponse>(ezygoRes);
  if (!json) {
    return NextResponse.json({ error: "EzyGo profile returned empty or invalid JSON" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const d: EzygoProfileData = json.data || json;
  const mobileVal = d.mobile || d.user?.mobile;
  const encPhone = mobileVal ? encrypt(mobileVal) : null;
  const encGender = d.gender ? encrypt(d.gender) : null;
  const encBirthDate = d.birth_date ? encrypt(d.birth_date) : null;

  const upsertData = { 
    id: d.user_id, 
    auth_id: user.id, 
    username: d.username || d.user?.username || null,
    email: d.email || d.user?.email || null,
    first_name: resolve(null, d.first_name || d.full_name?.split(" ")[0]), 
    last_name: resolve(null, d.last_name || d.full_name?.split(" ").slice(1).join(" ")), 
    phone: encPhone?.content, 
    phone_iv: encPhone?.iv,
    gender: encGender?.content,
    gender_iv: encGender?.iv,
    birth_date: encBirthDate?.content,
    birth_date_iv: encBirthDate?.iv,
    ezygo_created_at: d.created_at || null,
    current_semester: d.current_semester || d.current_term || null,
    current_year: d.current_year || d.academic_year || null,
  };
  await supabaseAdmin.from("users").upsert(upsertData, { onConflict: "id" });
  
  const safeData: Record<string, unknown> = { ...upsertData };
  delete safeData.phone_iv;
  delete safeData.gender_iv;
  delete safeData.birth_date_iv;

  return NextResponse.json({ 
    ...safeData, 
    phone: mobileVal || null,
    gender: d.gender || null,
    birth_date: d.birth_date || null,
    created_at: new Date().toISOString()
  });
}

async function loadExistingUserBundle(
  existingUserRaw: { id: string | number; first_name?: string | null; [key: string]: unknown },
  userId: string,
  shouldSync: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>
): Promise<NextResponse> {
  let existingUser = existingUserRaw;
  let resolvedToken: string | null = null;
  let syncResult: { academic?: { current_semester?: string | null; current_year?: string | null } } | null = null;
  if (shouldSync) {
    resolvedToken = (await getAuthTokenWithFallback(userId)) ?? null;
    if (resolvedToken) {
      try {
        syncResult = await performProfileSync(resolvedToken, String(existingUser.id), userId);
        const { data: updatedUser } = await supabaseAdmin.from("users").select("*, class:classes(id, name)").eq("auth_id", userId).single();
        if (updatedUser) {
          existingUser = updatedUser;
        }
      } catch (err) { logger.warn("Synchronous profile sync failed", err); }
    }
  }

  if (!shouldSync) {
    after(async () => {
      const syncToken = resolvedToken ?? await getAuthTokenWithFallback(userId);
      if (!syncToken) return;
      try {
        await performProfileSync(syncToken, String(existingUser.id), userId);
      } catch (err) { 
        logger.warn("Profile background sync failed", err); 
      }
    });
  }
  const bundle = await getProfileBundle(userId, syncResult?.academic);
  if (!bundle) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json(bundle);
}

const getHandler = async (req: NextRequest) => {
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "Could not determine client IP" },
      { 
        status: 400,
        headers: { "Cache-Control": "no-store" }
      },
    );
  }

  const { success, reset, remaining, limit } = await authRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const originErr = validateRequestOrigin(req);
  if (originErr) return originErr;

  const supabaseAdmin = getAdminClient();
  const user = await authenticateUser(req, supabaseAdmin);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { data: existingUserRaw } = await supabaseAdmin.from("users").select("*, class:classes(id, name)").eq("auth_id", user.id).maybeSingle();
  const searchParams = req.nextUrl.searchParams;
  const shouldSync = searchParams.get("sync") === "true";

  if (existingUserRaw && existingUserRaw.first_name) {
    return loadExistingUserBundle(existingUserRaw, user.id, shouldSync, supabaseAdmin);
  }

  return ingestNewProfile(user, supabaseAdmin);
};

const patchSchema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function buildUpdatePayload(parsedData: z.infer<typeof patchSchema>) {
  const { first_name, last_name, gender, birth_date } = parsedData;
  const sanitizedFirstName = toTitleCase(first_name);
  const sanitizedLastName = last_name ? toTitleCase(last_name) : null;
  
  const up: Record<string, unknown> = { first_name: sanitizedFirstName, last_name: sanitizedLastName };
  if (gender !== undefined) {
    if (gender === null) {
      up.gender = null;
      up.gender_iv = null;
    } else {
      const enc = encrypt(gender);
      up.gender = enc.content;
      up.gender_iv = enc.iv;
    }
  }
  if (birth_date !== undefined) {
    if (birth_date === null) {
      up.birth_date = null;
      up.birth_date_iv = null;
    } else {
      const enc = encrypt(birth_date);
      up.birth_date = enc.content;
      up.birth_date_iv = enc.iv;
    }
  }
  return { up, sanitizedFirstName, sanitizedLastName, gender, birth_date };
}

const patchHandler = async (req: NextRequest, { decryptedBody }: { decryptedBody?: unknown }) => {
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "Could not determine client IP" },
      { 
        status: 400,
        headers: { "Cache-Control": "no-store" }
      },
    );
  }

  const { success, reset, remaining, limit } = await authRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const supabaseAdmin = getAdminClient();
  const user = await authenticateUser(req, supabaseAdmin);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  let body = decryptedBody;
  if (!body) { 
    try {
      body = await req.json(); 
    } catch {
      return NextResponse.json({ error: "Invalid or empty JSON body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422, headers: { "Cache-Control": "no-store" } });

  const { up, sanitizedFirstName, sanitizedLastName, gender, birth_date } = buildUpdatePayload(parsed.data);

  const { error: updateError } = await supabaseAdmin.from("users").update(up).eq("auth_id", user.id);
  if (updateError) {
    logger.error("[profile PATCH] Database update failed:", updateError);
    Sentry.captureException(updateError, {
      tags: { type: "db_update_error", location: "api/profile/patch" },
    });
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ first_name: sanitizedFirstName, last_name: sanitizedLastName, gender, birth_date });
};

export const GET = withSecurity(getHandler);
export const PATCH = withSecurity(patchHandler);
