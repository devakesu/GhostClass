-- PRIV-04: Enforce 24-hex-char (12-byte) IV format for AES-256-GCM fields
--
-- Aligns database CHECK constraints with the application-level IV validation
-- in src/lib/crypto.ts.  The decrypt() function rejects IVs that are not
-- exactly 24 hex characters (case-insensitive), matching the 96-bit (12-byte)
-- IV recommended by NIST SP 800-38D §8.2.1 for AES-GCM.
--
-- Previous IV columns stored 32-hex-char (16-byte) IVs.  If any such legacy
-- rows exist this migration will abort with an error.  In that case all
-- encrypted rows must be re-encrypted (decrypt with old key, re-encrypt with
-- 12-byte IVs producing 24-char hex) before re-running this migration.

DO $$
BEGIN
  -- Fail fast if any legacy 32-hex-char IVs are present in existing data.
  IF EXISTS (
    SELECT 1
    FROM "public"."users"
    WHERE ("ezygo_iv"        ~ '^[a-f0-9]{32}$')
       OR ("auth_password_iv" ~ '^[a-f0-9]{32}$')
       OR ("phone_iv"         ~ '^[a-f0-9]{32}$')
       OR ("gender_iv"        ~ '^[a-f0-9]{32}$')
       OR ("birth_date_iv"    ~ '^[a-f0-9]{32}$')
  ) THEN
    RAISE EXCEPTION
      'PRIV-04 migration aborted: legacy 32-hex-char IVs found in "public"."users". '
      'Re-encrypt all existing rows with 24-char (12-byte) IVs before applying this migration.';
  END IF;
END
$$;

ALTER TABLE "public"."users"
  ADD CONSTRAINT "check_ezygo_iv_format"
    CHECK (("ezygo_iv" IS NULL) OR ("ezygo_iv" ~* '^[a-f0-9]{24}$')),
  ADD CONSTRAINT "check_auth_password_iv_format"
    CHECK (("auth_password_iv" IS NULL) OR ("auth_password_iv" ~* '^[a-f0-9]{24}$')),
  ADD CONSTRAINT "check_phone_iv_format"
    CHECK (("phone_iv" IS NULL) OR ("phone_iv" ~* '^[a-f0-9]{24}$')),
  ADD CONSTRAINT "check_gender_iv_format"
    CHECK (("gender_iv" IS NULL) OR ("gender_iv" ~* '^[a-f0-9]{24}$')),
  ADD CONSTRAINT "check_birth_date_iv_format"
    CHECK (("birth_date_iv" IS NULL) OR ("birth_date_iv" ~* '^[a-f0-9]{24}$'));
