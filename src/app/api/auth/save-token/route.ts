import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { authRateLimiter } from "@/lib/ratelimit";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { redact, getClientIp, egressFetch } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { setAuthCookie } from "@/lib/security/auth-cookie";
import { TERMS_VERSION } from "@/app/config/legal";
import { setTermsVersionCookie, clearTermsVersionCookie } from "@/app/actions/user";
import { getAdminClient } from "@/lib/supabase/admin";
import { performProfileSync } from "@/lib/user/sync";
import { withSecurity } from "@/lib/security/app-check";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";

export const dynamic = 'force-dynamic';

// Validation schemas
const SaveTokenRequestSchema = z.object({
  token: z.string()
    .min(18, "Token too short")
    .max(2048, "Token too long")
    .trim(),
  fcm_token: z.string().trim().optional(),
});

const EzygoUserSchema = z.object({
  username: z.string().min(1).max(100),
  id: z.union([z.string(), z.number()]).transform(val => String(val)),
  email: z.email(),
  mobile: z.string().optional(),
});

// Lock TTL in seconds - configurable via environment variable
const AUTH_LOCK_TTL = (() => {
  // Default 20s, min 15s, max 60s to reduce risk of lock expiry during slow auth flows
  const raw = process.env.AUTH_LOCK_TTL;
  const parsed = raw ? parseInt(raw, 10) : NaN;

  let ttl: number;
  let source: "default" | "env" | "clamped";

  if (isNaN(parsed) || parsed <= 0) {
    ttl = 20;
    source = "default";
  } else {
    const clamped = Math.max(15, Math.min(parsed, 60));
    ttl = clamped;
    source = clamped === parsed ? "env" : "clamped";
  }

  if (process.env.NODE_ENV === "development") {
    logger.dev(
      `[auth] AUTH_LOCK_TTL set to ${ttl}s (${source}${raw ? `, raw="${raw}"` : ""})`
    );
  }

  return ttl;
})();

/**
 * Acquires a distributed lock for user authentication operations
 * to prevent race conditions during concurrent logins
 * @returns Lock value if acquired successfully, null otherwise
 */
async function acquireAuthLock(userId: string): Promise<string | null> {
  const lockKey = `auth_lock:${userId}`;
  const lockValue = crypto.randomBytes(16).toString('hex');
  
  try {
    // SET NX (only set if doesn't exist) with expiration
    const result = await redis.set(lockKey, lockValue, {
      nx: true,
      ex: AUTH_LOCK_TTL,
    });
    
    return result === 'OK' ? lockValue : null;
  } catch (error) {
    logger.error('Failed to acquire auth lock:', error);
    Sentry.captureException(error, {
      tags: { type: 'redis_lock_error', location: 'acquire_auth_lock' },
      extra: { userId: redact("id", userId) },
    });
    // Throw error to distinguish Redis failures from lock contention
    throw error;
  }
}

/**
 * Releases the distributed lock for user authentication operations
 * Uses atomic compare-and-delete to ensure only the lock owner can release it
 */
async function releaseAuthLock(userId: string, lockValue: string): Promise<void> {
  const lockKey = `auth_lock:${userId}`;
  
  try {
    // Lua script for atomic compare-and-delete
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await redis.eval(luaScript, [lockKey], [lockValue]);
    
    // Log if lock was already released or taken by another process
    if (result === 0) {
      logger.warn(`Lock for user ${redact("id", userId)} was already released or expired`);
    }
  } catch (error) {
    logger.error('Failed to release auth lock:', error);
    Sentry.captureException(error, {
      tags: { type: 'redis_lock_error', location: 'release_auth_lock' },
      extra: { userId: redact("id", userId) },
    });
    // Re-throw so callers can handle Redis lock release failures consistently
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('Failed to release auth lock');
    }
  }
}

