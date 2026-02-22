// GET /api/profile  – fetch profile, sync with EzyGo, return plaintext PII
// PATCH /api/profile – update user-editable fields, encrypt PII before storage
//
// PII fields (birth_date, gender, phone) are stored as AES-256-GCM ciphertext
// in the database (PRIV-02).  All encryption/decryption happens here, on the
// server.  The client never receives ciphertext or IV values.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { validateCsrfToken } from "@/lib/security/csrf";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { redact } from "@/lib/utils";
import { z } from "zod";

const BASE_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "");

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

export async function GET() {
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

  // 4. Fetch fresh profile data from EzyGo
  const token = await getAuthTokenServer();
  let ezygoData: EzygoProfileResponse | null = null;

  if (token && BASE_API_URL) {
    try {
      const ezygoRes = await fetch(`${BASE_API_URL}/myprofile`, {
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

  // Return the plaintext values that were saved
  return NextResponse.json({ first_name, last_name, gender, birth_date });
}
