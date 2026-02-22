import * as Sentry from "@sentry/nextjs";
import axios, { isAxiosError } from "axios";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { authRateLimiter } from "@/lib/ratelimit";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { redact, getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";
import { setAuthCookie } from "@/lib/security/auth-cookie";
import { TERMS_VERSION } from "@/app/config/legal";
import { setTermsVersionCookie } from "@/app/actions/user";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';

// Validation schemas
const SaveTokenRequestSchema = z.object({
  token: z.string()
    .min(18, "Token too short")
    .max(2048, "Token too long")
    .trim(),
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

export async function POST(req: Request) {
  const supabaseAdmin = getAdminClient();

  // 1. CSRF Protection
  // Extract CSRF token from request header
  const headerList = await headers();
  const csrfToken = headerList.get("x-csrf-token");
  const csrfValid = await validateCsrfToken(csrfToken);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // 2. Origin/Host Validation
  // Note: Rate limiting is performed later in this handler after client IP extraction.
  // SKIP origin validation in development mode for easier local testing.
  // This is safe in dev because: (1) the CSRF token still validates the request,
  // (2) rate limiting is still applied, and (3) there is no production traffic
  // in development. Never set NODE_ENV=development in a publicly accessible deployment.
  if (process.env.NODE_ENV !== "development") {
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
    const body = await req.json();
    
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

    const { token } = validation.data;

    // 2. Verify Token with EzyGo
    let verifiedUsername = "";
    
    try {
      const ezygoRes = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}user`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000, // Increased from 5s to 15s to handle slow backends and network latency
          validateStatus: (status) => status < 500,
        }
      );

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

      const userValidation = EzygoUserSchema.safeParse(ezygoRes.data);
      if (!userValidation.success) {
        logger.error("Invalid Ezygo response:", userValidation.error);
        Sentry.captureException(userValidation.error, {
            tags: { type: "ezygo_schema_mismatch", location: "save_token" },
            extra: { userId: redact("id", ezygoRes.data.userId) }
        });
        return NextResponse.json(
          { message: "Invalid user data from authentication service" },
          { status: 502 }
        );
      }

      verifiedUsername = userValidation.data.username;
      verifieduserId = userValidation.data.id;
      lockUserId = verifieduserId;

    } catch (err: any) {
      // Handle timeout and connection errors (ECONNABORTED, ENOTFOUND, ETIMEDOUT, EHOSTUNREACH, ECONNRESET, ENETUNREACH, ECONNREFUSED)
      if (isAxiosError(err) && err.code && ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'ENETUNREACH', 'ECONNREFUSED'].includes(err.code)) {
        logger.warn(`EzyGo API timeout/connection error (code: ${err.code})`);
        Sentry.captureException(err, {
          tags: { type: "ezygo_timeout", location: "save_token" },
          level: "warning",
        });
        return NextResponse.json({ message: "Authentication service unavailable. Please try again." }, { status: 504 });
      }
      if (isAxiosError(err) && err.response?.status === 401) {
        return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
      }
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Ezygo verification error:", errorMessage);
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
    
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: canonicalPassword,
      email_confirm: true,
      user_metadata: { ezygo_id: verifieduserId },
    });

    if (createError) {
      // B. If User Exists -> Reuse existing password (do NOT update)
      if (createError.message?.toLowerCase().includes("already registered") || createError.status === 422) {
        // Let's use the 'users' table to resolve the Auth UUID
        const { data: existingMap } = await supabaseAdmin
            .from("users")
            .select("auth_id")
            .eq("id", verifieduserId)
            .single();

        const targetAuthId = existingMap?.auth_id;

        if (!targetAuthId) {
          // --- CASE 1: ORPHAN USER (Exists in Auth, missing in DB) ---
          logger.warn(`Orphan Auth User detected for ${redact("id", verifieduserId)}. Initiating exhaustive cleanup...`);
          let orphanUserId: string | null = null;
          let page = 1;
          const PER_PAGE = 1000;
          let hasMore = true;

          // Paginated Search Loop
          while (hasMore) {
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
             const errorMsg = `Critical: 'User already registered' error, but email ${email} not found in Auth scan.`;
             logger.error(errorMsg);
             
             // CAPTURE CRITICAL SYNC ERROR
             Sentry.captureException(new Error(errorMsg), {
                 tags: { type: "critical_auth_sync", location: "save_token" },
                 extra: { verifieduserId: redact("id", verifieduserId), redactedEmail: redact("email", email) }
             });

             return NextResponse.json({ message: "Account synchronization error" }, { status: 500 });
          }

        } else {
          // --- CASE 2: NORMAL USER (Exists in both) ---
          // IMPORTANT: Do NOT update password on subsequent logins!
          // This preserves existing sessions from other devices by keeping
          // the canonical password (and auth lock) stable across logins.
          userId = targetAuthId;
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
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // On first login: use the newly generated canonical password
    // On subsequent logins: retrieve the stored canonical password from database
    let passwordToUse = canonicalPassword;
    
    if (!isFirstLogin) {
      // Retrieve the encrypted canonical password from the users table
      const { data: userData, error: userDataError } = await supabaseAdmin
        .from("users")
        .select("auth_password, auth_password_iv")
        .eq("id", verifieduserId)
        .single();

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
          logger.info(
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: passwordToUse,
    });

    if (signInError) throw signInError;

    // 5. Encrypt & Save Token
    const { iv, content } = encrypt(token);
    
    // Validate Encryption
    if (!iv || !content || !/^[a-f0-9]{32}$/i.test(iv)) {
      Sentry.captureException(new Error("Encryption failed during token save"), {
          extra: { userId: redact("id", String(userId)) }
      });
      return NextResponse.json({ message: "Encryption failed" }, { status: 500 });
    }

    // First, check if user has already accepted terms in the database
    const { data: existingUser, error: termsReadError } = await supabaseAdmin
      .from("users")
      .select("terms_version, terms_accepted_at")
      .eq("id", verifieduserId)
      .maybeSingle();

    if (termsReadError) {
      logger.error("Failed to read existing terms acceptance during auth save-token flow:", termsReadError);
      Sentry.captureException(termsReadError, {
        tags: { type: "terms_precheck_read_failure", location: "save_token" },
        extra: { userId: redact("id", String(verifieduserId)) },
      });
      // Continue without setting the terms cookie; behavior remains the same,
      // but the failure is now visible for debugging and monitoring.
    }

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

    const { error: dbError } = await supabaseAdmin
      .from("users")
      .upsert({ 
        id: verifieduserId,
        username: verifiedUsername,
        ezygo_token: content,
        ezygo_iv: iv,
        auth_id: userId,
        // Store encrypted canonical password on first login; subsequent logins don't update it
        // This allows all devices to use the same password without invalidating other sessions
        ...(isFirstLogin && encryptedPassword && { 
          auth_password: encryptedPassword.content,
          auth_password_iv: encryptedPassword.iv
        }),
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (dbError) throw dbError;
    await setAuthCookie(token);

    // If user has already accepted the current terms version in DB, set the cookie
    // This prevents redirect to /accept-terms when the user has already accepted
    if (existingUser?.terms_version === TERMS_VERSION && existingUser?.terms_accepted_at) {
      await setTermsVersionCookie(TERMS_VERSION);
    }

    // Fetch user settings to return to client for immediate localStorage population
    // This eliminates the 5-10 second delay showing defaults on fresh login
    let userSettings = null;
    try {
      const { data: settings } = await supabaseAdmin
        .from("user_settings")
        .select("bunk_calculator_enabled, target_percentage")
        .eq("user_id", userId)
        .maybeSingle();
      userSettings = settings;
    } catch (settingsError) {
      // Non-critical: settings will load via normal flow if this fails
      logger.warn("Failed to prefetch settings (non-critical):", settingsError);
    }

    return NextResponse.json({ success: true, settings: userSettings });

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
}
