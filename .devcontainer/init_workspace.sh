#!/usr/bin/env bash
set -e

echo "🚀 Running GhostClass Dev Workspace Initialization..."

# --- 0. SILENCE SUDO HINT & RESOLVE UNNAMED GROUP IDS ---
touch "$HOME/.sudo_as_admin_successful" "$HOME/.hushlogin" 2>/dev/null || true
for gid in $(id -G 2>/dev/null); do
    if ! getent group "$gid" >/dev/null 2>&1; then
        sudo groupadd -g "$gid" "host-group-$gid" 2>/dev/null || true
    fi
done

# --- 1. RESOLVE WORKSPACE & ENSURE VOLUME OWNERSHIP ---
TARGET_DIR="${WORKSPACE_DIR:-${containerWorkspaceFolder:-/workspaces/GhostClass}}"
if [ ! -d "$TARGET_DIR" ]; then
    if [ -d "/workspaces/GhostClass" ]; then
        TARGET_DIR="/workspaces/GhostClass"
    elif [ -d "/ghostclass" ]; then
        TARGET_DIR="/ghostclass"
    else
        TARGET_DIR="$PWD"
    fi
fi

# Named Docker volumes and shadowed volumes (.dart_tool, build) are created by Docker as root on first mount.
# Ensure directories exist and recover non-root ownership conditionally (avoiding slow recursive scans).
echo "🔐 Verifying cache and workspace permissions..."
TARGET_VOLUME_DIRS=(
    "/home/vscode/.pub-cache"
    "/home/vscode/.gradle"
    "/home/vscode/.npm"
    "/home/vscode/.cache/ms-playwright"
    "$TARGET_DIR/mobile/.dart_tool"
    "$TARGET_DIR/mobile/build"
    "/workspaces/GhostClass/mobile/.dart_tool"
    "/workspaces/GhostClass/mobile/build"
    "/ghostclass/mobile/.dart_tool"
    "/ghostclass/mobile/build"
)

for vdir in "${TARGET_VOLUME_DIRS[@]}"; do
    if [ ! -d "$vdir" ]; then
        sudo mkdir -p "$vdir" 2>/dev/null || true
    fi
    if [ -d "$vdir" ] && [ "$(stat -c '%u' "$vdir" 2>/dev/null)" != "$(id -u)" ]; then
        sudo chown -R vscode:vscode "$vdir" 2>/dev/null || true
        sudo chmod -R 775 "$vdir" 2>/dev/null || true
    fi
done

# --- 2. GIT CONFIG DIVERSION ---
if [ ! -L "/home/vscode/.gitconfig" ]; then
    if [ -f "/home/vscode/.gitconfig" ]; then
        mv /home/vscode/.gitconfig /home/vscode/.gitconfig_local
    else
        touch /home/vscode/.gitconfig_local
    fi
    ln -sf /home/vscode/.gitconfig_local /home/vscode/.gitconfig
fi
chmod 644 /home/vscode/.gitconfig_local 2>/dev/null || true

# --- 3. SSH AGENT & SIGNING SETUP ---
echo "🔑 Checking SSH Agent Forwarding..."
HAS_SSH_KEY=false
if [ -S "${SSH_AUTH_SOCK:-}" ] && ssh-add -L >/dev/null 2>&1; then
    CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | grep -i "ghost" | head -n 1 || true)
    [ -z "$CLEAN_KEY" ] && CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | head -n 1 || true)

    if [ -n "$CLEAN_KEY" ]; then
        HAS_SSH_KEY=true
        git config --global user.signingkey "$CLEAN_KEY"
        git config --global gpg.format ssh
        git config --global commit.gpgsign true

        ALLOWED_FILE="/home/vscode/.ssh/allowed_signers"
        mkdir -p /home/vscode/.ssh && chmod 700 /home/vscode/.ssh
        EMAIL=$(git config --global user.email 2>/dev/null || echo "*")
        echo "${EMAIL:-*} ${CLEAN_KEY}" > "$ALLOWED_FILE"
        chmod 600 "$ALLOWED_FILE"
        git config --global gpg.ssh.allowedSignersFile "$ALLOWED_FILE"
        echo "✅ SSH commit signing active."
    fi
