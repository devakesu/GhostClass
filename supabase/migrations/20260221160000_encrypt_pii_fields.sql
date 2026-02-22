-- PRIV-02: Encrypt PII fields (birth_date, gender, phone)
--
-- birth_date, gender, and phone are special-category PII sourced from EzyGo.
-- They are now stored as AES-256-GCM ciphertext (same scheme as ezygo_token /
-- auth_password).  Each field gets a companion _iv column that stores the
-- 16-byte initialisation vector as a 32-hex-char string.
--
-- The phone UNIQUE constraint is dropped because identical plaintext values
-- produce different ciphertext on every encryption (random IV), making a
-- unique index on the ciphertext column meaningless and always-failing for
-- legitimate duplicate-avoidance purposes.
--
-- Existing plaintext values are cleared; they will be re-populated with
-- encrypted values the next time each user's profile is synced via the
-- GET /api/profile route.

-- Step 1: Add IV companion columns
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "birth_date_iv" "text",
  ADD COLUMN IF NOT EXISTS "gender_iv"     "text",
  ADD COLUMN IF NOT EXISTS "phone_iv"      "text";

-- Step 2: Clear existing plaintext PII data
--         (cannot encrypt in SQL; the application layer will re-sync and
--          store properly encrypted values on the user's next request)
UPDATE "public"."users"
SET "birth_date" = NULL,
    "gender"     = NULL,
    "phone"      = NULL;

-- Step 3: Enforce ciphertext / IV consistency (both NULL or both NOT NULL)
ALTER TABLE "public"."users"
  ADD CONSTRAINT "check_birth_date_consistency" CHECK (
    (("birth_date" IS NULL) AND ("birth_date_iv" IS NULL)) OR
    (("birth_date" IS NOT NULL) AND ("birth_date_iv" IS NOT NULL))
  ),
  ADD CONSTRAINT "check_gender_consistency" CHECK (
    (("gender" IS NULL) AND ("gender_iv" IS NULL)) OR
    (("gender" IS NOT NULL) AND ("gender_iv" IS NOT NULL))
  ),
  ADD CONSTRAINT "check_phone_consistency" CHECK (
    (("phone" IS NULL) AND ("phone_iv" IS NULL)) OR
    (("phone" IS NOT NULL) AND ("phone_iv" IS NOT NULL))
  );

-- Step 4: Enforce non-empty strings when values are present
ALTER TABLE "public"."users"
  ADD CONSTRAINT "check_birth_date_not_empty"    CHECK (("birth_date"    IS NULL) OR ("birth_date"    <> ''::"text")),
  ADD CONSTRAINT "check_birth_date_iv_not_empty" CHECK (("birth_date_iv" IS NULL) OR ("birth_date_iv" <> ''::"text")),
  ADD CONSTRAINT "check_gender_not_empty"        CHECK (("gender"        IS NULL) OR ("gender"        <> ''::"text")),
  ADD CONSTRAINT "check_gender_iv_not_empty"     CHECK (("gender_iv"     IS NULL) OR ("gender_iv"     <> ''::"text")),
  ADD CONSTRAINT "check_phone_not_empty"         CHECK (("phone"         IS NULL) OR ("phone"         <> ''::"text")),
  ADD CONSTRAINT "check_phone_iv_not_empty"      CHECK (("phone_iv"      IS NULL) OR ("phone_iv"      <> ''::"text"));

-- Step 5: Drop the phone UNIQUE constraint (meaningless on ciphertext)
ALTER TABLE "public"."users"
  DROP CONSTRAINT IF EXISTS "users_phone_key";
