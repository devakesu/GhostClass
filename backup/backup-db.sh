#!/usr/bin/env bash

# ==============================================================================
# GhostClass - Database Backup Pipeline to Cloudflare R2
#
# Pipeline:
#   pg_dump (custom format -Fc)
#     │
#     ▼
#   zstd (level 19 max compression)
#     │
#     ▼
#   age (asymmetric public-key encryption: AGE_RECIPIENT)
#     │
#     ▼
#   Cloudflare R2 (S3-compatible API via AWS CLI)
#
# Security:
#   - Zero plaintext on disk: Streaming pipeline streams dump through zstd & age.
#   - Zero-Trust: Container only holds public age key. Private key is kept offline.
#   - Temporary scratch space is isolated in /tmp and shredded upon exit.
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

# Masking helper for logs
mask_secret() {
  local val="$1"
  local len=${#val}
  if [ "$len" -le 8 ]; then
    echo "********"
  else
    echo "${val:0:3}...${val: -4}"
  fi
}

log_info "=========================================================="
log_info "      GhostClass Automated PostgreSQL Backup Pipeline     "
log_info "=========================================================="

# ------------------------------------------------------------------------------
# 1. Environment Validation
# ------------------------------------------------------------------------------
ERRORS=0

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  log_err "Missing SUPABASE_DB_URL. Must be a valid PostgreSQL connection URI (e.g. postgresql://postgres:[password]@...)"
  ERRORS=$((ERRORS + 1))
fi

AGE_ARGS=()
if [ -z "${AGE_RECIPIENT:-}" ]; then
  log_err "Missing AGE_RECIPIENT. Must be an age public key (e.g. classical age1... or Post-Quantum age1pq1...)"
  ERRORS=$((ERRORS + 1))
else
  for recipient in ${AGE_RECIPIENT}; do
    if [[ ! "${recipient}" =~ ^age1[a-z0-9]+$ ]]; then
      log_err "Invalid recipient format: '${recipient}'. Expected 'age1...' or 'age1pq1...' public key."
      ERRORS=$((ERRORS + 1))
    else
      AGE_ARGS+=("-r" "${recipient}")
    fi
  done
fi

if [ -z "${R2_ACCESS_KEY_ID:-}" ]; then
  log_err "Missing R2_ACCESS_KEY_ID."
  ERRORS=$((ERRORS + 1))
fi

if [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  log_err "Missing R2_SECRET_ACCESS_KEY."
  ERRORS=$((ERRORS + 1))
fi

if [ -z "${R2_ENDPOINT:-}" ]; then
  log_err "Missing R2_ENDPOINT. (e.g. https://<account_id>.r2.cloudflarestorage.com)"
  ERRORS=$((ERRORS + 1))
fi

if [ -z "${R2_BUCKET:-}" ]; then
  log_err "Missing R2_BUCKET. (e.g. ghostclass-backups)"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  log_err "Validation failed with $ERRORS error(s). Exiting."
  exit 1
fi

# Check required binaries
for tool in pg_dump zstd age aws sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log_err "Required tool not found in PATH: $tool"
    exit 1
  fi
done

# Defaults & Config
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_PREFIX="${BACKUP_PREFIX:-database}"
TIMESTAMP="$(date -u +'%Y-%m-%d_%H-%M-%S')"
BACKUP_FILENAME="${TIMESTAMP}.dump.zst.age"
CHECKSUM_FILENAME="${BACKUP_FILENAME}.sha256"

# Configure AWS CLI environment for Cloudflare R2
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"

# ------------------------------------------------------------------------------
# 2. Setup Secure Isolated Scratch Directory
# ------------------------------------------------------------------------------
TMP_DIR="$(mktemp -d /tmp/ghostclass-backup-XXXXXX)"
chmod 700 "$TMP_DIR"

cleanup() {
  local exit_code=$?
  if [ -d "$TMP_DIR" ]; then
    log_info "Cleaning up temporary files..."
    rm -rf "$TMP_DIR"
  fi
  if [ "$exit_code" -eq 0 ]; then
    log_ok "Backup job completed successfully."
  else
    log_err "Backup job failed with exit code $exit_code."
  fi
}
trap cleanup EXIT INT TERM ERR

log_info "Target R2 Bucket: s3://${R2_BUCKET}/${BACKUP_PREFIX}/daily/"
log_info "Recipient Key:   $(mask_secret "$AGE_RECIPIENT")"
log_info "Backup File:     ${BACKUP_FILENAME}"

# ------------------------------------------------------------------------------
# 3. Streamed pg_dump -> zstd -> age Pipeline
# ------------------------------------------------------------------------------
# Schemas excluded: internal Supabase management/transient schemas that should
# not be restored or would cause permission/conflict issues on restore.
EXCLUDE_SCHEMAS_ARGS=(
  --exclude-schema="_analytics"
  --exclude-schema="_realtime"
  --exclude-schema="supabase_functions"
  --exclude-schema="graphql"
  --exclude-schema="graphql_public"
  --exclude-schema="net"
  --exclude-schema="vault"
)

log_info "Starting database dump & encrypted streaming compression..."

# Stream directly through compression and age encryption to avoid plaintext on disk
pg_dump \
  "${SUPABASE_DB_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  "${EXCLUDE_SCHEMAS_ARGS[@]}" \
  | zstd -19 -T0 \
  | age "${AGE_ARGS[@]}" \
  > "${TMP_DIR}/${BACKUP_FILENAME}"

if [ ! -s "${TMP_DIR}/${BACKUP_FILENAME}" ]; then
  log_err "Encrypted backup file is empty or was not created!"
  exit 1
fi

LOCAL_SIZE="$(wc -c < "${TMP_DIR}/${BACKUP_FILENAME}" | tr -d ' ')"
LOCAL_SIZE_HUMAN="$(du -h "${TMP_DIR}/${BACKUP_FILENAME}" | cut -f1)"
log_ok "Encrypted backup created successfully (${LOCAL_SIZE_HUMAN} / ${LOCAL_SIZE} bytes)."

# ------------------------------------------------------------------------------
# 4. Generate SHA-256 Checksum
# ------------------------------------------------------------------------------
log_info "Generating SHA-256 checksum..."
(
  cd "$TMP_DIR"
  sha256sum "${BACKUP_FILENAME}" > "${CHECKSUM_FILENAME}"
)
CHECKSUM_VALUE="$(awk '{print $1}' "${TMP_DIR}/${CHECKSUM_FILENAME}")"
log_ok "SHA-256: ${CHECKSUM_VALUE}"

# ------------------------------------------------------------------------------
# 5. Upload Encrypted Archive & Checksum to Cloudflare R2
# ------------------------------------------------------------------------------
R2_DAILY_PATH="s3://${R2_BUCKET}/${BACKUP_PREFIX}/daily/${BACKUP_FILENAME}"
R2_CHECKSUM_PATH="s3://${R2_BUCKET}/${BACKUP_PREFIX}/daily/${CHECKSUM_FILENAME}"

log_info "Uploading encrypted archive to Cloudflare R2..."
aws s3 cp \
  "${TMP_DIR}/${BACKUP_FILENAME}" \
  "${R2_DAILY_PATH}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress

log_info "Uploading SHA-256 checksum to Cloudflare R2..."
aws s3 cp \
  "${TMP_DIR}/${CHECKSUM_FILENAME}" \
  "${R2_CHECKSUM_PATH}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress

log_ok "Upload to R2 completed."

# ------------------------------------------------------------------------------
# 6. Verify Remote Object in R2
# ------------------------------------------------------------------------------
log_info "Verifying remote object in R2..."
REMOTE_SIZE=$(aws s3api head-object \
  --bucket "${R2_BUCKET}" \
  --key "${BACKUP_PREFIX}/daily/${BACKUP_FILENAME}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --query 'ContentLength' \
  --output text 2>/dev/null || echo "0")

if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  log_err "Verification failed! Local size ($LOCAL_SIZE) != Remote size ($REMOTE_SIZE)"
  exit 1
fi
log_ok "Remote verification successful: Remote size matches local file ($REMOTE_SIZE bytes)."

# ------------------------------------------------------------------------------
# 7. Retention Management (Pruning Old Daily Backups)
# ------------------------------------------------------------------------------
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  log_info "Checking retention policy (keeping daily backups for ${BACKUP_RETENTION_DAYS} days)..."

  # Cutoff timestamp in seconds
  CURRENT_EPOCH=$(date +%s)
  CUTOFF_SECONDS=$((BACKUP_RETENTION_DAYS * 86400))
  CUTOFF_EPOCH=$((CURRENT_EPOCH - CUTOFF_SECONDS))

  # List objects under prefix
  OBJECTS_JSON=$(aws s3api list-objects-v2 \
    --bucket "${R2_BUCKET}" \
    --prefix "${BACKUP_PREFIX}/daily/" \
    --endpoint-url "${R2_ENDPOINT}" \
    --query 'Contents[?LastModified!=`null`].[Key, LastModified]' \
    --output json 2>/dev/null || echo "[]")

  if [ "$OBJECTS_JSON" != "[]" ] && [ -n "$OBJECTS_JSON" ]; then
    echo "$OBJECTS_JSON" | jq -c '.[]' 2>/dev/null | while read -r item; do
      KEY=$(echo "$item" | jq -r '.[0]')
      MODIFIED=$(echo "$item" | jq -r '.[1]')

      # Convert ISO-8601 to epoch
      MODIFIED_EPOCH=$(date -d "$MODIFIED" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%S" "$MODIFIED" +%s 2>/dev/null || echo "0")

      if [ "$MODIFIED_EPOCH" -gt 0 ] && [ "$MODIFIED_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
        log_info "Pruning expired backup: ${KEY} (Modified: ${MODIFIED})"
        aws s3 rm "s3://${R2_BUCKET}/${KEY}" --endpoint-url "${R2_ENDPOINT}" || log_warn "Could not remove ${KEY}"
      fi
    done
  fi
  log_ok "Retention check completed."
fi

log_ok "All backup operations completed successfully for ${TIMESTAMP}."
exit 0
