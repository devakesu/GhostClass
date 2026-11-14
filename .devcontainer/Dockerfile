# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04@sha256:d94c97dd9cacf183d0a6fd12a8e87b526e9e928307674ae9c94139139c0c6eae

ARG TARGETARCH
USER root

# ==============================================================================
# 1. Native Dependencies & Toolchains (Pinned by SHA256)
# ==============================================================================
RUN install -m 0755 -d /etc/apt/keyrings \
    # NodeSource Repo (Node 24 LTS)
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /tmp/nodesource.key \
    && echo "b42e0321dabdc24e892115da705cf061167eac12a317f23d329862d0aa0a271d  /tmp/nodesource.key" | sha256sum -c - \
    && gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg /tmp/nodesource.key \
    && rm -f /tmp/nodesource.key \
    && chmod 644 /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    # GitHub CLI Repo
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /tmp/githubcli.gpg \
    && echo "6084d5d7bd8e288441e0e94fc6275570895da18e6751f70f057485dc2d1a811b  /tmp/githubcli.gpg" | sha256sum -c - \
    && install -m 0644 /tmp/githubcli.gpg /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && rm -f /tmp/githubcli.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    # Docker CE CLI Repo
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /tmp/docker.gpg \
    && echo "1500c1f56fa9e26b9b8f42452a553675796ade0807cdce11975eb98170b3a570  /tmp/docker.gpg" | sha256sum -c - \
    && gpg --dearmor -o /etc/apt/keyrings/docker.gpg /tmp/docker.gpg \
    && rm -f /tmp/docker.gpg \
    && chmod 644 /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list \
    # Single unified APT update & install
    && apt-get update && apt-get install -y --no-install-recommends \
    acl \
    build-essential \
    ca-certificates \
    clang \
    cmake \
    direnv \
    docker-buildx-plugin \
    docker-ce-cli \
    docker-compose-plugin \
    gh \
    git \
    gnome-keyring \
    gnupg \
    iproute2 \
    iputils-ping \
    jq \
    lcov \
    libgtk-3-dev \
    liblzma-dev \
    libnss3-tools \
    libsecret-1-dev \
    mesa-utils \
    net-tools \
    ninja-build \
    nodejs \
    openjdk-21-jdk-headless \
    openssh-client \
    pkg-config \
    postgresql-client \
    python3 \
    redis-tools \
    socat \
    unzip \
    wget \
    xdg-desktop-portal \
    xdg-desktop-portal-gtk \
    zlib1g \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install CLI tools via npm (pinned versions)
RUN npm install -g firebase-tools@15.36.0 @infisical/cli@0.45.8 ui-ux-pro-max-cli@2.15.0

# Install docker-mcp CLI plugin (Pinned by SHA256)
RUN ARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${ARCH}" in \
      amd64) \
        DOCKER_MCP_ARCH="linux-amd64" \
        DOCKER_MCP_SHA256="e4df4c2dcc013011519da70a546589d8db0c1461a0050070239339675cfca98c" ;; \
      arm64) \
        DOCKER_MCP_ARCH="linux-arm64" \
        DOCKER_MCP_SHA256="9d833fffb523c290cbd6e69d830a6f525998de0096cddb484ffecd7ce1d3096d" ;; \
      *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac \
    && mkdir -p /usr/libexec/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/mcp-gateway/releases/download/v0.44.3/docker-mcp-${DOCKER_MCP_ARCH}.tar.gz" -o /tmp/docker-mcp.tar.gz \
    && echo "${DOCKER_MCP_SHA256}  /tmp/docker-mcp.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/docker-mcp.tar.gz -C /usr/libexec/docker/cli-plugins \
    && rm -f /tmp/docker-mcp.tar.gz \
    && chmod 755 /usr/libexec/docker/cli-plugins/docker-mcp