else
    echo "ℹ️ SSH Agent is not active or has no keys loaded."
fi

# --- 4. GIT IDENTITY AUTO-CONFIGURATION ---
CURRENT_NAME=$(git config --global user.name 2>/dev/null || true)
CURRENT_EMAIL=$(git config --global user.email 2>/dev/null || true)

if [ -z "$CURRENT_NAME" ] || [ -z "$CURRENT_EMAIL" ]; then
    if [ -t 0 ]; then
        echo "👤 Setting up Git identity..."
        [ -z "$CURRENT_NAME" ] && read -rp "Enter Git Name: " CURRENT_NAME && git config --global user.name "$CURRENT_NAME"
        [ -z "$CURRENT_EMAIL" ] && read -rp "Enter Git Email: " CURRENT_EMAIL && git config --global user.email "$CURRENT_EMAIL"
    else
        AUTO_EMAIL=$(ssh-add -L 2>/dev/null | awk '{print $3}' | grep "@" | head -n 1 || true)
        [ -z "$CURRENT_NAME" ] && git config --global user.name "${GIT_NAME:-User}"
        [ -z "$CURRENT_EMAIL" ] && git config --global user.email "${GIT_EMAIL:-${AUTO_EMAIL:-dev@example.com}}"
        echo "ℹ️ Auto-configured Git identity: $(git config --global user.name) <$(git config --global user.email)>"
    fi
fi

# --- 5. GIT SAFE DIRECTORY ---
git config --global --add safe.directory "$TARGET_DIR" 2>/dev/null || true
git config --global --add safe.directory /workspaces/GhostClass 2>/dev/null || true
git config --global --add safe.directory /ghostclass 2>/dev/null || true

# --- 6. MONOREPO DEPENDENCIES SYNCHRONIZATION ---
if [ -f "$TARGET_DIR/package.json" ]; then
    echo "📦 Synchronizing Node/NPM dependencies in $TARGET_DIR..."
    if [ -f "$TARGET_DIR/package-lock.json" ]; then
        (cd "$TARGET_DIR" && npm ci --legacy-peer-deps || npm install --legacy-peer-deps)
    else
        (cd "$TARGET_DIR" && npm install --legacy-peer-deps)
    fi
fi

if [ -f "$TARGET_DIR/workers/package.json" ]; then
    echo "📦 Synchronizing Workers dependencies..."
    (cd "$TARGET_DIR/workers" && npm install) 2>/dev/null || true
fi

if [ -d "$TARGET_DIR/mobile" ] && command -v flutter >/dev/null 2>&1; then
    echo "🐦 Synchronizing Flutter packages in $TARGET_DIR/mobile..."
    (cd "$TARGET_DIR/mobile" && flutter pub get)
elif [ -d "/ghostclass/mobile" ] && command -v flutter >/dev/null 2>&1; then
    echo "🐦 Synchronizing Flutter packages in /ghostclass/mobile..."
    (cd "/ghostclass/mobile" && flutter pub get)
fi

# --- 7. EXTENSION SYNC ACROSS ALL IDES ---
EXTENSIONS=(
    "dbaeumer.vscode-eslint"
    "esbenp.prettier-vscode"
    "bradlc.vscode-tailwindcss"
    "dsznajder.es7-react-js-snippets"
    "formulahendry.auto-rename-tag"
    "christian-kohler.path-intellisense"
    "christian-kohler.npm-intellisense"
    "davidanson.vscode-markdownlint"
    "oderwat.indent-rainbow"
    "usernamehw.errorlens"
    "meezilla.json"
    "ms-vscode.vscode-typescript-next"
    "Dart-Code.flutter"
    "Dart-Code.dart-code"
    "vscjava.vscode-gradle"
    "cweijan.vscode-database-client2"
    "ms-playwright.playwright"
    "google.google-antigravity"
    "github.vscode-github-actions"
    "openai.chatgpt"
    "Anthropic.claude-code"
    "mkhl.direnv"
)

