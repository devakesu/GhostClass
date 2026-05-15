#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(dirname "$(dirname "${BASH_SOURCE[0]}")")
PIN_FILE="$ROOT_DIR/.devcontainer/pinned-artifacts.json"

if [ ! -f "$PIN_FILE" ]; then
  echo "Pinned artifacts file not found: $PIN_FILE" >&2
  exit 1
fi

echo "Updating pinned artifacts in $PIN_FILE"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Update npm packages: fetch registry metadata and write dist.tarball and dist.shasum
update_npm() {
  name=$1
  echo "Fetching npm metadata for $name (latest)..."
  meta="$tmp/${name}.json"
  curl -fsSL "https://registry.npmjs.org/$name/latest" -o "$meta"
  url=$(jq -r '.dist.tarball' "$meta")
  shasum=$(jq -r '.dist.shasum' "$meta")
  jq --arg u "$url" --arg s "$shasum" '.[$name] |= . + {url: $u, shasum: $s}' --arg name "$name" "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
}

# Update supabase: attempt to get latest release asset URL and compute sha256
update_supabase() {
  echo "Fetching latest Supabase CLI release info..."
  api="https://api.github.com/repos/supabase/cli/releases/latest"
  release="$tmp/supabase_release.json"
  curl -fsSL "$api" -o "$release"
  # Try to find linux amd64 asset
  asset_url=$(jq -r '.assets[] | select(.name | test("linux.*amd64.*tar.gz")) | .browser_download_url' "$release" | head -n1)
  if [ -z "$asset_url" ]; then
    asset_url=$(jq -r '.assets[0].browser_download_url' "$release")
  fi
  if [ -z "$asset_url" ]; then
    echo "Could not find supabase release asset URL" >&2
    return 1
  fi
  echo "Downloading supabase asset to compute sha256..."
  curl -fsSL "$asset_url" -o "$tmp/supabase.tar.gz"
  sha256=$(sha256sum "$tmp/supabase.tar.gz" | cut -d' ' -f1)
  jq --arg u "$asset_url" --arg s "$sha256" '.supabase |= . + {url: $u, sha256: $s}' "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
}

# Update entries
update_npm "playwright"
update_npm "firebase-tools"
update_supabase

echo "Updated $PIN_FILE"
jq . "$PIN_FILE"
