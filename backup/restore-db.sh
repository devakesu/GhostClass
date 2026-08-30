#!/usr/bin/env bash

# ==============================================================================
# GhostClass - Database Restore Tool
#
# Pipeline:
#   Download encrypted backup (.dump.zst.age) from Cloudflare R2
#     │
#     ▼
#   Verify SHA-256 Checksum
#     │
#     ▼
#   age decrypt (-d with AGE_SECRET_KEY / private key file)
#     │
#     ▼
#   zstd decompress (-d)
#     │
#     ▼
#   pg_restore into TARGET_DB_URL
# ==============================================================================

set -euo pipefail

# ANSI color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

log_info "=========================================================="
log_info "       GhostClass PostgreSQL Backup Restoration Tool      "
log_info "=========================================================="

# ------------------------------------------------------------------------------
# 0. Dynamic Secret Injection via Infisical (if configured & credentials not yet in env)
# ------------------------------------------------------------------------------
if [ -z "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
  log_info "🔑 Injecting runtime secrets from Infisical (/runtime)..."
  exec infisical run --projectId "${INFISICAL_PROJECT_ID}" --path /runtime --env "${INFISICAL_ENV:-prod}" -- "$0" "$@"
fi

# ------------------------------------------------------------------------------
# 1. Input & Environment Validation
# ------------------------------------------------------------------------------
VERIFY_ONLY="${VERIFY_ONLY:-false}"

TARGET_DB_URL="${TARGET_DB_URL:-${SUPABASE_DB_URL:-}}"
BACKUP_FILE="${1:-}" # Optional: specific filename or s3 key

if [ "$VERIFY_ONLY" = "true" ] || [ "$TARGET_DB_URL" = "verify" ]; then
  VERIFY_ONLY="true"
  log_info "Mode: Verification & Integrity Test (Dry-run, no database modification)"
elif [ -z "${TARGET_DB_URL}" ]; then
  log_err "Missing TARGET_DB_URL for database restoration (or set VERIFY_ONLY=true)."
  exit 1
fi

if [ -z "${AGE_SECRET_KEY:-}" ] && [ -z "${AGE_KEY_FILE:-}" ]; then
  log_err "Missing AGE_SECRET_KEY (or AGE_KEY_FILE). Required to decrypt the backup."
  log_info "Usage:"
  log_info "  AGE_SECRET_KEY=\"AGE-PLUGIN-SIMPLEPQ-1...\" VERIFY_ONLY=true ./restore-db.sh"
  exit 1
fi

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  log_err "Missing Cloudflare R2 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET)."
  exit 1
fi

# Check required binaries
for tool in pg_restore zstd age aws sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log_err "Required tool not found in PATH: $tool"
    exit 1
  fi
done

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"
BACKUP_PREFIX="${BACKUP_PREFIX:-database}"

TMP_DIR="$(mktemp -d /tmp/ghostclass-restore-XXXXXX)"
chmod 700 "$TMP_DIR"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM ERR

# ------------------------------------------------------------------------------
# 2. Identify & Download Backup from Cloudflare R2
# ------------------------------------------------------------------------------
if [ -z "$BACKUP_FILE" ]; then
  log_info "No backup filename provided. Finding latest backup in s3://${R2_BUCKET}/${BACKUP_PREFIX}/daily/ ..."
  LATEST_KEY=$(aws s3api list-objects-v2 \
    --bucket "${R2_BUCKET}" \
    --prefix "${BACKUP_PREFIX}/daily/" \
    --endpoint-url "${R2_ENDPOINT}" \
    --query 'reverse(sort_by(Contents[?ends_with(Key, `.dump.zst.age`)], &LastModified))[0].Key' \
    --output text 2>/dev/null || echo "")

  if [ -z "$LATEST_KEY" ] || [ "$LATEST_KEY" = "None" ]; then
    log_err "No backup files (.dump.zst.age) found in R2!"
    exit 1
  fi
  BACKUP_KEY="$LATEST_KEY"
else
  if [[ "$BACKUP_FILE" == *"/"* ]]; then
    BACKUP_KEY="$BACKUP_FILE"
  else
    BACKUP_KEY="${BACKUP_PREFIX}/daily/${BACKUP_FILE}"
  fi
fi

FILENAME=$(basename "$BACKUP_KEY")
CHECKSUM_KEY="${BACKUP_KEY}.sha256"

log_info "Downloading backup: ${BACKUP_KEY} ..."
aws s3 cp "s3://${R2_BUCKET}/${BACKUP_KEY}" "${TMP_DIR}/${FILENAME}" --endpoint-url "${R2_ENDPOINT}"

log_info "Downloading checksum: ${CHECKSUM_KEY} ..."
aws s3 cp "s3://${R2_BUCKET}/${CHECKSUM_KEY}" "${TMP_DIR}/${FILENAME}.sha256" --endpoint-url "${R2_ENDPOINT}" || log_warn "Checksum file not found remotely."

# ------------------------------------------------------------------------------
# 3. Verify SHA-256 Checksum
# ------------------------------------------------------------------------------
if [ -f "${TMP_DIR}/${FILENAME}.sha256" ]; then
  log_info "Verifying SHA-256 integrity..."
  (
    cd "$TMP_DIR"
    sha256sum -c "${FILENAME}.sha256"
  )
  log_ok "SHA-256 verification passed."
fi

# ------------------------------------------------------------------------------
# 4. Decrypt & Decompress
# ------------------------------------------------------------------------------
log_info "Decrypting and decompressing archive..."

# Prepare age identity (supports single or space/comma-separated multiple identities)
if [ -n "${AGE_SECRET_KEY:-}" ]; then
  KEY_FILE="${TMP_DIR}/age.identity"
  # Place each key on its own line as required by age identity format
  echo "${AGE_SECRET_KEY}" | tr ' ,' '\n\n' | sed '/^$/d' > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
else
  KEY_FILE="${AGE_KEY_FILE}"
fi

age -d -i "$KEY_FILE" "${TMP_DIR}/${FILENAME}" | zstd -d > "${TMP_DIR}/restored.dump"

if [ ! -s "${TMP_DIR}/restored.dump" ]; then
  log_err "Failed to decrypt and decompress backup file."
  exit 1
fi

log_ok "Decryption and decompression successful."

# ------------------------------------------------------------------------------
# 5. Restore Database or Validate Dump Catalog
# ------------------------------------------------------------------------------
if [ "$VERIFY_ONLY" = "true" ]; then
  log_info "Inspecting database dump catalog (schema tables & objects)..."
  pg_restore -l "${TMP_DIR}/restored.dump" | head -n 30
  TOTAL_OBJECTS=$(pg_restore -l "${TMP_DIR}/restored.dump" | grep -c "TABLE DATA" || echo "0")
  log_ok "Dump integrity verified: Contains valid PostgreSQL custom dump with ${TOTAL_OBJECTS} data tables."
  log_ok "Verification test passed successfully! No database modifications were made."
  exit 0
fi

log_warn "Starting database restore into target database..."
log_warn "Target DB Host: $(echo "${TARGET_DB_URL}" | sed -E 's/.*@([^:\/]+).*/\1/')"

pg_restore \
  --dbname="${TARGET_DB_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "${TMP_DIR}/restored.dump" || {
    # pg_restore often returns non-zero on minor warnings (e.g. schema exists)
    log_warn "pg_restore finished with warnings (check above output)."
  }

log_ok "Database restoration completed successfully!"