PRIMARY_CLI=""
while IFS= read -r binary_path; do
    if [ -n "$binary_path" ] && "$binary_path" --version >/dev/null 2>&1; then
        PRIMARY_CLI="$binary_path"
        break
    fi
done < <(find ~/.vscode-server ~/.antigravity-server ~/.antigravity-ide-server ~/.cursor-server -type f -executable \( -name "code-server" -o -name "antigravity-server" -o -name "antigravity-ide-server" -o -name "cursor-server" \) 2>/dev/null || true)

if [ -n "$PRIMARY_CLI" ]; then
    echo "🔧 Synchronizing extensions via: $PRIMARY_CLI"
    INSTALLED_EXTS=$("$PRIMARY_CLI" --list-extensions 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)
    for ext in "${EXTENSIONS[@]}"; do
        EXT_LOWER=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
        if ! echo "$INSTALLED_EXTS" | grep -q "^${EXT_LOWER}$"; then
            echo "  ⬇️ Installing extension: $ext"
            "$PRIMARY_CLI" --install-extension "$ext" --force >/dev/null 2>&1 || true
        fi
    done
fi

# --- 8. UI/UX SKILLS & IMPECCABLE INITIALIZATION ---
echo "🎨 Initializing UI/UX skills & Impeccable..."
if ! command -v uipro >/dev/null 2>&1; then
    sudo npm install -g ui-ux-pro-max-cli@2.15.0 >/dev/null 2>&1 || npm install -g ui-ux-pro-max-cli@2.15.0 >/dev/null 2>&1 || true
fi

(
    cd "$TARGET_DIR"
    if command -v uipro >/dev/null 2>&1; then
        uipro init --ai claude 2>/dev/null || true
        uipro init --ai cursor 2>/dev/null || true
        uipro init --ai antigravity 2>/dev/null || true
        uipro init --ai codex 2>/dev/null || true
        uipro init --ai gemini 2>/dev/null || true
        uipro init --ai opencode 2>/dev/null || true
    fi

    npx --yes impeccable install -y 2>/dev/null || true
) 2>/dev/null || true

# --- 9. DIRENV & INFISICAL AUTH SETUP ---
echo "⚡ Configuring direnv & Infisical auto-auth..."
if ! command -v direnv >/dev/null 2>&1; then
    echo "  📦 Installing direnv via apt..."
    sudo apt-get update -y >/dev/null 2>&1 && sudo apt-get install -y --no-install-recommends direnv >/dev/null 2>&1 || true
fi

# Ensure D-Bus Desktop Portal packages for GUI file picker
if ! dpkg -s xdg-desktop-portal xdg-desktop-portal-gtk >/dev/null 2>&1; then
    echo "  📦 Installing xdg-desktop-portal & GTK backend via apt..."
    sudo apt-get update -y >/dev/null 2>&1 && sudo apt-get install -y --no-install-recommends xdg-desktop-portal xdg-desktop-portal-gtk >/dev/null 2>&1 || true
fi

# Hook direnv into ~/.bashrc if not already present
if ! grep -q 'direnv hook bash' "$HOME/.bashrc" 2>/dev/null; then
    cat << 'EOF' >> "$HOME/.bashrc"

# Direnv shell hook & initial environment export
if command -v direnv >/dev/null 2>&1; then
    eval "$(direnv hook bash)"
    eval "$(direnv export bash 2>/dev/null)"
fi
EOF
fi

# Ensure infisical_auth helper is available in interactive shells
if ! grep -q 'infisical_auth()' "$HOME/.bashrc" 2>/dev/null; then
    cat << 'EOF' >> "$HOME/.bashrc"

# Infisical Universal Auth Helper
infisical_auth() {
  local client_id="${1:-${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-}}"
  local client_secret="${2:-${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-}}"

  if [ -z "$client_id" ] || [ -z "$client_secret" ] || \
     [ "$client_id" = "<YOUR_CLIENT_ID>" ] || [ "$client_secret" = "<YOUR_CLIENT_SECRET>" ]; then
    return 0
  fi

  if command -v infisical >/dev/null 2>&1; then
    local token
    token=$(infisical login --method=universal-auth \
      --client-id="$client_id" \
      --client-secret="$client_secret" \
      --plain --silent 2>/dev/null)
    if [ -n "$token" ]; then
      export INFISICAL_TOKEN="$token"
      echo "🔐 Infisical authenticated (INFISICAL_TOKEN exported)."
    fi
  fi
}
EOF
fi