# Install Sentry CLI & Astral uv with redis-mcp-server (Pinned by SHA256)
RUN ARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${ARCH}" in \
      amd64) \
        SENTRY_ARCH="x86_64" \
        SENTRY_SHA256="c958865f9d4000183509ea21b1f04925d5390de6d8d87386b9e69f2b305070c3" \
        UV_ARCH="x86_64" \
        UV_SHA256="5acfd9177cfecf0bf87578f059728215ccc884388988f55f7a65041b57387d91" ;; \
      arm64) \
        SENTRY_ARCH="aarch64" \
        SENTRY_SHA256="b6e49fca868a36d20da2ada1832a0ce2f9ac7012c128207518b09d6b6c991f4d" \
        UV_ARCH="aarch64" \
        UV_SHA256="74f2f5c6024d397481db228db8fc25eed420db192243f88438c118e7e013e585" ;; \
      *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/getsentry/sentry-cli/releases/download/3.8.2/sentry-cli-Linux-${SENTRY_ARCH}" -o /usr/local/bin/sentry \
    && echo "${SENTRY_SHA256}  /usr/local/bin/sentry" | sha256sum -c - \
    && chmod 755 /usr/local/bin/sentry \
    && curl -fsSL "https://github.com/astral-sh/uv/releases/download/0.13.8/uv-${UV_ARCH}-unknown-linux-gnu.tar.gz" -o /tmp/uv.tar.gz \
    && echo "${UV_SHA256}  /tmp/uv.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/uv.tar.gz -C /tmp \
    && install -m 0755 "/tmp/uv-${UV_ARCH}-unknown-linux-gnu/uv" /usr/local/bin/uv \
    && install -m 0755 "/tmp/uv-${UV_ARCH}-unknown-linux-gnu/uvx" /usr/local/bin/uvx \
    && rm -rf /tmp/uv* \
    && env UV_TOOL_DIR="/usr/local/share/uv-tools" UV_TOOL_BIN_DIR="/usr/local/bin" uv tool install --force redis-mcp-server

# ==============================================================================
# 2. Chrome / Chromium Browser (Pinned by SHA256)
# ==============================================================================
RUN ARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${ARCH}" in \
      amd64) \
        CHROME_SHA256="4d740636b5c96f687798602c5aad6a5a270f44dd02e48db0638ae77aa4867b1b" \
        && curl -fsSL "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" -o /tmp/chrome.deb \
        && echo "${CHROME_SHA256}  /tmp/chrome.deb" | sha256sum -c - \
        && apt-get update && apt-get install -y --no-install-recommends /tmp/chrome.deb \
        && rm -f /tmp/chrome.deb ;; \
      arm64) \
        apt-get update && apt-get install -y --no-install-recommends software-properties-common \
        && add-apt-repository -y ppa:xtradeb/apps \
        && apt-get update && apt-get install -y --no-install-recommends chromium \
        && ln -sf /usr/bin/chromium /usr/bin/google-chrome ;; \
      *) echo "Unsupported architecture for browser installation: ${ARCH}" && exit 1 ;; \
    esac \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && if [ -f /usr/bin/google-chrome ]; then \
         mv /usr/bin/google-chrome /usr/bin/google-chrome-orig \
         && printf '#!/bin/bash\nexec /usr/bin/google-chrome-orig --no-sandbox --disable-dev-shm-usage "$@"\n' > /usr/bin/google-chrome \
         && chmod 755 /usr/bin/google-chrome; \
       fi

# ==============================================================================
# 3. Multi-Arch Supabase CLI (Pinned by SHA256)
# ==============================================================================
RUN ARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${ARCH}" in \
      amd64) \
        SUPA_ARCH="amd64" \
        SUPA_SHA256="dbe9fd66771337fc198727da86b9d3551302f87a7091cd8781be2a4cd0c8ac4d" ;; \
      arm64) \
        SUPA_ARCH="arm64" \
        SUPA_SHA256="e49b2ab2f4fb428f4e033174d6d9747dd93c95d1504142ba5090699b1ecd2563" ;; \
      *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/supabase/cli/releases/download/v3.1.0/supabase_3.1.0_linux_${SUPA_ARCH}.tar.gz" -o /tmp/supabase.tar.gz \
    && echo "${SUPA_SHA256}  /tmp/supabase.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/supabase.tar.gz -C /usr/local/bin supabase \
    && rm -f /tmp/supabase.tar.gz \
    && chmod 755 /usr/local/bin/supabase

