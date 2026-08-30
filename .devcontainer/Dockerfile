# syntax=docker/dockerfile:1.4@sha256:9ba7531bd80fb0a858632727cf7a112fbfd19b17e94c4e84ced81e24ef1a0dbc

# Main Base Image (Ubuntu 24.04 GLIBC compatible)
FROM mcr.microsoft.com/devcontainers/base:2.1.7-ubuntu24.04@sha256:4bcb1b466771b1ba1ea110e2a27daea2f6093f9527fb75ee59703ec89b5561cb

USER root

# 1. Native System Runtime & Dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    acl \
    adb \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    openjdk-21-jdk-headless \
    openssh-client \
    pkg-config \
    socat \
    unzip \
    wget \
    zlib1g \
    && install -m 0755 -d /etc/apt/keyrings \
    \
    # NodeSource Setup (Node 24)
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && chmod 644 /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    \
    # Docker CE Setup
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod 644 /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
        > /etc/apt/sources.list.d/docker.list \
    \
    # Final package install
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        docker-buildx-plugin \
        docker-ce-cli \
        docker-compose-plugin \
        nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. CLI Tools (Supabase + Infisical)
USER root
RUN set -eux; \
    SUPABASE_URL="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | jq -r '.assets[] | select(.name | contains("linux_amd64.tar.gz")) | .browser_download_url' | head -n 1)"; \
    test -n "$SUPABASE_URL"; \
    curl -fSL "$SUPABASE_URL" -o /tmp/supabase.tar.gz; \
    tar -xzf /tmp/supabase.tar.gz -C /tmp; \
    find /tmp -maxdepth 2 -type f -name supabase -exec install -m 0755 {} /usr/local/bin/supabase \; -exec rm -f {} \; ; \
    rm -f /tmp/supabase.tar.gz; \
    INFISICAL_URL="$(curl -fsSL https://api.github.com/repos/Infisical/cli/releases/latest | jq -r '.assets[] | select(.name | endswith("_linux_amd64.tar.gz")) | .browser_download_url' | head -n 1)"; \
    test -n "$INFISICAL_URL"; \
    curl -fSL "$INFISICAL_URL" -o /tmp/infisical.tar.gz; \
    tar -xzf /tmp/infisical.tar.gz -C /tmp; \
    find /tmp -maxdepth 3 -type f -name infisical -exec install -m 0755 {} /usr/local/bin/infisical \; -exec rm -f {} \; ; \
    rm -f /tmp/infisical.tar.gz; \
    command -v supabase; \
    command -v infisical

# 3. Configure Paths & Runtime Defaults
USER vscode
ENV HOME="/home/vscode"
ENV DEV_HUB="$HOME/dev-hub"
ENV FLUTTER_HOME="$DEV_HUB/sdks/flutter"
ENV ANDROID_HOME="$DEV_HUB/sdks/android"
ENV PUB_CACHE="$HOME/.pub-cache"
ENV PLAYWRIGHT_BROWSERS_PATH="$DEV_HUB/caches/playwright-browsers"
ENV NODE_OPTIONS="--max-old-space-size=9216"
ENV NPM_CONFIG_UPDATE_NOTIFIER="false"
ENV PATH="$PATH:$DEV_HUB/bin:$FLUTTER_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PUB_CACHE/bin"

# Backwards-compatibility symlink for sdk-mounts
RUN mkdir -p $HOME/dev-hub/sdks && ln -sf $HOME/dev-hub/sdks $HOME/sdk-mounts

