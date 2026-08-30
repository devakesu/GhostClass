#!/usr/bin/env bash
set -euo pipefail

# Helper function to execute a command with optional Infisical secret injection
run_cmd() {
  if [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
    echo "🔑 Injecting runtime secrets via Infisical CLI..."
    exec /usr/local/bin/infisical run --projectId "${INFISICAL_PROJECT_ID}" --path /runtime --env "${INFISICAL_ENV:-prod}" -- "$@"
  else
    exec "$@"
  fi
}

# ------------------------------------------------------------------------------
# 1. Direct Command / One-Shot Mode
# ------------------------------------------------------------------------------
if [ "$#" -gt 0 ]; then
  case "$1" in
    backup|backup-now|run-now)
      shift
      run_cmd /usr/local/bin/backup-db.sh "$@"
      ;;
    restore)
      shift
      run_cmd /usr/local/bin/restore-db.sh "$@"
      ;;
    *)
      run_cmd "$@"
      ;;
  esac
fi

# ------------------------------------------------------------------------------
# 2. Daemon / Scheduled Mode (Default on deployment)
# ------------------------------------------------------------------------------
echo "=========================================================="
echo "      GhostClass Database Backup Daemon Initialized       "
echo "=========================================================="

# Optional immediate backup upon container deployment
if [ "${BACKUP_ON_STARTUP:-false}" = "true" ]; then
  echo "🚀 Running initial backup on container startup..."
  if [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
    /usr/local/bin/infisical run --projectId "${INFISICAL_PROJECT_ID}" --path /runtime --env "${INFISICAL_ENV:-prod}" -- /usr/local/bin/backup-db.sh || echo "⚠️ Startup backup failed, continuing daemon..."
  else
    /usr/local/bin/backup-db.sh || echo "⚠️ Startup backup failed, continuing daemon..."
  fi
fi

CRON_SCHEDULE="${CRON_SCHEDULE:-0 2,14 * * *}"

# If internal cron is explicitly set to manual/disabled/none, stay idle in standby
if [ "${CRON_SCHEDULE}" = "disabled" ] || [ "${CRON_SCHEDULE}" = "none" ] || [ "${CRON_SCHEDULE}" = "manual" ]; then
  echo "🕒 Internal cron disabled (CRON_SCHEDULE=${CRON_SCHEDULE})."
  echo "💤 Container is in standby mode. Trigger backups via Coolify Scheduled Tasks or 'docker exec'."
  exec sleep infinity
fi

# Generate crontab for supercronic
CRONTAB_FILE="/tmp/crontab"
if [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
  echo "${CRON_SCHEDULE} /usr/local/bin/infisical run --projectId ${INFISICAL_PROJECT_ID} --path /runtime --env ${INFISICAL_ENV:-prod} -- /usr/local/bin/backup-db.sh" > "${CRONTAB_FILE}"
else
  echo "${CRON_SCHEDULE} /usr/local/bin/backup-db.sh" > "${CRONTAB_FILE}"
fi

echo "🕒 Starting Supercronic daemon with schedule: '${CRON_SCHEDULE}'"
echo "💡 You can also trigger backups manually at any time via: /usr/local/bin/backup-db.sh"
exec /usr/local/bin/supercronic "${CRONTAB_FILE}"

