#!/usr/bin/env bash
# ==============================================================================
# GhostClass - Coolify Pre-Deployment Signature Verification
#
# Verifies container image signatures before deployment using Sigstore Cosign
# and GitHub Actions OIDC keyless identity.
#
# Usage in Coolify (Pre-Deployment Command / Custom Start Script):
#   bash scripts/coolify-pre-deploy-verify.sh
#   OR directly paste contents into Coolify's Pre-Deployment command hook.
# ==============================================================================

set -euo pipefail

# Configurable defaults
DEFAULT_REPO="devakesu/GhostClass"
REPO="${GITHUB_REPOSITORY:-$DEFAULT_REPO}"
OIDC_ISSUER="https://token.actions.githubusercontent.com"
CERT_IDENTITY_REGEX="^https://github\.com/${REPO}/\.github/workflows/"

# Determine image to verify
# Coolify exposes the container image via COOLIFY_CONTAINER_IMAGE or internal envs
IMAGE_TO_VERIFY="${1:-${COOLIFY_CONTAINER_IMAGE:-${COOLIFY_IMAGE_NAME:-}}}"

if [ -z "${IMAGE_TO_VERIFY}" ]; then
  echo "⚠️  [Cosign Verify] COOLIFY_CONTAINER_IMAGE is not set."
  echo "ℹ️  Pass image as argument: $0 <image_reference>"
  exit 1
fi

echo "============================================================"
echo "🔒 GhostClass Supply Chain Security - Cosign Verification"
echo "============================================================"
echo "Target Image     : ${IMAGE_TO_VERIFY}"
echo "Repository       : ${REPO}"
echo "OIDC Issuer      : ${OIDC_ISSUER}"
echo "Identity Pattern : ${CERT_IDENTITY_REGEX}"
echo "============================================================"

# Ensure cosign binary is installed
if ! command -v cosign &> /dev/null && [ ! -x /tmp/cosign ]; then
  echo "📥 Cosign not found. Installing verified Cosign binary..."
  ARCH=$(uname -m)
  case "${ARCH}" in
    x86_64)  COSIGN_ARCH="amd64" ;;
    aarch64|arm64) COSIGN_ARCH="arm64" ;;
    *)       echo "❌ Unsupported architecture: ${ARCH}"; exit 1 ;;
  esac

  TMP_DIR=$(mktemp -d /tmp/cosign_install.XXXXXX)
  trap 'rm -rf "${TMP_DIR}"' EXIT

  curl -fsSL "https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-${COSIGN_ARCH}" -o "${TMP_DIR}/cosign"
  curl -fsSL "https://github.com/sigstore/cosign/releases/latest/download/cosign_checksums.txt" -o "${TMP_DIR}/checksums.txt"

  EXPECTED_SUM=$(grep "cosign-linux-${COSIGN_ARCH}$" "${TMP_DIR}/checksums.txt" | awk '{print $1}')
  ACTUAL_SUM=$(sha256sum "${TMP_DIR}/cosign" | awk '{print $1}')

  if [ -z "${EXPECTED_SUM}" ] || [ "${EXPECTED_SUM}" != "${ACTUAL_SUM}" ]; then
    echo "❌ Cosign binary SHA256 checksum mismatch! Download may be compromised."
    exit 1
  fi

  chmod +x "${TMP_DIR}/cosign"
  if [ -w /usr/local/bin ]; then
    mv "${TMP_DIR}/cosign" /usr/local/bin/cosign
    COSIGN_BIN="/usr/local/bin/cosign"
  else
    mv "${TMP_DIR}/cosign" /tmp/cosign
    COSIGN_BIN="/tmp/cosign"
  fi
  echo "✓ Cosign binary verified and installed."
else
  if command -v cosign &> /dev/null; then
    COSIGN_BIN="$(command -v cosign)"
  else
    COSIGN_BIN="/tmp/cosign"
  fi
fi

echo "🔍 Running signature verification..."
VERIFIED=0
for i in 1 2 3; do
  if "${COSIGN_BIN}" verify \
    --certificate-identity-regexp="${CERT_IDENTITY_REGEX}" \
    --certificate-oidc-issuer="${OIDC_ISSUER}" \
    "${IMAGE_TO_VERIFY}"; then
    VERIFIED=1
    break
  fi
  if [ "$i" -lt 3 ]; then
    echo "⚠️ Signature verification attempt $i failed. Retrying in 10s (waiting for Rekor log propagation)..."
    sleep 10
  fi
done

if [ "$VERIFIED" -ne 1 ]; then
  echo "❌ Container image signature verification failed after 3 attempts."
  exit 1
fi

echo "============================================================"
echo "✅ Verification successful! Container image signature is valid."
echo "============================================================"
