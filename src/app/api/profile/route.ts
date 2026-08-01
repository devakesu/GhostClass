import { after, type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  getAuthTokenServer,
  getAuthTokenWithFallback,
  setAuthCookie,
} from "@/lib/security/auth-cookie";
import {
  getAllowedHosts,
  resolveRequestHostname,
} from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { getClientIp } from "@/lib/utils.server";
import { profileRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";
import { withSecurity } from "@/lib/security/app-check";
import { performProfileSync } from "@/lib/user/sync";
import { getProfileBundle } from "@/lib/user/profile-bundle";
import {
  birthDateSchema,
  genderSchema,
  optionalPersonNameSchema,
  personNameSchema,
} from "@/lib/validation/text";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";

export const dynamic = "force-dynamic";

function validateRequestOrigin(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;
  const allowedHosts = getAllowedHosts();
  if (!allowedHosts) {
    logger.error(
      "[profile GET] Server misconfiguration: NEXT_PUBLIC_APP_DOMAIN missing",
    );
    return NextResponse.json({ error: "Server misconfiguration" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const origin = req.headers.get("origin");
  if (!origin) {
    const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
    const requestHostname = resolveRequestHostname(req);
    if (
      !(secFetchSite === "same-origin" && !!requestHostname &&
        allowedHosts.has(requestHostname))
    ) {
      return NextResponse.json({ error: "Origin required" }, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } else {
    const originHostname = new URL(origin).hostname.toLowerCase();
    if (!allowedHosts.has(originHostname)) {
      return NextResponse.json({ error: "Forbidden" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  return null;
}

async function authenticateUser(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (!token) {
      logger.error("[authenticateUser] Bearer token is missing");
      return null;
    }
    const { data: { user: authUser }, error } = await supabaseAdmin.auth
      .getUser(token);
    if (error || !authUser) {
      logger.error(
        "[authenticateUser] Supabase auth.getUser error:",
        error || "No user returned",
      );
      return null;
    }
    return authUser;
  }
  const supabase = await createClient();
  const { data: { user: authUser }, error } = await supabase.auth.getUser();
  if (error || !authUser) {
    logger.error(
      "[authenticateUser] Supabase client auth.getUser error:",
      error || "No user returned",
    );
    return null;
  }
  return authUser;
}

async function ingestNewProfile(
  user: { id: string },
): Promise<NextResponse> {
  const token = await getAuthTokenWithFallback(user.id);
  if (!token) {
    return NextResponse.json({ error: "No token" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const syncResult = await performProfileSync(token, "", user.id, true);
    const bundle = await getProfileBundle(user.id, syncResult?.academic);
    if (!bundle) {
      return NextResponse.json({ error: "Profile not found after ingestion" }, {
        status: 404,
      });
    }
    return NextResponse.json(bundle);
  } catch (err) {
    logger.error("[profile GET] ingestNewProfile sync exception:", err);
    Sentry.captureException(err, {
      tags: { type: "ezygo_network_error", location: "api/profile/get/ingest" },
    });
    return NextResponse.json(
      { error: "Failed to reach EzyGo profile service" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

type ExistingUserRawType = {
  id: string | number;
  first_name?: string | null;
  ezygo_token?: unknown;
  ezygo_iv?: unknown;
  [key: string]: unknown;
};

async function resolveAuthToken(
  existingUserRaw: ExistingUserRawType,
): Promise<string | null> {
  const cookieToken = await getAuthTokenServer();
  if (cookieToken) return cookieToken;

  if (existingUserRaw.ezygo_token && existingUserRaw.ezygo_iv) {
    try {
      const resolvedToken = decrypt({
        iv: existingUserRaw.ezygo_iv as string,
        content: existingUserRaw.ezygo_token as string,
      });
      if (resolvedToken) {
        try {
          await setAuthCookie(resolvedToken);
        } catch (cookieErr) {
          logger.dev(
            "[auth-cookie] Could not set auth cookie in fallback",
            cookieErr,
          );
        }
        return resolvedToken;
      }
    } catch (decryptErr) {
      logger.warn(
        "[resolveAuthToken] Failed to decrypt fallback ezygo token:",
        decryptErr,
      );
    }
  }
  return null;
}

async function performSyncAndFetchUser(
  token: string,
  userId: string,
  existingUser: ExistingUserRawType,
  isDebounced: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<{
  updatedUser: ExistingUserRawType;
  syncResult: {
    academic?: {
      current_semester?: string | null;
      current_year?: string | null;
    };
  } | null;
}> {
  try {
    const fullSync = !isDebounced;
    const syncResult = await performProfileSync(
      token,
      String(existingUser.id),
      userId,
      fullSync,
      existingUser,
    );

    if (!fullSync) {
      return {
        updatedUser: existingUser,
        syncResult,
      };
    }

    const { data: updatedUser } = await supabaseAdmin.from("users").select(
      "*, class:classes(id, name, sem, year)",
    ).eq("auth_id", userId).single();
    return {
      updatedUser: updatedUser ?? existingUser,
      syncResult,
    };
  } catch (err) {
    logger.warn("Synchronous profile sync failed", err);
    return { updatedUser: existingUser, syncResult: null };
  }
}

async function loadExistingUserBundle(
  existingUserRaw: ExistingUserRawType,
  userId: string,
  shouldSync: boolean,
  isDebounced: boolean,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
): Promise<NextResponse> {
  let existingUser = existingUserRaw;
  let resolvedToken: string | null = null;
  let syncResult: {
    academic?: {
      current_semester?: string | null;
      current_year?: string | null;
    };
  } | null = null;
  if (shouldSync) {
    resolvedToken = await resolveAuthToken(existingUserRaw);
    if (resolvedToken) {
      const sync = await performSyncAndFetchUser(
        resolvedToken,
        userId,
        existingUser,
        isDebounced,
        supabaseAdmin,
      );
      existingUser = sync.updatedUser;
      syncResult = sync.syncResult;
    }
  }

  if (!shouldSync && !isDebounced) {
    after(async () => {
      let syncToken = resolvedToken ?? await getAuthTokenServer();
      if (!syncToken && existingUser.ezygo_token && existingUser.ezygo_iv) {
        try {
          syncToken = decrypt({
            iv: existingUser.ezygo_iv as string,
            content: existingUser.ezygo_token as string,
          });
        } catch (decryptErr) {
          logger.warn(
            "[loadExistingUserBundle] Background decrypt failed:",
            decryptErr,
          );
        }
      }
      if (!syncToken) return;
      try {
        await performProfileSync(
          syncToken,
          String(existingUser.id),
          userId,
          true,
          existingUser,
        );
      } catch (err) {
        logger.warn("Profile background sync failed", err);
      }
    });
  }
  const bundle = await getProfileBundle(
    userId,
    syncResult?.academic,
    existingUser,
  );
  if (!bundle) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(bundle);
}

const getHandler = async (req: NextRequest) => {
  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "Could not determine client IP" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const { success, reset, remaining, limit } = await profileRateLimiter.limit(
    ip,
  );
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: existingUserRaw } = await supabaseAdmin.from("users").select(
    "*, class:classes(id, name, sem, year)",
  ).eq("auth_id", user.id).maybeSingle();
  const searchParams = req.nextUrl.searchParams;
  let shouldSync = searchParams.get("sync") === "true";
  const force = searchParams.get("force") === "true";
  if (existingUserRaw && existingUserRaw.first_name) {
    const lastSyncedAtStr = existingUserRaw.last_synced_at as
      | string
      | null
      | undefined;
    const lastSyncedAt = lastSyncedAtStr
      ? new Date(lastSyncedAtStr)
      : new Date(0);
    const minutesSinceSync = (Date.now() - lastSyncedAt.getTime()) / 60000;
    const isDebounced = !force && minutesSinceSync < 5;

    // Check if semester/year has changed since last sync
    const userClass = existingUserRaw.class as
      | { sem?: string; year?: string }
      | null
      | undefined;
    const expectedAcademic = calculateCurrentAcademicInfo();
    const hasAcademicConflict = !userClass ||
      userClass.sem !== expectedAcademic.current_semester ||
      userClass.year !== expectedAcademic.current_year;

    // If there is no conflict/change, we can optimize and do the profile sync in the background (non-blocking)
    if (shouldSync && !hasAcademicConflict && !force) {
      shouldSync = false;
    }

    return loadExistingUserBundle(
      existingUserRaw,
      user.id,
      shouldSync,
      isDebounced,
      supabaseAdmin,
    );
  }

  return ingestNewProfile(user);
};

const patchSchema = z.object({
  first_name: personNameSchema.optional(),
  last_name: optionalPersonNameSchema.optional(),
  gender: genderSchema.optional().nullable(),
  birth_date: birthDateSchema.optional().nullable(),
  class_id: z.string().uuid().optional().nullable(),
});

function buildUpdatePayload(parsedData: z.infer<typeof patchSchema>) {
  const { first_name, last_name, gender, birth_date, class_id } = parsedData;
  const up: Record<string, unknown> = {};
  if (first_name !== undefined) up.first_name = first_name;
  if (last_name !== undefined) up.last_name = last_name;
  if (class_id !== undefined) up.class_id = class_id;
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
  return { up, first_name, last_name, gender, birth_date, class_id };
}

const patchHandler = async (
  req: NextRequest,
  { decryptedBody }: { decryptedBody?: unknown },
) => {
  // Enforce same-origin checks for browser/cookie flows; skip for bearer flows.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    const originErr = validateRequestOrigin(req);
    if (originErr) return originErr;
  }

  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "Could not determine client IP" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const { success, reset, remaining, limit } = await profileRateLimiter.limit(
    ip,
  );
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body = decryptedBody;
  if (!body) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid or empty JSON body" }, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, {
      status: 422,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { up, first_name, last_name, gender, birth_date, class_id } =
    buildUpdatePayload(parsed.data);

  const { error: updateError } = await supabaseAdmin.from("users").update(up)
    .eq("auth_id", user.id);
  if (updateError) {
    logger.error("[profile PATCH] Database update failed:", updateError);
    Sentry.captureException(updateError, {
      tags: { type: "db_update_error", location: "api/profile/patch" },
    });
    return NextResponse.json({ error: "Failed to update profile" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({
    first_name,
    last_name,
    gender,
    birth_date,
    class_id,
  });
};

export const GET = withSecurity(getHandler);
export const PATCH = withSecurity(patchHandler);