# Automatically allow .envrc in target directory if it exists
if [ -f "$TARGET_DIR/.envrc" ]; then
    echo "  🔓 Authorizing direnv in $TARGET_DIR..."
    (cd "$TARGET_DIR" && direnv allow .) 2>/dev/null || true
fi

# Ensure ADB Port Forward Bridge is running for DevContainer Flutter debugging
if ! grep -q 'adb_forward_bridge.py' "$HOME/.bashrc" 2>/dev/null; then
    cat << 'EOF' >> "$HOME/.bashrc"

# Ensure ADB Port Forward Bridge is running for DevContainer Flutter debugging
if [[ -n "$ADB_SERVER_SOCKET" ]] && ! pgrep -f "adb_forward_bridge.py" >/dev/null 2>&1; then
    BRIDGE_PATH="/workspaces/GhostClass/scripts/adb_forward_bridge.py"
    [ ! -f "$BRIDGE_PATH" ] && BRIDGE_PATH="/ghostclass/scripts/adb_forward_bridge.py"
    if [ -f "$BRIDGE_PATH" ]; then
        nohup python3 "$BRIDGE_PATH" >/tmp/adb_forward_bridge.log 2>&1 &
    fi
fi
EOF
fi

if [[ -n "$ADB_SERVER_SOCKET" ]] && ! pgrep -f "adb_forward_bridge.py" >/dev/null 2>&1; then
    if [ -f "$TARGET_DIR/scripts/adb_forward_bridge.py" ]; then
        nohup python3 "$TARGET_DIR/scripts/adb_forward_bridge.py" >/tmp/adb_forward_bridge.log 2>&1 &
    fi
fi

# --- 10. SUPABASE, FLUTTER, DOCKER, SENTRY, REDIS & CLOUDFLARE MCP CONFIG ---
echo "🤖 Ensuring Supabase, Flutter, Docker, Sentry, Redis & Cloudflare MCP configs..."
if ! command -v sentry >/dev/null 2>&1; then
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    case "${ARCH}" in
      amd64)
        SENTRY_BIN="sentry-cli-Linux-x86_64"; SENTRY_HASH="c958865f9d4000183509ea21b1f04925d5390de6d8d87386b9e69f2b305070c3";;
      arm64)
        SENTRY_BIN="sentry-cli-Linux-aarch64"; SENTRY_HASH="b6e49fca868a36d20da2ada1832a0ce2f9ac7012c128207518b09d6b6c991f4d";;
      *) SENTRY_BIN="sentry-cli-Linux-x86_64"; SENTRY_HASH="c958865f9d4000183509ea21b1f04925d5390de6d8d87386b9e69f2b305070c3";;
    esac
    curl -fsSL "https://github.com/getsentry/sentry-cli/releases/download/3.8.2/${SENTRY_BIN}" -o /tmp/sentry 2>/dev/null || true
    if [ -f /tmp/sentry ] && echo "${SENTRY_HASH}  /tmp/sentry" | sha256sum -c - >/dev/null 2>&1; then
        sudo install -m 0755 /tmp/sentry /usr/local/bin/sentry 2>/dev/null || true
    fi
    rm -f /tmp/sentry
fi

