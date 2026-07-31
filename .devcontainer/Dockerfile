# syntax=docker/dockerfile:1.4

# Main Base Image (Ubuntu 24.04 GLIBC compatible)
FROM mcr.microsoft.com/devcontainers/base:2.1.7-ubuntu24.04@sha256:4bcb1b466771b1ba1ea110e2a27daea2f6093f9527fb75ee59703ec89b5561cb

USER root

# 1. Consolidated System Dependencies & Docker Repos
RUN apt-get update && apt-get install -y --no-install-recommends \
    acl \
    adb \
    build-essential \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    openjdk-25-jdk-headless \
    socat \
    tk-dev \
    unzip \
    wget \
    libbz2-dev \
    libexpat1-dev \
    libffi-dev \
    libgdbm-dev \
    liblzma-dev \
    libncurses-dev \
    libreadline-dev \
    libsqlite3-dev \
    libssl-dev \
    zlib1g-dev \
    && install -m 0755 -d /etc/apt/keyrings \
    # NodeSource Setup (Node 24)
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && chmod 644 /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    # Docker CE Setup
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod 644 /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list \
    # Single final update and installation pass
    && apt-get update && apt-get install -y --no-install-recommends \
    docker-buildx-plugin \
    docker-ce-cli \
    docker-compose-plugin \
    nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY .devcontainer/pinned-artifacts.json* pinned-artifacts.json* /tmp/

# 2. CLI Tools (Npm, Supabase, Firebase, Infisical, Playwright)
ARG NPM_TARBALL_URL
ARG NPM_SHASUM
ARG PLAYWRIGHT_TARBALL_URL
ARG PLAYWRIGHT_SHASUM
ARG FIREBASE_TARBALL_URL
ARG FIREBASE_SHASUM
ARG INFISICAL_TARBALL_URL
ARG INFISICAL_SHASUM
ARG SUPABASE_TARBALL_URL
ARG SUPABASE_SHA256

