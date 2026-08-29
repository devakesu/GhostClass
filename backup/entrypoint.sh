#!/usr/bin/env bash
set -euo pipefail

# If Infisical credentials are provided, dynamically fetch /runtime secrets into memory at runtime
if [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
  echo "🔑 Injecting runtime secrets via Infisical CLI..."
  exec infisical run --projectId "${INFISICAL_PROJECT_ID}" --path /runtime --env "${INFISICAL_ENV:-prod}" -- /usr/local/bin/backup-db.sh "$@"
else
  exec /usr/local/bin/backup-db.sh "$@"
fi