# ==============================================================================
# 4. Directories Pre-Creation & Environment
# ==============================================================================
ENV ANDROID_HOME="/opt/android-sdk"
ENV FLUTTER_HOME="/opt/flutter"
ENV CHROME_EXECUTABLE="/usr/bin/google-chrome"
ENV PLAYWRIGHT_BROWSERS_PATH="/home/vscode/.cache/ms-playwright"
ENV HOME="/home/vscode"
ENV PUB_CACHE="$HOME/.pub-cache"
ENV NODE_OPTIONS="--max-old-space-size=9216"
ENV NPM_CONFIG_UPDATE_NOTIFIER="false"
ENV PATH="$PATH:${FLUTTER_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PUB_CACHE}/bin"

# Pre-create SDK and volume target dirs with vscode ownership ONCE
RUN mkdir -p ${ANDROID_HOME} \
             ${FLUTTER_HOME} \
             /home/vscode/.pub-cache \
             /home/vscode/.gradle \
             /home/vscode/.npm \
             /home/vscode/.cache/ms-playwright \
             /home/vscode/.ssh \
             /workspaces/GhostClass/mobile/.dart_tool \
             /workspaces/GhostClass/mobile/build \
    && touch /home/vscode/.sudo_as_admin_successful /home/vscode/.hushlogin \
    && chown -R vscode:vscode ${ANDROID_HOME} ${FLUTTER_HOME} /home/vscode /workspaces \
    && chmod -R 775 /workspaces/GhostClass \
    && ln -sf /workspaces/GhostClass /ghostclass

# ==============================================================================
# 5. Non-Root Toolchain Setup (Pinned by SHA256)
# ==============================================================================
USER vscode

# Android SDK Tools (Pinned by SHA256, Android 36 + 35 + 34, BuildTools 36.1.0, 36.0.0, 35.0.0, 34.0.0, 28.0.3)
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip" -o /tmp/cmdline-tools.zip \
    && echo "4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583  /tmp/cmdline-tools.zip" | sha256sum -c - \
    && unzip -q /tmp/cmdline-tools.zip -d /tmp \
    && mv /tmp/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm -f /tmp/cmdline-tools.zip \
    && yes | ${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null 2>&1 || true \
    && ${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager \
        "platform-tools" \
        "platforms;android-36" \
        "platforms;android-35" \
        "platforms;android-34" \
        "build-tools;36.1.0" \
        "build-tools;36.0.0" \
        "build-tools;35.0.0" \
        "build-tools;34.0.0" \
        "build-tools;28.0.3" >/dev/null \
    && yes | ${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null 2>&1 || true

# Flutter SDK (Pinned by SHA256 Linux Archive)
RUN curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.50.0-stable.tar.xz" -o /tmp/flutter.tar.xz \
    && echo "6ea2d806fd57269ae783e6788e2a81fc26eaad782f1e0d0ff38623bb765ff9f5  /tmp/flutter.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/flutter.tar.xz -C /opt \
    && rm -f /tmp/flutter.tar.xz \
    && git config --global --add safe.directory ${FLUTTER_HOME} \
    && flutter config --no-analytics >/dev/null 2>&1 \
    && flutter config --enable-linux-desktop >/dev/null 2>&1 \
    && flutter config --android-sdk "${ANDROID_HOME}" >/dev/null 2>&1 \
    && flutter precache --android --linux >/dev/null 2>&1 || true \
    && yes | flutter doctor --android-licenses >/dev/null 2>&1 || true

