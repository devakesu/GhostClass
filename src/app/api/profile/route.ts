// GET /api/profile  – fetch profile, sync with EzyGo, return plaintext PII
// PATCH /api/profile – update user-editable fields, encrypt PII before storage
//
// PII fields (birth_date, gender, phone) are stored as AES-256-GCM ciphertext
// in the database (PRIV-02).  All encryption/decryption happens here, on the
// server.  The client never receives ciphertext or IV values.

import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { validateCsrfToken } from "@/lib/security/csrf";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { redact } from "@/lib/utils";
import { egressFetch } from "@/lib/utils.server";
import { z } from "zod";

interface EzygoProfileResponse {
  user_id: string | number;
  username?: string;
  email?: string;
  mobile?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  gender?: string;
  sex?: string;
  birth_date?: string;
  dob?: string;
  user?: {
    username?: string;
    email?: string;
    mobile?: string;
  };
}

/** Prefer the local (user-edited) value; fall back to the remote value. */
function resolve(
  local: string | null | undefined,
  remote: string | number | null | undefined
): string | null {
  if (local && local !== "") return local;
  return remote ? String(remote) : null;
}

// ---------------------------------------------------------------------------
// GET – fetch profile
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // 0. Origin validation (defence-in-depth)
  // Prevents a cross-site top-level navigation from triggering a profile sync
  // upsert via the slow path. Response is already protected by CORS/SOP, but
  // Origin validation closes the gap consistently with /api/backend/[...path].
  // Skipped in development so localhost / tunnels work without extra config.
  if (process.env.NODE_ENV !== "development") {
    const appDomainRaw = process.env.NEXT_PUBLIC_APP_DOMAIN;
    const appDomain = appDomainRaw?.trim();

    if (!appDomain) {
      logger.error("GET /api/profile: NEXT_PUBLIC_APP_DOMAIN is missing or blank in production");
      Sentry.captureMessage("Server misconfiguration: NEXT_PUBLIC_APP_DOMAIN missing for /api/profile", {
        level: "error",
      });
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const origin = req.headers.get("origin");
    if (!origin) {
      // Some same-origin GET requests omit Origin — allow when Sec-Fetch-Site says same-origin.
      const secFetchSite = req.headers.get("sec-fetch-site");
      if (secFetchSite !== "same-origin") {
        return NextResponse.json({ error: "Origin header required" }, { status: 400 });
      }
    } else {
      try {
        const originHostname = new URL(origin).hostname.toLowerCase();
        const allowedHostname = new URL(`https://${appDomain}`).hostname.toLowerCase();
        if (originHostname !== allowedHostname) {
          return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid origin header" }, { status: 400 });
      }
    }
  }

  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // 1. Auth check
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Read existing row from DB (may contain encrypted PII)
  const { data: existingUser, error: dbError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (dbError) {
    Sentry.captureException(dbError, {
      tags: {
        type: "profile_local_fetch_error",
        location: "GET /api/profile",
      },
    });
  }

  // 3. Decrypt stored PII for soft-sync comparison
  let decryptedGender: string | null = null;
  let decryptedBirthDate: string | null = null;

  try {
    if (existingUser?.gender && existingUser?.gender_iv) {
      decryptedGender = decrypt(existingUser.gender_iv, existingUser.gender);
    }
  } catch (e) {
    logger.warn("Failed to decrypt gender:", e);
  }

  try {
    if (existingUser?.birth_date && existingUser?.birth_date_iv) {
      decryptedBirthDate = decrypt(
        existingUser.birth_date_iv,
        existingUser.birth_date
      );
    }
  } catch (e) {
    logger.warn("Failed to decrypt birth_date:", e);
  }

  // Also decrypt phone (needed for the fast-path response)
  let decryptedPhone: string | null = null;
  try {
    if (existingUser?.phone && existingUser?.phone_iv) {
      decryptedPhone = decrypt(existingUser.phone_iv, existingUser.phone);
    }
  } catch (e) {
    logger.warn("Failed to decrypt phone:", e);
  }

  // Fast path: DB row exists AND has a first_name (i.e. EzyGo has synced at least
  // once) → return immediately so the UI renders without blocking on a fresh EzyGo
  // round-trip. The background after() keeps names/email/phone fresh for subsequent
  // loads.
  //
  // Guard on first_name: save-token only writes id/username/token/auth_id — it never
  // writes email or first_name. Stub rows (created on first signup before the profile
  // route has run the slow path) will have first_name = null. Without this guard the
  // fast path returns all-null fields, React Query caches them for 5 min (staleTime),
  // and the name never appears on the dashboard until a manual refresh.
  if (existingUser && typeof existingUser.first_name === "string" && existingUser.first_name.trim().length > 0) {
    after(async () => {
      const syncToken = await getAuthTokenServer();
      if (!syncToken) return;

      let syncEzygoData: EzygoProfileResponse | null = null;
      try {
        const ezygoRes = await egressFetch("myprofile", {
          headers: { Authorization: `Bearer ${syncToken}` },
          cache: "no-store",
        });
        if (ezygoRes.ok) {
          const json = (await ezygoRes.json()) as
            | { data?: EzygoProfileResponse }
            | EzygoProfileResponse;
          syncEzygoData =
            (json as { data?: EzygoProfileResponse }).data ??
            (json as EzygoProfileResponse);
        } else {
          logger.warn(
            "[background] EzyGo profile sync returned non-OK:",
            ezygoRes.status
          );
        }
      } catch (err) {
        logger.warn("[background] EzyGo profile sync failed.");
        Sentry.captureException(err, {
          tags: {
            type: "ezygo_profile_sync_fail",
            location: "GET /api/profile background",
          },
        });
      }

      if (!syncEzygoData) return;

      let syncRemoteFirst = syncEzygoData.first_name;
      let syncRemoteLast = syncEzygoData.last_name;
      if (!syncRemoteFirst && syncEzygoData.full_name) {
        const parts = syncEzygoData.full_name.trim().split(" ");
        syncRemoteFirst = parts[0];
        syncRemoteLast = parts.slice(1).join(" ") || "";
      }

      const syncMergedFirst = resolve(existingUser.first_name, syncRemoteFirst);
      const syncMergedLast = resolve(existingUser.last_name, syncRemoteLast);
      const syncMergedPhone =
        syncEzygoData.mobile ?? syncEzygoData.user?.mobile ?? null;
      const syncMergedGender = resolve(
        decryptedGender,
        syncEzygoData.gender ?? syncEzygoData.sex
      );
      const syncMergedBirthDate = resolve(
        decryptedBirthDate,
        syncEzygoData.birth_date ?? syncEzygoData.dob
      );

      const syncEncPhone = syncMergedPhone ? encrypt(syncMergedPhone) : null;
      const syncEncGender = syncMergedGender
        ? encrypt(syncMergedGender)
        : null;
      const syncEncBirthDate = syncMergedBirthDate
        ? encrypt(syncMergedBirthDate)
        : null;

      // Use UPDATE (not upsert) so this background sync can never recreate a row
      // that was legitimately deleted (e.g. account deletion racing with an in-flight
      // after() callback). If the row no longer exists the update is a harmless no-op.
      const { data: bgUpdatedRows, error: bgUpdateError } = await supabaseAdmin
        .from("users")
        .update({
            username:
              syncEzygoData.username ??
              syncEzygoData.user?.username ??
              existingUser.username,
            email:
              syncEzygoData.email ??
              syncEzygoData.user?.email ??
              existingUser.email,
            first_name: syncMergedFirst,
            last_name: syncMergedLast,
            phone: syncEncPhone?.content ?? null,
            phone_iv: syncEncPhone?.iv ?? null,
            gender: syncEncGender?.content ?? null,
            gender_iv: syncEncGender?.iv ?? null,
            birth_date: syncEncBirthDate?.content ?? null,
            birth_date_iv: syncEncBirthDate?.iv ?? null,
            avatar_url: existingUser.avatar_url ?? null,
            terms_version: existingUser.terms_version ?? null,
            terms_accepted_at: existingUser.terms_accepted_at ?? null,
        })
        .eq("id", existingUser.id)
        .eq("auth_id", user.id)
        .select("id");

      if (bgUpdateError) {
        logger.error("[background] Profile sync update failed:", bgUpdateError);
        Sentry.captureException(bgUpdateError, {
          tags: {
            type: "profile_update_fail",
            location: "GET /api/profile background",
          },
          extra: { userId: redact("id", String(existingUser.id)) },
        });
      } else if (bgUpdatedRows?.length === 0) {
        // 0 rows matched: the row was deleted between the fast-path read and this
        // background update (possible race condition with account deletion).
        logger.warn("[background] Profile sync update matched 0 rows (possible race condition)", {
          userId: redact("id", String(existingUser.id)),
        });
      }
    });

    return NextResponse.json(
      {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        first_name: existingUser.first_name,
        last_name: existingUser.last_name,
        phone: decryptedPhone,
        gender: decryptedGender,
        birth_date: decryptedBirthDate,
        avatar_url: existingUser.avatar_url,
        terms_version: existingUser.terms_version,
        terms_accepted_at: existingUser.terms_accepted_at,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // Slow path: no DB row yet (first login). EzyGo is required to provide the
  // user_id needed to seed the record — must block here.

  // 4. Fetch fresh profile data from EzyGo
  const token = await getAuthTokenServer();
  let ezygoData: EzygoProfileResponse | null = null;

  if (token) {
    try {
      const ezygoRes = await egressFetch("myprofile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (ezygoRes.ok) {
        const json = (await ezygoRes.json()) as
          | { data?: EzygoProfileResponse }
          | EzygoProfileResponse;
        ezygoData =
          (json as { data?: EzygoProfileResponse }).data ??
          (json as EzygoProfileResponse);
      } else {
        logger.warn(
          "EzyGo profile fetch returned non-OK status:",
          ezygoRes.status
        );
      }
    } catch (err) {
      logger.warn("EzyGo profile fetch failed.");
      Sentry.captureException(err, {
        tags: {
          type: "ezygo_profile_sync_fail",
          location: "GET /api/profile",
        },
      });
    }
  }

  if (!ezygoData) {
    Sentry.captureMessage(
      "Failed to load fresh profile data from Ezygo; aborting to avoid serving stale data.",
      {
        level: "error",
        tags: {
          type: "profile_remote_unavailable",
          location: "GET /api/profile",
        },
      }
    );
    return NextResponse.json(
      { error: "Failed to load profile data from remote source." },
      { status: 502 }
    );
  }

  // 5. Merge local and remote data (soft sync)
  let remoteFirst = ezygoData.first_name;
  let remoteLast = ezygoData.last_name;
  if (!remoteFirst && ezygoData.full_name) {
    const parts = ezygoData.full_name.trim().split(" ");
    remoteFirst = parts[0];
    remoteLast = parts.slice(1).join(" ") || "";
  }

  const mergedFirst = resolve(existingUser?.first_name, remoteFirst);
  const mergedLast = resolve(existingUser?.last_name, remoteLast);
  // Phone is hard-synced (always take the EzyGo value)
  const mergedPhone =
    ezygoData.mobile ?? ezygoData.user?.mobile ?? null;
  // gender / birth_date are soft-synced (preserve local edits)
  const mergedGender = resolve(
    decryptedGender,
    ezygoData.gender ?? ezygoData.sex
  );
  const mergedBirthDate = resolve(
    decryptedBirthDate,
    ezygoData.birth_date ?? ezygoData.dob
  );

  // 6. Encrypt PII before storing
  const encPhone = mergedPhone ? encrypt(mergedPhone) : null;
  const encGender = mergedGender ? encrypt(mergedGender) : null;
  const encBirthDate = mergedBirthDate ? encrypt(mergedBirthDate) : null;

  // 7. Upsert merged row to DB
  const upsertData = {
    id: ezygoData.user_id,
    auth_id: user.id,
    username: ezygoData.username ?? ezygoData.user?.username,
    email: ezygoData.email ?? ezygoData.user?.email,
    first_name: mergedFirst,
    last_name: mergedLast,
    phone: encPhone?.content ?? null,
    phone_iv: encPhone?.iv ?? null,
    gender: encGender?.content ?? null,
    gender_iv: encGender?.iv ?? null,
    birth_date: encBirthDate?.content ?? null,
    birth_date_iv: encBirthDate?.iv ?? null,
    avatar_url: existingUser?.avatar_url ?? null,
    terms_version: existingUser?.terms_version ?? null,
    terms_accepted_at: existingUser?.terms_accepted_at ?? null,
  };

  const { error: upsertError } = await supabaseAdmin
    .from("users")
    .upsert(upsertData, { onConflict: "id" });

  if (upsertError) {
    logger.error("Profile sync upsert failed:", upsertError);
    Sentry.captureException(upsertError, {
      tags: { type: "profile_upsert_fail", location: "GET /api/profile" },
      extra: { userId: redact("id", String(upsertData.id)) },
    });
  }

  // 8. Return plaintext data — never expose ciphertext or IVs to the client
  return NextResponse.json(
    {
      id: upsertData.id,
      username: upsertData.username,
      email: upsertData.email,
      first_name: mergedFirst,
      last_name: mergedLast,
      phone: mergedPhone,
      gender: mergedGender,
      birth_date: mergedBirthDate,
      avatar_url: upsertData.avatar_url,
      terms_version: upsertData.terms_version,
      terms_accepted_at: upsertData.terms_accepted_at,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

// ---------------------------------------------------------------------------
// PATCH – update user-editable profile fields
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)")
    .optional()
    .nullable(),
});

export async function PATCH(req: NextRequest) {
  // 1. CSRF validation
  const csrfToken = req.headers.get(CSRF_HEADER);
  const csrfValid = await validateCsrfToken(csrfToken);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // 2. Auth check
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { first_name, last_name, gender, birth_date } = parsed.data;

  // 4. Build update payload; only include PII fields that are explicitly provided
  // so that omitting an optional field doesn't silently clear it in the DB.
  const updatePayload: Record<string, unknown> = {
    first_name,
    last_name: last_name ?? null,
  };

  if (typeof gender !== "undefined") {
    const encGender = gender ? encrypt(gender) : null;
    updatePayload.gender = encGender?.content ?? null;
    updatePayload.gender_iv = encGender?.iv ?? null;
  }

  if (typeof birth_date !== "undefined") {
    const encBirthDate = birth_date ? encrypt(birth_date) : null;
    updatePayload.birth_date = encBirthDate?.content ?? null;
    updatePayload.birth_date_iv = encBirthDate?.iv ?? null;
  }

  // 5. Update the DB row (identified by authenticated user's auth_id)
  const { error } = await supabaseAdmin
    .from("users")
    .update(updatePayload)
    .eq("auth_id", user.id);

  if (error) {
    logger.error("Profile update failed:", error);
    Sentry.captureException(error, {
      tags: { type: "profile_update_fail", location: "PATCH /api/profile" },
      extra: { userId: redact("id", user.id) },
    });
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  // Structured audit log: record which fields were mutated (field names only, never values).
  // PII field values (gender, birth_date) are NOT included here to avoid leaking
  // plaintext into stdout / Sentry payloads — the encrypted values are already in the DB.
  const changedFields = [
    "first_name",
    ...(typeof last_name !== "undefined" ? ["last_name"] : []),
    ...(typeof gender !== "undefined" ? ["gender"] : []),
    ...(typeof birth_date !== "undefined" ? ["birth_date"] : []),
  ];
  logger.info("[audit] profile.update", {
    action: "profile.update",
    auth_user_id: redact("id", user.id),
    changed_fields: changedFields,
  });
  Sentry.addBreadcrumb({
    category: "audit",
    message: "profile.update",
    level: "info",
    data: { changed_fields: changedFields },
  });

  // Return the plaintext values that were saved
  return NextResponse.json({ first_name, last_name, gender, birth_date });
}
