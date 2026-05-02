import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { validateCsrfToken } from "@/lib/security/csrf";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { getAllowedHosts, resolveRequestHostname } from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { egressFetch, getClientIp } from "@/lib/utils.server";
import { authRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";
import { withSecurity, isMobileRequest } from "@/lib/security/app-check";
import { toTitleCase } from "@/lib/utils";
import { performProfileSync } from "@/lib/user/sync";
import { safeResponseJson } from "@/lib/json";

export const dynamic = "force-dynamic";

function resolve(
  local: string | null | undefined,
  remote: string | number | null | undefined
): string | null {
  if (local && local !== "") return local;
  return remote ? String(remote) : null;
}

const getHandler = async (req: Request) => {
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

  if (process.env.NODE_ENV !== "development") {
    const allowedHosts = getAllowedHosts();
    if (!allowedHosts) {
      logger.error("[profile GET] Server misconfiguration: NEXT_PUBLIC_APP_DOMAIN missing");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    const origin = req.headers.get("origin");
    if (!origin) {
      const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
      const requestHostname = resolveRequestHostname(req as any);
      if (!(secFetchSite === "same-origin" && !!requestHostname && allowedHosts?.has(requestHostname))) return NextResponse.json({ error: "Origin required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    } else {
      const originHostname = new URL(origin).hostname.toLowerCase();
      if (!allowedHosts?.has(originHostname)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }

  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { data: existingUser } = await supabaseAdmin.from("users").select("*, class:classes(id, name)").eq("auth_id", user.id).maybeSingle();
  const searchParams = new URL(req.url).searchParams;
  const shouldSync = searchParams.get("sync") === "true";

  const decryptedGender = existingUser?.gender && existingUser?.gender_iv ? decrypt(existingUser.gender_iv, existingUser.gender) : null;
  const decryptedBirthDate = existingUser?.birth_date && existingUser?.birth_date_iv ? decrypt(existingUser.birth_date_iv, existingUser.birth_date) : null;
  const decryptedPhone = existingUser?.phone && existingUser?.phone_iv ? decrypt(existingUser.phone_iv, existingUser.phone) : null;

  if (existingUser && existingUser.first_name) {
    // Cache the token so it's reused in the after() background sync (avoids a second
    // getAuthTokenServer() call when shouldSync=true).
    let resolvedToken: string | null = null;

    if (shouldSync) {
      resolvedToken = (await getAuthTokenServer()) ?? null;
      if (resolvedToken) {
        try {
          // Block until EzyGo sync completes
          await performProfileSync(resolvedToken, existingUser.id, user.id);

          // Refetch from DB to return fresh data (e.g. updated class name)
          const { data: updatedUser } = await supabaseAdmin.from("users").select("*, class:classes(id, name)").eq("auth_id", user.id).single();
          if (updatedUser) {
             return NextResponse.json({ 
                id: updatedUser.id, 
                username: updatedUser.username, 
                email: updatedUser.email, 
                first_name: updatedUser.first_name, 
                last_name: updatedUser.last_name, 
                phone: updatedUser.phone && updatedUser.phone_iv ? decrypt(updatedUser.phone_iv, updatedUser.phone) : null,
                gender: updatedUser.gender && updatedUser.gender_iv ? decrypt(updatedUser.gender_iv, updatedUser.gender) : null,
                birth_date: updatedUser.birth_date && updatedUser.birth_date_iv ? decrypt(updatedUser.birth_date_iv, updatedUser.birth_date) : null,
                avatar_url: updatedUser.avatar_url,
                created_at: updatedUser.created_at,
                ezygo_created_at: updatedUser.ezygo_created_at,
                class: Array.isArray(updatedUser.class) ? updatedUser.class[0] : updatedUser.class
              });
          }
        } catch (err) { logger.warn("Synchronous profile sync failed", err); }
      }
    }

    after(async () => {
      // Reuse token already fetched in shouldSync block; only fetch fresh for background-only path
      const syncToken = resolvedToken ?? await getAuthTokenServer();
      if (!syncToken) return;
      try {
        // Trigger a full background sync (Profile, Class, Courses)
        // This ensures class label updates correctly after semester/year changes.
        await performProfileSync(syncToken, existingUser.id, user.id);
      } catch (err) { 
        logger.warn("Profile background sync failed", err); 
      }
    });
    return NextResponse.json({ 
      id: existingUser.id, 
      username: existingUser.username, 
      email: existingUser.email, 
      first_name: existingUser.first_name, 
      last_name: existingUser.last_name, 
      phone: decryptedPhone, 
      gender: decryptedGender, 
      birth_date: decryptedBirthDate, 
      avatar_url: existingUser.avatar_url,
      created_at: existingUser.created_at,
      ezygo_created_at: existingUser.ezygo_created_at,
      class: Array.isArray(existingUser.class) ? existingUser.class[0] : existingUser.class
    });
  }

  const token = await getAuthTokenServer();
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
  const json = await safeResponseJson<any>(ezygoRes);
  if (!json) {
    return NextResponse.json({ error: "EzyGo profile returned empty or invalid JSON" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const d = json.data || json;
  const encPhone = (d.mobile || d.user?.mobile) ? encrypt(d.mobile || d.user?.mobile) : null;
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
    ezygo_created_at: d.created_at || null
  };
  await supabaseAdmin.from("users").upsert(upsertData, { onConflict: "id" });
  
  // Return the data with decrypted phone for the client
    // Filter out internal _iv columns before returning to client
    const safeData = { ...upsertData } as Record<string, any>;
    delete safeData.phone_iv;
    delete safeData.gender_iv;
    delete safeData.birth_date_iv;

    return NextResponse.json({ 
      ...safeData, 
      phone: d.mobile || d.user?.mobile || null,
      gender: d.gender || null,
      birth_date: d.birth_date || null,
      created_at: new Date().toISOString() // Freshly created
    });
};

const patchSchema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const patchHandler = async (req: Request, { decryptedBody }: { decryptedBody?: any }) => {
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

  const mobile = isMobileRequest(req.headers);
  if (!mobile) {
    const csrfToken = req.headers.get(CSRF_HEADER);
    if (!(await validateCsrfToken(csrfToken))) return NextResponse.json({ error: "Invalid CSRF" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { first_name, last_name, gender, birth_date } = parsed.data;
  const sanitizedFirstName = toTitleCase(first_name);
  const sanitizedLastName = last_name ? toTitleCase(last_name) : null;
  
  const up: any = { first_name: sanitizedFirstName, last_name: sanitizedLastName };
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

  const supabaseAdmin = getAdminClient();
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

export const GET = withSecurity(getHandler as any);
export const PATCH = withSecurity(patchHandler as any);