# 4. Bake IDE Settings & Cross-IDE Extension Symlinks
RUN mkdir -p $HOME/.antigravity-server/data/Machine \
             $HOME/.antigravity-ide-server/data/Machine \
             $HOME/.vscode-server/data/Machine \
             $HOME/.vscode-server/extensions \
    && ln -s $HOME/.vscode-server/extensions $HOME/.antigravity-server/extensions \
    && ln -s $HOME/.vscode-server/extensions $HOME/.antigravity-ide-server/extensions \
    && SETTINGS='{ \
        "remote.forwardAgent": false, \
        "editor.formatOnSave": true, \
        "editor.codeActionsOnSave": { \
            "source.organizeImports": "explicit", \
            "source.fixAll.eslint": "explicit" \
        }, \
        "editor.defaultFormatter": "esbenp.prettier-vscode", \
        "typescript.tsdk": "node_modules/typescript/lib", \
        "typescript.inlayHints.variableTypes.enabled": true, \
        "typescript.inlayHints.functionLikeReturnTypes.enabled": true, \
        "typescript.inlayHints.parameterNames.enabled": "all", \
        "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"], \
        "errorlens.enabled": true, \
        "dart.flutterSdkPath": "/home/vscode/dev-hub/sdks/flutter" \
    }' \
    && echo "$SETTINGS" > $HOME/.antigravity-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.antigravity-ide-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.vscode-server/data/Machine/settings.json

# 5. Initialization Script Creation
USER root
COPY --chown=vscode:vscode --chmod=755 <<"EOF" /home/vscode/init_workspace.sh
#!/bin/bash
set -euo pipefail

echo "🚀 Starting GhostClass Workspace Setup..."

# --- 1. GIT CONFIG DIVERSION ---
if [ ! -L "/home/vscode/.gitconfig" ]; then
    if [ -f "/home/vscode/.gitconfig" ]; then
        mv /home/vscode/.gitconfig /home/vscode/.gitconfig_local
    else
        touch /home/vscode/.gitconfig_local
    fi
    ln -sf /home/vscode/.gitconfig_local /home/vscode/.gitconfig
fi
chmod 644 /home/vscode/.gitconfig_local 2>/dev/null || true

# --- 2. SSH AGENT & SIGNING SETUP ---
echo "🔑 Checking SSH Agent Forwarding..."
HAS_SSH_KEY=false
CLEAN_KEY=""

if [ -S "${SSH_AUTH_SOCK:-}" ] && ssh-add -L >/dev/null 2>&1; then
    CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | grep -i "ghost" | head -n 1 || true)
    [ -z "$CLEAN_KEY" ] && CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | head -n 1 || true)

    if [ -n "$CLEAN_KEY" ]; then
        HAS_SSH_KEY=true
        git config --global user.signingkey "$CLEAN_KEY"
        git config --global gpg.format ssh
        git config --global commit.gpgsign true
        echo "✅ SSH signing enabled."
    fi
else
    echo "⚠️ SSH Agent is not active or has no keys loaded."
fi

# --- 3. GIT IDENTITY ---
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

# --- 4. POPULATE ALLOWED SIGNERS ---
if [ "$HAS_SSH_KEY" = true ]; then
    FINAL_EMAIL=$(git config --global user.email)
    ALLOWED_SIGNERS_FILE="/home/vscode/.ssh/allowed_signers"

    mkdir -p /home/vscode/.ssh
    chmod 700 /home/vscode/.ssh

    echo "${FINAL_EMAIL:-*} ${CLEAN_KEY}" > "$ALLOWED_SIGNERS_FILE"
    chmod 600 "$ALLOWED_SIGNERS_FILE"

    git config --global gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS_FILE"
    echo "✅ Local SSH signature verification configured for ${FINAL_EMAIL:-*}"
fi

# --- 5. GIT SAFE DIRECTORY ---
TARGET_DIR="${WORKSPACE_DIR:-/ghostclass}"

if [ ! -d "$TARGET_DIR" ] && [ -d "$PWD" ]; then
    TARGET_DIR="$PWD"
fi

git config --global --add safe.directory "$TARGET_DIR"

# --- 6. NPM & FLUTTER SETUP ---
if [ -f "$TARGET_DIR/package.json" ]; then
    echo "📦 Synchronizing NPM packages..."
    cd "$TARGET_DIR"

    if [ -f "package-lock.json" ]; then
        npm ci --legacy-peer-deps
    else
        echo "⚠️ No package-lock.json found; running npm install instead."
        npm install
    fi

    echo "✅ NPM dependencies ready."
