#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(dirname "$(dirname "${BASH_SOURCE[0]}")")
PIN_FILE="$ROOT_DIR/.devcontainer/pinned-artifacts.json"
TARBALLS_DIR="$ROOT_DIR/.devcontainer/tarballs"
mkdir -p "$TARBALLS_DIR"

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

# Update npm packages: fetch registry metadata, download tarball, compute sha256
update_npm() {
  pkg_name=$1
  key_name=${2:-$1}
  echo "Fetching npm metadata for $pkg_name (latest)..."
  meta="$tmp/${key_name}.json"
  curl -fsSL "https://registry.npmjs.org/$pkg_name/latest" -o "$meta"

  if [ "$HAS_JQ" = true ]; then
    url=$(jq -r '.dist.tarball' "$meta")
  else
    url=$(node -e '
      const fs = require("fs");
      const meta = JSON.parse(fs.readFileSync(process.argv[1]));
      console.log(meta.dist.tarball);
    ' "$meta")
  fi

  echo "Downloading $pkg_name tarball to compute sha256..."
  curl -fsSL "$url" -o "$tmp/${key_name}.tgz"
  sha256=$(sha256sum "$tmp/${key_name}.tgz" | cut -d' ' -f1)

  # Determine filename for .devcontainer/tarballs/
  tarball_filename="${pkg_name##*/}.tgz"  # e.g. "npm.tgz", "@infisical/cli" -> "cli.tgz"
  # Use key_name-based filename for clarity
  case "$key_name" in
    npm)            tarball_filename="npm.tgz" ;;
    playwright)     tarball_filename="playwright.tgz" ;;
    playwright_core) tarball_filename="playwright-core.tgz" ;;
    firebase)       tarball_filename="firebase-tools.tgz" ;;
    infisical)      tarball_filename="infisical.tgz" ;;
    *)              tarball_filename="${key_name}.tgz" ;;
  esac
  cp "$tmp/${key_name}.tgz" "$TARBALLS_DIR/$tarball_filename"
  echo "  ✅ Saved to .devcontainer/tarballs/$tarball_filename (sha256: $sha256)"

  if [ "$HAS_JQ" = true ]; then
    jq --arg u "$url" --arg s "$sha256" --arg key "$key_name" '.[$key] |= {url: $u, sha256: $s}' "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
  else
    node -e '
      const fs = require("fs");
      const pin = JSON.parse(fs.readFileSync(process.argv[1]));
      const key = process.argv[4];
      pin[key] = { url: process.argv[2], sha256: process.argv[3] };
      fs.writeFileSync(process.argv[1], JSON.stringify(pin, null, 2) + "\n");
    ' "$PIN_FILE" "$url" "$sha256" "$key_name"
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

# Update gh CLI: fetch latest release asset URL and compute sha256
update_gh() {
  echo "Fetching latest gh CLI release info..."
  api="https://api.github.com/repos/cli/cli/releases/latest"
  release="$tmp/gh_release.json"
  curl -fsSL "$api" -o "$release"

  if [ "$HAS_JQ" = true ]; then
    asset_url=$(jq -r '.assets[] | select(.name | test("gh_.*_linux_amd64\\.tar\\.gz$")) | .browser_download_url' "$release" | head -n1)
  else
    asset_url=$(node -e '
      const fs = require("fs");
      const rel = JSON.parse(fs.readFileSync(process.argv[1]));
      const match = (rel.assets || []).find(a => /gh_.*_linux_amd64\.tar\.gz$/.test(a.name));
      console.log(match ? match.browser_download_url : "");
    ' "$release")
  fi

  if [ -z "$asset_url" ]; then
    echo "Could not find gh release asset URL" >&2
    return 1
  fi

  echo "Downloading gh asset to compute sha256..."
  curl -fsSL "$asset_url" -o "$tmp/gh.tar.gz"
  sha256=$(sha256sum "$tmp/gh.tar.gz" | cut -d' ' -f1)

  if [ "$HAS_JQ" = true ]; then
    jq --arg u "$asset_url" --arg s "$sha256" '.gh |= {url: $u, sha256: $s}' "$PIN_FILE" > "$tmp/pinned.json" && mv "$tmp/pinned.json" "$PIN_FILE"
  else
    node -e '
      const fs = require("fs");
      const pin = JSON.parse(fs.readFileSync(process.argv[1]));
      pin.gh = { url: process.argv[2], sha256: process.argv[3] };
      fs.writeFileSync(process.argv[1], JSON.stringify(pin, null, 2) + "\n");
    ' "$PIN_FILE" "$asset_url" "$sha256"
  fi
}

# Update entries
update_npm "npm" "npm"
update_npm "playwright" "playwright"
update_npm "playwright-core" "playwright_core"
update_npm "firebase-tools" "firebase"
update_npm "@infisical/cli" "infisical"
update_supabase
update_gh

echo "✅ Updated $PIN_FILE:"
cat "$PIN_FILE"