export const POST = withSecurity(async (req, { decryptedBody, authType }) => {
  const supabaseAdmin = getAdminClient();

  // 1. Origin/Host Validation
  const headerList = await headers();
  const isMobileApp = authType === "app-check";
  // Note: Rate limiting is performed later in this handler after client IP extraction.
  // SKIP origin validation in development mode for easier local testing.
  // This is safe in dev because: (1) the CSRF token still validates the request,
  // (2) rate limiting is still applied, and (3) there is no production traffic
  // in development. Never set NODE_ENV=development in a publicly accessible deployment.
  if (!isMobileApp && process.env.NODE_ENV !== "development") {
    const origin = headerList.get("origin");
    const host = headerList.get("host");
    if (!origin || !host) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    // Validate that NEXT_PUBLIC_APP_DOMAIN is configured for origin validation
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    if (!appDomain?.trim()) {
      logger.error("NEXT_PUBLIC_APP_DOMAIN is not configured - origin validation cannot proceed");
      return NextResponse.json(
        { error: "Server configuration error: security validation unavailable" },
        { status: 500 }
      );
    }

    try {
      const originHostname = new URL(origin).hostname.toLowerCase();
      const headerHostname = new URL(`http://${host}`).hostname.toLowerCase();
      
      // Ensure the request is same-origin with the Host header
      if (originHostname !== headerHostname) {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }

      // Enforce that the origin matches the configured app domain
      // SECURITY: NEXT_PUBLIC_APP_DOMAIN must be hostname only (no protocol)
      // Format enforced in .example.env: "example.com" NOT "https://example.com"
      // 
      // However, developers might include ports in development (e.g., "localhost:3000").
      // Extract hostname to handle this edge case consistently with backend proxy route.
      const appDomainNormalized = appDomain.trim();

      if (appDomainNormalized.includes("://")) {
        logger.error("Invalid NEXT_PUBLIC_APP_DOMAIN configuration: value must not include protocol", {
          appDomain: redact("id", appDomainNormalized),
        });
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
      }

      let appDomainHostname: string;
      try {
        // Parse as URL to extract hostname (strips port if present)
        appDomainHostname = new URL(`https://${appDomainNormalized}`).hostname.toLowerCase();
      } catch {
        // Fallback: assume it's already a hostname; strip any port if present
        appDomainHostname = appDomainNormalized.split(":")[0].toLowerCase();
      }

      if (originHostname !== appDomainHostname) {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }
  
  const ip = getClientIp(headerList);
  if (!ip) {
    const relevantHeaders: Record<string, string | null> = {
      "cf-connecting-ip": headerList.get("cf-connecting-ip"),
      "x-real-ip": headerList.get("x-real-ip"),
      "x-forwarded-for": headerList.get("x-forwarded-for"),
    };
    const safeHeaders = Object.fromEntries(
      Object.entries(relevantHeaders).map(([k, v]) => [k, v ? redact("id", v) : null])
    );
    logger.error("Unable to determine client IP from headers", { headers: safeHeaders });
    Sentry.captureMessage("Unable to determine client IP from headers", {
      level: "warning",
      extra: { headers: safeHeaders },
    });
    return NextResponse.json({ error: "Unable to determine client IP" }, { status: 400 });
  }
  const { success, limit, reset, remaining } = await authRateLimiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Slow down!", retryAfter: reset },
      {
        status: 429,
        headers: {
          "Retry-After": Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    );
  }

  let verifieduserId = "";
  let lockUserId = "";
  let lockValue: string | null = null;

  try {
    const body = decryptedBody || await req.json();
    
    const validation = SaveTokenRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          message: "Invalid request format",
          errors: validation.error.issues 
        },
        { status: 400 }
      );
    }

    const { token, fcm_token } = validation.data;

    // 2. Verify Token with EzyGo
    let verifiedUsername = "";
    
    try {
      const ezygoAbortCtrl = new AbortController();
      const ezygoTimeout = setTimeout(() => ezygoAbortCtrl.abort(), 15000);
      let ezygoRes: Response;
      try {
        ezygoRes = await egressFetch("user", {
          headers: { Authorization: `Bearer ${token}` },
          signal: ezygoAbortCtrl.signal,
        });
      } finally {
        clearTimeout(ezygoTimeout);
      }

      if (ezygoRes.status === 401) {
        return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
      }
      
      if (ezygoRes.status !== 200) {
        logger.error("Unexpected Ezygo response status:", ezygoRes.status);
        Sentry.captureException(new Error(`EzyGo Unexpected Status: ${ezygoRes.status}`), {
             tags: { type: "ezygo_api_error", location: "save_token" },
        });
        return NextResponse.json(
          { message: "Authentication service error" },
          { status: 502 }
        );
      }

      const ezygoData: unknown = await ezygoRes.json().catch(() => null);
      const userValidation = EzygoUserSchema.safeParse(ezygoData);
      if (!userValidation.success) {
        logger.error("Invalid Ezygo response:", userValidation.error);
        Sentry.captureException(userValidation.error, {
            tags: { type: "ezygo_schema_mismatch", location: "save_token" },
        });
        return NextResponse.json(
          { message: "Invalid user data from authentication service" },
          { status: 502 }
        );
      }

      verifiedUsername = userValidation.data.username;
      verifieduserId = userValidation.data.id;
      lockUserId = verifieduserId;

    } catch (err: unknown) {
      // Handle AbortError (manual 15s timeout) and TypeError (network failure) from native fetch.
      if (err instanceof Error && (err.name === 'AbortError' || err instanceof TypeError)) {
        logger.warn(`EzyGo API timeout/connection error (${err.name}: ${err.message})`);
        Sentry.captureException(err, {
          tags: { type: "ezygo_timeout", location: "save_token" },
          level: "warning",
        });
        return NextResponse.json({ message: "Authentication service unavailable. Please try again." }, { status: 504 });
      }
      
      Sentry.captureException(err, { tags: { type: "ezygo_network_error", location: "save_token" }, extra: { userId: redact("id", verifieduserId) } });
      
      return NextResponse.json({ message: "Authentication service error" }, { status: 502 });
    }

    if (!verifiedUsername || !verifieduserId) {
      return NextResponse.json({ message: "Could not verify user identity" }, { status: 401 });
    }

    // Sanitize User ID
    const sanitizedUserId = verifieduserId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedUserId !== verifieduserId) {
      return NextResponse.json({ message: "Invalid user identifier" }, { status: 400 });
    }

    // 3. Ghost Login Logic (Ephemeral Password)
    const ghostDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    if (!ghostDomain) {
      const configError = new Error("NEXT_PUBLIC_APP_DOMAIN is not configured");
      logger.error(configError.message);
      Sentry.captureException(configError, {
        tags: { type: "config_error", location: "save_token" },
      });
      return NextResponse.json(
        { message: "Server configuration error" },
        { status: 500 }
      );
    }
    const email = `ezygo_${sanitizedUserId}@${ghostDomain}`;
    
    // Validate Email Format
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emailRegex = new RegExp(`^[a-zA-Z0-9_-]+@${escapeRegExp(ghostDomain)}$`);
    
    if (!emailRegex.test(email)) {
      return NextResponse.json({ message: "Invalid email format" }, { status: 500 });
    }

    // Canonical password + Redis auth lock:
    // Instead of regenerating passwords (which would invalidate other devices),
    // we use a single canonical password per user and a Redis-based per-user auth lock
    // to coordinate concurrent login attempts without persisting per-device sessions here.
    let userId: string | undefined;
    let isFirstLogin = false;
    // Cached DB lookup result for the existing user — populated in the "already registered" branch
    // so the password retrieval and terms check later can re-use it instead of making extra round-trips.
    let cachedUserData: {
      auth_id?: string | null;
      auth_password?: string | null;
      auth_password_iv?: string | null;
      terms_version?: string | null;
      terms_accepted_at?: string | null;
    } | null = null;
    // Settings prefetch started early for returning users (CASE 2) so it runs concurrently
    // with signInWithPassword instead of sequentially after it (~50–150 ms saving per login).
    // Null for new users — they use the inline fetch inside the final Promise.all.
    let earlySettingsFetch: Promise<{ bunk_calculator_enabled: boolean | null; target_percentage: number | null } | null> | null = null;

    // Acquire lock to prevent concurrent operations
    try {
      lockValue = await acquireAuthLock(lockUserId);
    } catch (error) {
      // Redis error - fail fast
      logger.error('Redis lock service unavailable:', error);
      return NextResponse.json(
        { message: "Authentication service temporarily unavailable" },
        { status: 503 }
      );
    }
    
    if (!lockValue) {
      // Lock is held by another request - client should retry
      return NextResponse.json(
        { message: "Another login is in progress. Please try again." },
        { status: 409 }
      );
    }

    // A. Try to Create User First (new account)
    // Generate a canonical password (only used once on first login)
    const canonicalPassword = crypto.randomBytes(32).toString('hex');
    
    let createData: any;
    let createError: any;

    try {
      const result = await supabaseAdmin.auth.admin.createUser({
        email,
        password: canonicalPassword,
        email_confirm: true,
        user_metadata: { ezygo_id: verifieduserId },
      });
      createData = result.data;
      createError = result.error;
    } catch (err: any) {
      // Handle non-JSON infrastructure responses (e.g. "Forbidden" strings from WAF/Proxy)
      if (err instanceof SyntaxError || err.message?.includes("Unexpected token")) {
        logger.error("Supabase Infrastructure Error: Received non-JSON response (likely Forbidden).", {
          error: redact("id", err.message),
          userId: redact("id", verifieduserId),
        });
        return NextResponse.json(
          { 
            message: "Infrastructure security rejection. Please check your server environment keys and IP restrictions.",
            error: "InfrastructureForbidden" 
          }, 
          { status: 502 }
        );
      }
      throw err; // Re-throw other unexpected errors
    }

    if (createError) {
      // B. If User Exists -> Reuse existing password (do NOT update)
      if (createError.message?.toLowerCase().includes("already registered") || createError.status === 422) {
        // Let's use the 'users' table to resolve the Auth UUID.
        // Fetch all fields needed later (password, terms) in one query to avoid extra round-trips.
        const { data: existingMap } = await supabaseAdmin
            .from("users")
            .select("auth_id, auth_password, auth_password_iv, terms_version, terms_accepted_at")
            .eq("id", verifieduserId)
            .single();

        cachedUserData = existingMap ?? null;
        const targetAuthId = existingMap?.auth_id;

        if (!targetAuthId) {
          // --- CASE 1: ORPHAN USER (Exists in Auth, missing in DB) ---
          logger.warn(`Orphan Auth User detected for ${redact("id", verifieduserId)}. Initiating exhaustive cleanup...`);
          let orphanUserId: string | null = null;
          let page = 1;
          const PER_PAGE = 1000;
          const MAX_AUTH_SCAN_PAGES = 100;
          let hasMore = true;
          let pageLimitReached = false;

          // Paginated Search Loop
          while (hasMore) {
            if (page > MAX_AUTH_SCAN_PAGES) {
              pageLimitReached = true;
              break;
            }

            const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({ 
              page: page, 
              perPage: PER_PAGE 
            });

            if (listError) {
               logger.error("Failed to list users during cleanup:", listError);
               throw listError;
            }

            const users = data.users || [];
            
            // Try to find the user in the current page
            const found = users.find(u => u.email === email);
            if (found) {
              orphanUserId = found.id;
              break;
            }

            if (users.length < PER_PAGE) {
              hasMore = false;
            } else {
              page++;
            }
          }

          if (orphanUserId) {
            // Delete the orphan Auth record
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(orphanUserId);
            if (deleteError) throw deleteError;
            
            logger.dev(`Deleted orphan user ${orphanUserId}. Retrying creation...`);

            // Retry Creation (Fresh Start) with canonical password
            const { data: retryData, error: retryError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: canonicalPassword,
              email_confirm: true,
              user_metadata: { ezygo_id: verifieduserId },
            });

            if (retryError) throw retryError;
            userId = retryData.user.id;
            isFirstLogin = true;

          } else {
             const errorMsg = pageLimitReached
               ? `Critical: Auth scan limit reached for ${email} without locating orphan user.`
               : `Critical: 'User already registered' error, but email ${email} not found in Auth scan.`;
             logger.error(errorMsg);
             
             // CAPTURE CRITICAL SYNC ERROR
             Sentry.captureException(new Error(errorMsg), {
                 tags: { type: "critical_auth_sync", location: "save_token" },
                 extra: {
                   verifieduserId: redact("id", verifieduserId),
                   redactedEmail: redact("email", email),
                   page,
                   perPage: PER_PAGE,
                   maxPages: MAX_AUTH_SCAN_PAGES,
                   pageLimitReached,
                 }
             });

             return NextResponse.json({ message: "Account synchronization error" }, { status: 500 });
          }

        } else {
          // --- CASE 2: NORMAL USER (Exists in both) ---
          // IMPORTANT: Do NOT update password on subsequent logins!
          // This preserves existing sessions from other devices by keeping
          // the canonical password (and auth lock) stable across logins.
          userId = targetAuthId;
          // Start the settings fetch now — it only needs userId and is independent of
          // signInWithPassword. Overlapping them trims ~50–150 ms from the login RTT.
          earlySettingsFetch = (async () => {
            try {
              const { data } = await supabaseAdmin
                .from("user_settings")
                .select("bunk_calculator_enabled, target_percentage, disabled_courses")
                .eq("user_id", userId!)
                .maybeSingle();
              return data ?? null;
            } catch (settingsError) {
              logger.warn("Failed to prefetch settings (non-critical):", settingsError);
              return null;
            }
          })();
        }
        
      } else {
        throw createError;
      }
    } else {
      userId = createData.user.id;
      isFirstLogin = true;
    }

    // 4. Device-based Sign In
    // Strategy: Store canonical auth password in users table (encrypted),
    // allowing all devices to use the same password without it changing on each login.
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === "production";
    const supabaseUrl = (!isProd && process.env.NEXT_PUBLIC_SUPABASE_DEV_URL)
      ? process.env.NEXT_PUBLIC_SUPABASE_DEV_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = (!isProd && process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY)
      ? process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const supabase = createServerClient(
      supabaseUrl!,
      supabaseKey!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (_) {
              // Ignore cookie set errors in this context if they occur
            }
          },
        },
      }
    );

    // On first login: use the newly generated canonical password
    // On subsequent logins: retrieve the stored canonical password from database
    let passwordToUse = canonicalPassword;
    
    if (!isFirstLogin) {
      // Re-use data already fetched in the CASE 2 lookup to avoid a redundant round-trip.
      // Fall back to a fresh query only if cachedUserData is unavailable (e.g. CASE 1 orphan retry).
      const fetchResult = !cachedUserData
        ? await supabaseAdmin
            .from("users")
            .select("auth_password, auth_password_iv")
            .eq("id", verifieduserId)
            .single()
        : { data: cachedUserData, error: null };
      const { data: userData, error: userDataError } = fetchResult;

      if (userDataError) {
        logger.error("Failed to retrieve stored password for multi-device login (Supabase error):", userDataError);
        Sentry.captureException(userDataError, {
          tags: { type: "password_retrieval_failure", location: "save_token" },
          extra: { userId: redact("id", verifieduserId), source: "supabase" },
        });
        return NextResponse.json(
          { message: "Session establishment failed. Please try logging in again." },
          { status: 500 }
        );
      }

      if (!userData?.auth_password || !userData?.auth_password_iv) {
        // If there is no userData row at all, this is still an unrecoverable error.
        if (!userData) {
          const missingFieldsError = new Error("Missing canonical password for multi-device login");
          logger.error(
            "Failed to retrieve stored password for multi-device login: missing userData/auth_password/auth_password_iv",
            {
              userId: redact("id", verifieduserId),
              hasUserData: false,
            },
          );
          Sentry.captureException(missingFieldsError, {
            tags: { type: "password_retrieval_failure", location: "save_token" },
            extra: {
              userId: redact("id", verifieduserId),
              hasUserData: false,
              source: "missing_fields_no_user_row",
            },
          });
          return NextResponse.json(
            { message: "Session establishment failed. Please try logging in again." },
            { status: 500 }
          );
        }

        // Bootstrap canonical password for legacy users who have a user row but no stored password.
        logger.warn(
          "Bootstrapping canonical password for legacy user missing auth_password/auth_password_iv",
          {
            userId: redact("id", verifieduserId),
            hasUserData: true,
            hasAuthPassword: !!userData.auth_password,
            hasAuthPasswordIv: !!userData.auth_password_iv,
          },
        );

        Sentry.captureMessage(
          "Bootstrapping canonical password for legacy user (missing auth_password/auth_password_iv)",
          {
            level: "warning",
            tags: { type: "password_bootstrap", location: "save_token" },
            extra: {
              userId: redact("id", verifieduserId),
              hasUserData: true,
              hasAuthPassword: !!userData.auth_password,
              hasAuthPasswordIv: !!userData.auth_password_iv,
            },
          },
        );

        // Generate a strong random canonical password and store its encrypted form.
        // Using 32 bytes (44 base64 chars) for strong entropy, matching the security level
        // of the initial canonical password generation for new users.
        const legacyCanonicalPassword = crypto.randomBytes(32).toString("base64");

        // Reuse existing encryption helper; it is used elsewhere to populate auth_password/auth_password_iv.
        const { content: encryptedData, iv } = encrypt(legacyCanonicalPassword);

        // Use a conditional update to prevent race conditions: only update if auth_password is still NULL.
        // If another request already bootstrapped a password, we'll read that instead.
        const { data: updateResult, error: updatePasswordError } = await supabaseAdmin
          .from("users")
          .update({
            auth_password: encryptedData,
            auth_password_iv: iv,
          })
          .eq("id", verifieduserId)
          .is("auth_password", null)
          .select("auth_password, auth_password_iv");

        if (updatePasswordError) {
          logger.error(
            "Failed to bootstrap canonical password for legacy user (Supabase update error):",
            updatePasswordError,
          );
          Sentry.captureException(updatePasswordError, {
            tags: { type: "password_bootstrap_failure", location: "save_token" },
            extra: { userId: redact("id", verifieduserId), source: "supabase_update" },
          });
          return NextResponse.json(
            { message: "Session establishment failed. Please try logging in again." },
            { status: 500 }
          );
        }

        // If updateResult is empty, another request already set a password. Read it.
        if (!updateResult || updateResult.length === 0) {
          logger.dev(
            "Another request already bootstrapped canonical password for this user; reading it",
            { userId: redact("id", verifieduserId) }
          );

          const { data: refetchedData, error: refetchError } = await supabaseAdmin
            .from("users")
            .select("auth_password, auth_password_iv")
            .eq("id", verifieduserId)
            .single();

          if (refetchError || !refetchedData?.auth_password || !refetchedData?.auth_password_iv) {
            logger.error(
              "Failed to refetch bootstrapped password after race condition:",
              refetchError
            );
            Sentry.captureException(refetchError ?? new Error("Missing password after race"), {
              tags: { type: "password_refetch_failure", location: "save_token" },
              extra: { userId: redact("id", verifieduserId) },
            });
            return NextResponse.json(
              { message: "Session establishment failed. Please try logging in again." },
              { status: 500 }
            );
          }

          try {
            passwordToUse = decrypt(refetchedData.auth_password_iv, refetchedData.auth_password);
          } catch (decryptError) {
            logger.error("Failed to decrypt refetched password:", decryptError);
            Sentry.captureException(decryptError, {
              tags: { type: "password_decryption_failure", location: "save_token" },
              extra: { userId: redact("id", verifieduserId), context: "race_refetch" },
            });
            return NextResponse.json(
              { message: "Session establishment failed. Please try logging in again." },
              { status: 500 }
            );
          }
        } else {
          // We successfully set the canonical password in the users table; also update Supabase Auth.
          if (!legacyCanonicalPassword) {
            logger.error("Missing legacy canonical password before updating Supabase Auth", { userId: redact("id", verifieduserId) });
            Sentry.captureException(new Error("Missing legacyCanonicalPassword"), { tags: { type: "auth_password_update_failure", location: "save_token" }, extra: { userId: redact("id", verifieduserId) } });
            return NextResponse.json({ message: "Session establishment failed. Please try logging in again." }, { status: 500 });
          }

          if (!userId) {
            logger.error("Missing userId before updating Supabase Auth", { userId: redact("id", verifieduserId) });
            Sentry.captureException(new Error("Missing userId"), { tags: { type: "auth_password_update_failure", location: "save_token" }, extra: { userId: redact("id", verifieduserId) } });
            return NextResponse.json({ message: "Session establishment failed. Please try logging in again." }, { status: 500 });
          }

          const { data: _authUpdateData, error: authUpdateError } =
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password: legacyCanonicalPassword,
            });

          if (authUpdateError) {
            logger.error(
              "Failed to update Supabase Auth password during legacy bootstrap:",
              authUpdateError,
            );
            Sentry.captureException(authUpdateError, {
              tags: { type: "auth_password_update_failure", location: "save_token" },
              extra: { userId: redact("id", verifieduserId) },
            });
            return NextResponse.json(
              { message: "Session establishment failed. Please try logging in again." },
              { status: 500 },
            );
          }

          // We successfully set and synchronized the password; use it.
          passwordToUse = legacyCanonicalPassword;
        }
      } else {
        try {
          // Decrypt the canonical password
          passwordToUse = decrypt(userData.auth_password_iv, userData.auth_password);
        } catch (decryptError) {
          logger.error("Failed to decrypt password for multi-device login:", decryptError);
          Sentry.captureException(decryptError, {
            tags: { type: "password_decryption_failure", location: "save_token" },
            extra: { userId: redact("id", verifieduserId) },
          });
          return NextResponse.json(
            { message: "Session establishment failed. Please try logging in again." },
            { status: 500 }
          );
        }
      }
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: passwordToUse,
    });

    if (signInError) throw signInError;

    // 5. Encrypt & Save Token
    const { iv, content } = encrypt(token);
    
    // Validate Encryption
    if (!iv || !content || !/^[a-f0-9]{24}$/i.test(iv)) {
      throw new Error("Encryption failed during token save");
    }

    // Re-use the data already fetched from the users table — no extra DB round-trip needed.
    const existingUser = !isFirstLogin ? cachedUserData : null;

    // Encrypt the canonical password on first login
    let encryptedPassword: { iv: string; content: string } | null = null;
    if (isFirstLogin) {
      try {
        encryptedPassword = encrypt(canonicalPassword);
      } catch (encryptError) {
        logger.error("Failed to encrypt canonical password:", encryptError);
        Sentry.captureException(encryptError, {
          tags: { type: "password_encryption_failure", location: "save_token" },
          extra: { userId: redact("id", verifieduserId) },
        });
        return NextResponse.json(
          { message: "Failed to establish secure session" },
          { status: 500 }
        );
      }
    }

    // Run the DB upsert, settings prefetch and EzyGo sync in parallel
    let syncResult: any = null;
    let userSettings: any = null;
    const [upsertResult, settingsFetchResult] = await Promise.all([
      supabaseAdmin
        .from("users")
        .upsert({
          id: verifieduserId,
          username: verifiedUsername,
          ezygo_token: content,
          ezygo_iv: iv,
          auth_id: userId,
          ...(isFirstLogin && encryptedPassword && {
            auth_password: encryptedPassword.content,
            auth_password_iv: encryptedPassword.iv,
          }),
          ...(isMobileApp && { has_mobile_app: true }),
          ...(fcm_token ? { fcm_token } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" }),
      earlySettingsFetch ?? (async () => {
        try {
          const { data: settings } = await supabaseAdmin
            .from("user_settings")
            .select("bunk_calculator_enabled, target_percentage, disabled_courses")
            .eq("user_id", userId!)
            .maybeSingle();
          return settings;
        } catch (settingsError) {
          logger.warn("Failed to prefetch settings (non-critical):", settingsError);
          return null;
        }
      })(),
      // Centrally hydrate/refresh profile + academic info
      performProfileSync(token, verifieduserId, userId!).then(r => syncResult = r).catch(e => {
        logger.warn("Login-time profile sync failed (non-critical):", e);
        return null;
      })
    ]);

    const { error: dbError } = upsertResult;
    userSettings = settingsFetchResult;

    if (dbError) throw dbError;

    // Use derived academic info for the response
    const defaultInfo = calculateCurrentAcademicInfo();
    const currentSem = syncResult?.academic?.current_semester ?? defaultInfo.current_semester;
    const currentYear = syncResult?.academic?.current_year ?? defaultInfo.current_year;

    if (!isMobileApp) {
      await setAuthCookie(token);
      if (existingUser?.terms_version === TERMS_VERSION && existingUser?.terms_accepted_at) {
        await setTermsVersionCookie(TERMS_VERSION);
      } else {
        await clearTermsVersionCookie();
      }

      return NextResponse.json({ 
        success: true, 
        userId: userId ?? null, 
        settings: userSettings,
        current_semester: currentSem,
        current_year: currentYear
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        userId: userId ?? null, 
        settings: userSettings,
        session: signInData?.session || null,
        current_semester: currentSem,
        current_year: currentYear,
        id: verifieduserId,
        ezygo_token: token
      });
    }

  } catch (error: any) {
    logger.error("Auth Bridge Failed:", error);
    
    // Capture Main Failure
    Sentry.captureException(error, {
        tags: { type: "auth_bridge_failure", location: "save_token" },
        extra: { ip_truncated: ip.split('.').slice(0,3).join('.') }
    });

    return NextResponse.json(
      {
        message: "Failed to establish secure session",
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      },
      { status: 500 }
    );
  } finally {
    // Always release the lock after all operations complete
    // Guard against null lockValue and undefined verifieduserId
    if (lockValue && lockUserId) {
      try {
        await releaseAuthLock(lockUserId, lockValue);
      } catch (releaseError) {
        logger.error("Failed to release auth lock in finally block:", releaseError);
        Sentry.captureException(releaseError, {
          tags: { type: "auth_lock_release_failure", location: "save_token_finally" },
          extra: { lockUserId: redact("id", lockUserId) },
        });
        // Don't rethrow - we don't want lock release failures to mask the actual response
      }
    }
  }
});