else
    echo "ℹ️ No package.json found yet; skipping NPM dependency installation."
fi

if [ -d "$TARGET_DIR/mobile" ] && command -v flutter >/dev/null 2>&1; then
    echo "🐦 Synchronizing Flutter dependencies..."
    cd "$TARGET_DIR/mobile" && flutter pub get
    echo "✅ Flutter dependencies ready."
fi

# --- 7. EXTENSION SYNC ---
EXTENSIONS=(
    "Dart-Code.flutter"
    "Dart-Code.dart-code"
    "esbenp.prettier-vscode"
    "dbaeumer.vscode-eslint"
    "bradlc.vscode-tailwindcss"
    "dsznajder.es7-react-js-snippets"
    "formulahendry.auto-rename-tag"
    "christian-kohler.path-intellisense"
    "christian-kohler.npm-intellisense"
    "davidanson.vscode-markdownlint"
    "oderwat.indent-rainbow"
    "usernamehw.errorlens"
    "ms-vscode.vscode-typescript-next"
)

echo "🔍 Searching for active IDE server binaries..."
VALID_CLIS=()

while IFS= read -r binary_path; do
    if [ -n "$binary_path" ] && "$binary_path" --version >/dev/null 2>&1; then
        VALID_CLIS+=("$binary_path")
    fi
done < <(
    find \
        ~/.vscode-server \
        ~/.antigravity-server \
        ~/.antigravity-ide-server \
        ~/.cursor-server \
        -type f -executable \
        \( -name "code-server" -o -name "antigravity-server" -o -name "antigravity-ide-server" -o -name "cursor-server" \) \
        2>/dev/null || true
)

if [ ${#VALID_CLIS[@]} -eq 0 ]; then
    echo "ℹ️ No active IDE server binaries found yet. Extensions can be installed when the IDE connects."
else
    while IFS= read -r CLI; do
        [ -z "$CLI" ] && continue

        echo "🔧 Synchronizing extensions via: $CLI"
        INSTALLED_EXTS=$("$CLI" --list-extensions 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)

        for ext in "${EXTENSIONS[@]}"; do
            EXT_LOWER=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

            if ! echo "$INSTALLED_EXTS" | grep -q "^${EXT_LOWER}$"; then
                echo "  ⬇️ Installing extension: $ext"
                "$CLI" --install-extension "$ext" >/dev/null 2>&1 || true
            fi
        done
    done < <(printf '%s\n' "${VALID_CLIS[@]}" | sort -u)
fi

echo "🎯 Initialization Complete!"
EOF

RUN sed -i 's/\r$//' /home/vscode/init_workspace.sh

COPY --chmod=755 <<'EOF' /usr/local/bin/docker-group-entrypoint.sh
#!/usr/bin/env bash

set -euo pipefail

DOCKER_SOCKET="${DOCKER_HOST_SOCKET:-/var/run/docker.sock}"

if [ -S "$DOCKER_SOCKET" ]; then
    DOCKER_GID="$(stat -c '%g' "$DOCKER_SOCKET")"

    if ! getent group "$DOCKER_GID" >/dev/null 2>&1; then
        groupadd --gid "$DOCKER_GID" docker-host
    else
        DOCKER_GROUP="$(getent group "$DOCKER_GID" | cut -d: -f1)"
    fi

    DOCKER_GROUP="${DOCKER_GROUP:-docker-host}"

    usermod -aG "$DOCKER_GROUP" vscode
fi

exec runuser -u vscode -- "$@"
EOF

ENTRYPOINT ["/usr/local/bin/docker-group-entrypoint.sh"]

# 6. User Environment Defaults & Entrypoint
USER root
WORKDIR /ghostclass
EXPOSE 3000 8000 8080 4000 5001 8081 8085 9099 54321 54322 54323 8181
CMD ["sleep", "infinity"]