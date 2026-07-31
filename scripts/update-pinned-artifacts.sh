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

# Check JSON tool availability (prefer jq, fallback to node)
HAS_JQ=false
HAS_NODE=false

if command -v jq >/dev/null 2>&1; then
  HAS_JQ=true
elif command -v node >/dev/null 2>&1; then
  HAS_NODE=true
else
  echo "❌ Error: Neither 'jq' nor 'node' is installed. Please install jq or node to update pinned artifacts." >&2
  exit 1
fi

# Update npm packages: fetch registry metadata and write dist.tarball and dist.shasum
update_npm() {
  pkg_name=$1
  key_name=${2:-$1}
  echo "Fetching npm metadata for $pkg_name (latest)..."
  meta="$tmp/${key_name}.json"
  curl -fsSL "https://registry.npmjs.org/$pkg_name/latest" -o "$meta"
  
  if [ "$HAS_JQ" = true ]; then
    url=$(jq -r '.dist.tarball' "$meta")
    shasum=$(jq -r '.dist.shasum' "$meta")
    jq --arg u "$url" --arg s "$shasum" --arg key "$key_name" '.[$key] |= . + {url: $u, shasum: $s}' "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
  else
    node -e '
      const fs = require("fs");
      const meta = JSON.parse(fs.readFileSync(process.argv[1]));
      const pin = JSON.parse(fs.readFileSync(process.argv[2]));
      const key = process.argv[3];
      pin[key] = Object.assign({}, pin[key], {
        url: meta.dist.tarball,
        shasum: meta.dist.shasum
      });
      fs.writeFileSync(process.argv[2], JSON.stringify(pin, null, 2) + "\n");
    ' "$meta" "$PIN_FILE" "$key_name"
  fi
}

# Update supabase: attempt to get latest release asset URL and compute sha256
update_supabase() {
  echo "Fetching latest Supabase CLI release info..."
  api="https://api.github.com/repos/supabase/cli/releases/latest"
  release="$tmp/supabase_release.json"
  curl -fsSL "$api" -o "$release"
  
  if [ "$HAS_JQ" = true ]; then
    asset_url=$(jq -r '.assets[] | select(.name | test("linux.*amd64.*tar.gz")) | .browser_download_url' "$release" | head -n1)
    if [ -z "$asset_url" ]; then
      asset_url=$(jq -r '.assets[0].browser_download_url' "$release")
    fi
  else
    asset_url=$(node -e '
      const fs = require("fs");
      const rel = JSON.parse(fs.readFileSync(process.argv[1]));
      const match = (rel.assets || []).find(a => /linux.*amd64.*tar\.gz/.test(a.name));
      console.log(match ? match.browser_download_url : (rel.assets[0] ? rel.assets[0].browser_download_url : ""));
    ' "$release")
  fi

  if [ -z "$asset_url" ]; then
    echo "Could not find supabase release asset URL" >&2
    return 1
  fi

  echo "Downloading supabase asset to compute sha256..."
  curl -fsSL "$asset_url" -o "$tmp/supabase.tar.gz"
  sha256=$(sha256sum "$tmp/supabase.tar.gz" | cut -d' ' -f1)

  if [ "$HAS_JQ" = true ]; then
    jq --arg u "$asset_url" --arg s "$sha256" '.supabase |= . + {url: $u, sha256: $s}' "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
  else
    node -e '
      const fs = require("fs");
      const pin = JSON.parse(fs.readFileSync(process.argv[1]));
      pin.supabase = Object.assign({}, pin.supabase, {
        url: process.argv[2],
        sha256: process.argv[3]
      });
      fs.writeFileSync(process.argv[1], JSON.stringify(pin, null, 2) + "\n");
    ' "$PIN_FILE" "$asset_url" "$sha256"
  fi
}

# Update entries
update_npm "npm" "npm"
update_npm "playwright" "playwright"
update_npm "firebase-tools" "firebase"
update_npm "@infisical/cli" "infisical"
update_supabase

echo "✅ Updated $PIN_FILE:"
cat "$PIN_FILE"