# Ensure docker-mcp CLI plugin is installed
if ! docker mcp --version >/dev/null 2>&1; then
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    case "${ARCH}" in
      amd64)
        DOCKER_MCP_ARCH="linux-amd64"; DOCKER_MCP_HASH="e4df4c2dcc013011519da70a546589d8db0c1461a0050070239339675cfca98c";;
      arm64)
        DOCKER_MCP_ARCH="linux-arm64"; DOCKER_MCP_HASH="9d833fffb523c290cbd6e69d830a6f525998de0096cddb484ffecd7ce1d3096d";;
      *) DOCKER_MCP_ARCH="linux-amd64"; DOCKER_MCP_HASH="e4df4c2dcc013011519da70a546589d8db0c1461a0050070239339675cfca98c";;
    esac
    sudo mkdir -p /usr/libexec/docker/cli-plugins 2>/dev/null || true
    curl -fsSL "https://github.com/docker/mcp-gateway/releases/download/v0.44.3/docker-mcp-${DOCKER_MCP_ARCH}.tar.gz" -o /tmp/docker-mcp.tar.gz 2>/dev/null || true
    if [ -f /tmp/docker-mcp.tar.gz ] && echo "${DOCKER_MCP_HASH}  /tmp/docker-mcp.tar.gz" | sha256sum -c - >/dev/null 2>&1; then
        sudo tar -xzf /tmp/docker-mcp.tar.gz -C /usr/libexec/docker/cli-plugins 2>/dev/null || true
        sudo chmod 755 /usr/libexec/docker/cli-plugins/docker-mcp 2>/dev/null || true
    fi
    rm -f /tmp/docker-mcp.tar.gz
fi

mkdir -p "$HOME/.gemini/config" "$HOME/.gemini/antigravity" "$HOME/.config/Claude" "$HOME/.cursor"
MCP_CONFIG_FILES=(
    "$HOME/.gemini/config/mcp_config.json"
    "$HOME/.gemini/antigravity/mcp_config.json"
    "$HOME/.config/Claude/claude_desktop_config.json"
    "$HOME/.cursor/mcp.json"
)

for cfg in "${MCP_CONFIG_FILES[@]}"; do
    if [ ! -f "$cfg" ]; then
        echo '{"mcpServers":{}}' > "$cfg"
    fi
    python3 -c '
import json, sys
cfg_path = sys.argv[1]
try:
    with open(cfg_path, "r") as f:
        data = json.load(f)
except Exception:
    data = {}
servers = data.setdefault("mcpServers", {})

servers["supabase"] = {
    "serverUrl": "https://mcp.supabase.com/mcp",
    "url": "https://mcp.supabase.com/mcp",
    "type": "http"
}
if "dart" not in servers:
    servers["dart"] = {
        "command": "dart",
        "args": ["mcp-server"]
    }
if "MCP_DOCKER" not in servers:
    servers["MCP_DOCKER"] = {
        "command": "docker",
        "args": ["mcp", "gateway", "run"]
    }
servers["context7"] = {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "serverUrl": "https://mcp.context7.com/mcp"
}
if "sentry" not in servers:
    servers["sentry"] = {
        "command": "sentry",
        "args": ["mcp"]
    }
if "redis" not in servers:
    servers["redis"] = {
        "command": "redis-mcp-server",
        "args": ["--url", "redis://localhost:6379/0"]
    }
servers["cloudflare"] = {
    "type": "http",
    "url": "https://mcp.cloudflare.com/mcp",
    "serverUrl": "https://mcp.cloudflare.com/mcp"
}
with open(cfg_path, "w") as f:
    json.dump(data, f, indent=2)
' "$cfg" 2>/dev/null || true
done

# Ensure official Flutter and Dart skills exist in workspace
if [ -d "$TARGET_DIR" ] && [ ! -d "$TARGET_DIR/.agents/skills/flutter-apply-architecture-best-practices" ]; then
    (
        cd "$TARGET_DIR"
        npx skills add flutter/agent-plugins --skill '*' --agent universal --yes 2>/dev/null || true
        npx skills add dart-lang/skills --skill '*' --agent universal --yes 2>/dev/null || true
    ) 2>/dev/null || true
fi

# Ensure Cloudflare skills exist in workspace
if [ -d "$TARGET_DIR" ] && [ ! -d "$TARGET_DIR/.agents/skills/cloudflare" ]; then
    (
        cd "$TARGET_DIR"
        npx skills add cloudflare/skills --skill '*' --agent universal --yes 2>/dev/null || true
    ) 2>/dev/null || true
fi

echo "🎯 GhostClass Dev Workspace Setup Complete!"