RUN set -eu; \
    if [ -f /tmp/pinned-artifacts.json ]; then \
        NPM_TARBALL_URL=${NPM_TARBALL_URL:-$(jq -r '.npm.url // empty' /tmp/pinned-artifacts.json)}; \
        NPM_SHASUM=${NPM_SHASUM:-$(jq -r '.npm.shasum // empty' /tmp/pinned-artifacts.json)}; \
        PLAYWRIGHT_TARBALL_URL=${PLAYWRIGHT_TARBALL_URL:-$(jq -r '.playwright.url // empty' /tmp/pinned-artifacts.json)}; \
        PLAYWRIGHT_SHASUM=${PLAYWRIGHT_SHASUM:-$(jq -r '.playwright.shasum // empty' /tmp/pinned-artifacts.json)}; \
        FIREBASE_TARBALL_URL=${FIREBASE_TARBALL_URL:-$(jq -r '.firebase.url // empty' /tmp/pinned-artifacts.json)}; \
        FIREBASE_SHASUM=${FIREBASE_SHASUM:-$(jq -r '.firebase.shasum // empty' /tmp/pinned-artifacts.json)}; \
        INFISICAL_TARBALL_URL=${INFISICAL_TARBALL_URL:-$(jq -r '.infisical.url // empty' /tmp/pinned-artifacts.json)}; \
        INFISICAL_SHASUM=${INFISICAL_SHASUM:-$(jq -r '.infisical.shasum // empty' /tmp/pinned-artifacts.json)}; \
        SUPABASE_TARBALL_URL=${SUPABASE_TARBALL_URL:-$(jq -r '.supabase.url // empty' /tmp/pinned-artifacts.json)}; \
        SUPABASE_SHA256=${SUPABASE_SHA256:-$(jq -r '.supabase.sha256 // empty' /tmp/pinned-artifacts.json)}; \
    fi; \
    # 1. Install NPM (requires SHASUM)
    if [ -n "${NPM_TARBALL_URL:-}" ]; then \
        if [ -z "${NPM_SHASUM:-}" ]; then echo "ERROR: NPM_SHASUM missing for $NPM_TARBALL_URL" >&2; exit 1; fi; \
        curl -fSL "$NPM_TARBALL_URL" -o /tmp/npm.tgz; \
        echo "$NPM_SHASUM  /tmp/npm.tgz" | sha1sum -c - || { echo "ERROR: Checksum verification failed for npm" >&2; exit 1; }; \
        npm install -g /tmp/npm.tgz; \
        rm -f /tmp/npm.tgz; \
    fi; \
    # 2. Install Supabase CLI (requires SHA256 binary)
    if [ -n "${SUPABASE_TARBALL_URL:-}" ]; then \
        if [ -z "${SUPABASE_SHA256:-}" ]; then echo "ERROR: SUPABASE_SHA256 missing for $SUPABASE_TARBALL_URL" >&2; exit 1; fi; \
        curl -fSL "$SUPABASE_TARBALL_URL" -o /tmp/supabase.tar.gz; \
        echo "$SUPABASE_SHA256  /tmp/supabase.tar.gz" | sha256sum -c - || { echo "ERROR: Checksum verification failed for supabase" >&2; exit 1; }; \
        tar -xzf /tmp/supabase.tar.gz -C /tmp; \
        find /tmp -type f -name "supabase" -exec mv {} /usr/local/bin/ \; ; \
        chmod +x /usr/local/bin/supabase; \
        rm -f /tmp/supabase.tar.gz; \
    fi; \
    # 3. Install NPM CLI tool tarballs with path-matched --allow-scripts
    for NAME in "playwright" "firebase-tools" "infisical"; do \
        case "$NAME" in \
            playwright) URL="${PLAYWRIGHT_TARBALL_URL:-}"; SHASUM="${PLAYWRIGHT_SHASUM:-}" ;; \
            firebase-tools) URL="${FIREBASE_TARBALL_URL:-}"; SHASUM="${FIREBASE_SHASUM:-}" ;; \
            infisical) URL="${INFISICAL_TARBALL_URL:-}"; SHASUM="${INFISICAL_SHASUM:-}" ;; \
        esac; \
        if [ -n "$URL" ]; then \
            if [ -z "$SHASUM" ]; then echo "ERROR: SHASUM missing for $NAME ($URL)" >&2; exit 1; fi; \
            curl -fSL "$URL" -o "/tmp/$NAME.tgz"; \
            echo "$SHASUM  /tmp/$NAME.tgz" | sha1sum -c - || { echo "ERROR: Checksum verification failed for $NAME" >&2; exit 1; }; \
            npm install -g --allow-scripts="/tmp/$NAME.tgz" "/tmp/$NAME.tgz"; \
            rm -f "/tmp/$NAME.tgz"; \
        fi; \
    done; \
    # 4. Playwright dependencies & cleanup
    if command -v playwright >/dev/null 2>&1; then \
        playwright install-deps; \
    fi; \
    apt-get clean && rm -rf /var/lib/apt/lists/*; \
    npm cache clean --force

# Switch to vscode user for user-space SDKs
USER vscode
ENV HOME="/home/vscode"
ENV FLUTTER_HOME="$HOME/flutter-sdk"
ENV ANDROID_HOME="$HOME/android-sdk"
ENV DENO_INSTALL="$HOME/.deno"
ENV NODE_OPTIONS="--max-old-space-size=9216"
ENV PATH="$PATH:$FLUTTER_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$DENO_INSTALL/bin:$HOME/.pub-cache/bin"

# 3. Bake IDE Settings & Cross-IDE Extension Symlinks
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
        "dart.flutterSdkPath": "/home/vscode/flutter-sdk", \
        "dart.openDevTools": "never", \
        "deno.path": "/home/vscode/.deno/bin/deno", \
        "deno.enable": true \
    }' \
    && echo "$SETTINGS" > $HOME/.antigravity-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.antigravity-ide-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.vscode-server/data/Machine/settings.json

# 4. Android SDK Setup
ARG ANDROID_CMDLINE_TOOLS_URL
ARG ANDROID_CMDLINE_TOOLS_SHA256
RUN if [ -f /tmp/pinned-artifacts.json ]; then \
        ANDROID_CMDLINE_TOOLS_URL=${ANDROID_CMDLINE_TOOLS_URL:-$(jq -r '.android_cmdline_tools.url // empty' /tmp/pinned-artifacts.json)}; \
        ANDROID_CMDLINE_TOOLS_SHA256=${ANDROID_CMDLINE_TOOLS_SHA256:-$(jq -r '.android_cmdline_tools.sha256 // empty' /tmp/pinned-artifacts.json)}; \
    fi \
    && ANDROID_CMDLINE_TOOLS_URL=${ANDROID_CMDLINE_TOOLS_URL:-"https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"} \
    && mkdir -p $ANDROID_HOME/cmdline-tools \
    && wget "$ANDROID_CMDLINE_TOOLS_URL" -O /tmp/cmdline-tools.zip \
    && if [ -n "$ANDROID_CMDLINE_TOOLS_SHA256" ]; then echo "$ANDROID_CMDLINE_TOOLS_SHA256 /tmp/cmdline-tools.zip" | sha256sum -c -; fi \
    && unzip -q /tmp/cmdline-tools.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip \
    && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses \
    && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 5. Flutter SDK Pre-cache
ARG FLUTTER_URL
ARG FLUTTER_SHA256
RUN if [ -f /tmp/pinned-artifacts.json ]; then \
        FLUTTER_URL=${FLUTTER_URL:-$(jq -r '.flutter.url // empty' /tmp/pinned-artifacts.json)}; \
        FLUTTER_SHA256=${FLUTTER_SHA256:-$(jq -r '.flutter.sha256 // empty' /tmp/pinned-artifacts.json)}; \
    fi \
    && if [ -n "$FLUTTER_URL" ]; then \
        mkdir -p $FLUTTER_HOME \
        && curl -fSL "$FLUTTER_URL" -o /tmp/flutter.tar.xz \
        && if [ -n "$FLUTTER_SHA256" ]; then echo "$FLUTTER_SHA256 /tmp/flutter.tar.xz" | sha256sum -c -; fi \
        && tar -xJf /tmp/flutter.tar.xz -C /tmp \
        && rm -rf $FLUTTER_HOME \
        && mv /tmp/flutter $FLUTTER_HOME \
        && rm -f /tmp/flutter.tar.xz; \
    else \
        git clone https://github.com/flutter/flutter.git -b stable $FLUTTER_HOME; \
    fi \
    && $FLUTTER_HOME/bin/flutter precache \
    && flutter config --android-sdk $ANDROID_HOME

# 6. Initialization Script Creation
USER root
COPY --chown=vscode:vscode --chmod=755 <<"EOF" /home/vscode/init_workspace.sh
#!/bin/bash
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
if [ -S "$SSH_AUTH_SOCK" ] && ssh-add -L >/dev/null 2>&1; then
    CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | grep -i "ghost" | head -n 1)
    if [ -z "$CLEAN_KEY" ]; then
        CLEAN_KEY=$(ssh-add -L 2>/dev/null | tr -d '\r' | head -n 1)
    fi

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
CURRENT_NAME=$(git config --global user.name 2>/dev/null)
CURRENT_EMAIL=$(git config --global user.email 2>/dev/null)

if [ -z "$CURRENT_NAME" ] || [ -z "$CURRENT_EMAIL" ]; then
    if [ -t 0 ]; then
        echo "👤 Setting up Git identity..."
        [ -z "$CURRENT_NAME" ] && read -rp "Enter Git Name: " CURRENT_NAME && git config --global user.name "$CURRENT_NAME"
        [ -z "$CURRENT_EMAIL" ] && read -rp "Enter Git Email: " CURRENT_EMAIL && git config --global user.email "$CURRENT_EMAIL"
    else
        AUTO_EMAIL=$(ssh-add -L 2>/dev/null | awk '{print $3}' | grep "@" | head -n 1)
        [ -z "$CURRENT_NAME" ] && git config --global user.name "${GIT_NAME:-User}"
        [ -z "$CURRENT_EMAIL" ] && git config --global user.email "${GIT_EMAIL:-${AUTO_EMAIL:-dev@example.com}}"
        echo "ℹ️ Auto-configured Git identity: $(git config --global user.name) <$(git config --global user.email)>"
    fi
fi

# --- 4. POPULATE ALLOWED SIGNERS (AFTER IDENTITY IS FINALIZED) ---
if [ "$HAS_SSH_KEY" = true ]; then
    FINAL_EMAIL=$(git config --global user.email)
    ALLOWED_SIGNERS_FILE="/home/vscode/.ssh/allowed_signers"
    
    mkdir -p /home/vscode/.ssh && chmod 700 /home/vscode/.ssh
    
    # Prepend the finalized email to the clean public key
    echo "${FINAL_EMAIL:-*} ${CLEAN_KEY}" > "$ALLOWED_SIGNERS_FILE"
    chmod 600 "$ALLOWED_SIGNERS_FILE"
    
    git config --global gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS_FILE"
    echo "✅ Local SSH signature verification configured for ${FINAL_EMAIL:-*}"
fi

git config --global --add safe.directory /ghostclass

# --- 5. DENO SETUP ---
export DENO_INSTALL="/home/vscode/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

if [ ! -f "$DENO_INSTALL/bin/deno" ]; then
    echo "⬇️ Installing Deno..."
    mkdir -p "/tmp/deno_install"
    wget -q https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -O /tmp/deno_install/deno.zip
    unzip -q /tmp/deno_install/deno.zip -d "/tmp/deno_install"
    mkdir -p "$DENO_INSTALL/bin"
    mv /tmp/deno_install/deno "$DENO_INSTALL/bin/deno"
    chmod +x "$DENO_INSTALL/bin/deno"
    rm -rf "/tmp/deno_install"
fi

if ! grep -q "DENO_INSTALL" ~/.bashrc; then
    echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
    echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

# --- 6. NPM & FLUTTER SETUP ---
if [ -f "/ghostclass/package.json" ]; then 
    echo "📦 Synchronizing NPM packages..."
    cd /ghostclass && npm ci --legacy-peer-deps
fi
if [ -d "/ghostclass/mobile" ]; then 
    echo "🐦 Fetching Flutter dependencies..."
    cd /ghostclass/mobile && flutter pub get
fi

EXTENSIONS=(
  "Dart-Code.flutter" "Dart-Code.dart-code" "dsznajder.es7-react-js-snippets"
  "esbenp.prettier-vscode" "bradlc.vscode-tailwindcss" "formulahendry.auto-rename-tag"
  "christian-kohler.path-intellisense" "christian-kohler.npm-intellisense" "vitest.explorer"
  "ms-playwright.playwright" "ms-edgedevtools.vscode-edge-devtools" "davidanson.vscode-markdownlint"
  "ms-vscode.vscode-typescript-next" "oderwat.indent-rainbow"
  "dbaeumer.vscode-eslint" "usernamehw.errorlens"
)

echo "🔍 Searching for valid IDE server binaries..."
VALID_CLIS=()

while IFS= read -r binary_path; do
    if [ -n "$binary_path" ]; then
        if "$binary_path" --version >/dev/null 2>&1; then
            VALID_CLIS+=("$binary_path")
        fi
    fi
done < <(find ~ -type f -executable \( -name "code-server" -o -name "antigravity-server" -o -name "antigravity-ide-server" -o -name "cursor-server" \) -not -path "*/node_modules/*" 2>/dev/null || true)

if [ ${#VALID_CLIS[@]} -eq 0 ]; then
    echo "⚠️ No active IDE server binaries found yet."
else
    UNIQUE_CLIS=($(echo "${VALID_CLIS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
    for CLI in "${UNIQUE_CLIS[@]}"; do
        echo "🔧 Synchronizing extensions via binary: $CLI"
        
        INSTALLED_EXTS=$("$CLI" --list-extensions 2>/dev/null | tr '[:upper:]' '[:lower:]')

        for ext in "${EXTENSIONS[@]}"; do
            EXT_LOWER=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
            
            if echo "$INSTALLED_EXTS" | grep -q "^${EXT_LOWER}$"; then
                echo "  🔹 $ext is already installed."
            else
                "$CLI" --install-extension "$ext" >/dev/null 2>&1
                
                UPDATED_EXTS=$("$CLI" --list-extensions 2>/dev/null | tr '[:upper:]' '[:lower:]')
                if echo "$UPDATED_EXTS" | grep -q "^${EXT_LOWER}$"; then
                    echo "  ✅ Installed $ext"
                else
                    echo "  ❌ Failed to install $ext"
                fi
            fi
        done
    done
fi

echo "🎯 Initialization Complete!"
EOF
RUN sed -i 's/\r$//' /home/vscode/init_workspace.sh && chmod +x /home/vscode/init_workspace.sh

# 7. User Environment Defaults & Entrypoint
USER vscode
WORKDIR /ghostclass
EXPOSE 3000 8000 8080 4000 5001 8081 8085 9099 54321 54322 54323
CMD ["sleep", "infinity"]