# ==============================================================================
# 6. Multi-IDE Machine Settings & Extension Symlinks
# ==============================================================================
RUN for dir in .antigravity-server .antigravity-ide-server .vscode-server .cursor-server; do \
      mkdir -p "$HOME/$dir/data/Machine"; \
    done \
    && ln -sf $HOME/.vscode-server/extensions $HOME/.antigravity-server/extensions \
    && ln -sf $HOME/.vscode-server/extensions $HOME/.antigravity-ide-server/extensions \
    && ln -sf $HOME/.vscode-server/extensions $HOME/.cursor-server/extensions \
    && SETTINGS='{ \
        "remote.forwardAgent": true, \
        "dart.flutterSdkPath": "/opt/flutter", \
        "editor.formatOnSave": true, \
        "editor.defaultFormatter": "esbenp.prettier-vscode", \
        "[dart]": { \
            "editor.defaultFormatter": "Dart-Code.dart-code", \
            "editor.formatOnSave": true \
        }, \
        "[typescript]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "[typescriptreact]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "[javascript]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "[javascriptreact]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "[json]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "[jsonc]": { \
            "editor.defaultFormatter": "esbenp.prettier-vscode" \
        }, \
        "editor.codeActionsOnSave": { \
            "source.organizeImports": "explicit", \
            "source.fixAll.eslint": "explicit" \
        }, \
        "js/ts.tsdk.path": "node_modules/typescript/lib", \
        "js/ts.inlayHints.variableTypes.enabled": true, \
        "js/ts.inlayHints.functionLikeReturnTypes.enabled": true, \
        "js/ts.inlayHints.parameterNames.enabled": "all", \
        "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"], \
        "errorlens.enabled": true \
    }' \
    && echo "$SETTINGS" > $HOME/.antigravity-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.antigravity-ide-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.vscode-server/data/Machine/settings.json \
    && echo "$SETTINGS" > $HOME/.cursor-server/data/Machine/settings.json \
    && mkdir -p $HOME/.gemini/config $HOME/.gemini/antigravity $HOME/.config/Claude $HOME/.cursor \
    && MCP_CONFIG='{ \
        "mcpServers": { \
            "supabase": { \
                "serverUrl": "https://mcp.supabase.com/mcp", \
                "url": "https://mcp.supabase.com/mcp", \
                "type": "http" \
            }, \
            "dart": { \
                "command": "dart", \
                "args": ["mcp-server"] \
            }, \
            "MCP_DOCKER": { \
                "command": "docker", \
                "args": ["mcp", "gateway", "run"] \
            }, \
            "context7": { \
                "type": "http", \
                "url": "https://mcp.context7.com/mcp", \
                "serverUrl": "https://mcp.context7.com/mcp" \
            }, \
            "sentry": { \
                "command": "sentry", \
                "args": ["mcp"] \
            }, \
            "redis": { \
                "command": "redis-mcp-server", \
                "args": ["--url", "redis://localhost:6379/0"] \
            }, \
            "cloudflare": { \
                "type": "http", \
                "url": "https://mcp.cloudflare.com/mcp", \
                "serverUrl": "https://mcp.cloudflare.com/mcp" \
            } \
        } \
    }' \
    && echo "$MCP_CONFIG" > $HOME/.gemini/config/mcp_config.json \
    && echo "$MCP_CONFIG" > $HOME/.gemini/antigravity/mcp_config.json \
    && echo "$MCP_CONFIG" > $HOME/.config/Claude/claude_desktop_config.json \
    && echo "$MCP_CONFIG" > $HOME/.cursor/mcp.json

# ==============================================================================
# 7. Companion Scripts Installation
# ==============================================================================
USER root
COPY --chown=vscode:vscode --chmod=755 .devcontainer/init_workspace.sh /home/vscode/init_workspace.sh
RUN sed -i 's/\r$//' /home/vscode/init_workspace.sh

# ==============================================================================
# 8. Runtime Defaults & Entrypoint
# ==============================================================================
USER vscode
WORKDIR /workspaces/GhostClass
EXPOSE 3000 8000 8181 54321 54322 54323 4000 5001 8080 9099
CMD ["sleep", "infinity"]
