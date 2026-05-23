# Base Image
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04@sha256:81380e4c9c14e8a629ff39029639e4b7893e67400246fa7782a0fe7dc193a02a

USER root

# Copy pinned artifacts so they can be used as defaults when build-args are not provided
COPY .devcontainer/pinned-artifacts.json /tmp/pinned-artifacts.json

# 1. System Dependencies, Java 17, and SSH Setup
RUN apt-get update && apt-get install -y \
    openssh-server curl git unzip wget adb openjdk-17-jdk-headless apt-transport-https jq \
    && mkdir /var/run/sshd \
    && echo 'vscode:root' | chpasswd \
    && echo 'root:root' | chpasswd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config

# 2. Node.js 24.14.1 + npm 11.11.0
ARG NPM_TARBALL_URL
ARG NPM_SHASUM

RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y nodejs \
    && if [ -f /tmp/pinned-artifacts.json ]; then \
        NPM_TARBALL_URL=${NPM_TARBALL_URL:-$(jq -r '.npm.url' /tmp/pinned-artifacts.json)}; \
        NPM_SHASUM=${NPM_SHASUM:-$(jq -r '.npm.shasum' /tmp/pinned-artifacts.json)}; \
    fi \
    && if [ -z "$NPM_TARBALL_URL" ] || [ -z "$NPM_SHASUM" ]; then echo "Missing URL or SHASUM for npm" >&2; exit 1; fi \
    && echo "Downloading npm tarball from $NPM_TARBALL_URL" \
    && curl -fSL "$NPM_TARBALL_URL" -o /tmp/npm.tgz \
    && echo "$NPM_SHASUM  /tmp/npm.tgz" | sha1sum -c - \
    # Overwrite the global npm directory to update npm without using npm install -g,
    # avoiding the Scorecard Pinned-Dependencies "npmCommand not pinned by hash" warning.
    && rm -rf /usr/lib/node_modules/npm \
    && mkdir -p /usr/lib/node_modules/npm \
    && tar -xz --strip-components=1 -C /usr/lib/node_modules/npm -f /tmp/npm.tgz \
    && rm -f /tmp/npm.tgz

# 3. Docker CLI, GitHub CLI, Supabase CLI, Playwright, and Firebase CLI
ARG PLAYWRIGHT_TARBALL_URL
ARG PLAYWRIGHT_SHASUM
ARG FIREBASE_TARBALL_URL
ARG FIREBASE_SHASUM
ARG SUPABASE_TARBALL_URL
ARG SUPABASE_SHA256
ARG INFISICAL_TARBALL_URL
ARG INFISICAL_SHASUM

RUN apt-get update && apt-get install -y ca-certificates curl gnupg jq \
     && install -m 0755 -d /etc/apt/keyrings \
     && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
     && chmod a+r /etc/apt/keyrings/docker.gpg \
     && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
     && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
     && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
     && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
     && apt-get update && apt-get install -y \
         docker-ce-cli \
         docker-buildx-plugin \
         docker-compose-plugin \
         gh \
        && if [ -f /tmp/pinned-artifacts.json ]; then \
            PLAYWRIGHT_TARBALL_URL=${PLAYWRIGHT_TARBALL_URL:-$(jq -r '.playwright.url' /tmp/pinned-artifacts.json)}; \
            PLAYWRIGHT_SHASUM=${PLAYWRIGHT_SHASUM:-$(jq -r '.playwright.shasum' /tmp/pinned-artifacts.json)}; \
            FIREBASE_TARBALL_URL=${FIREBASE_TARBALL_URL:-$(jq -r '.firebase.url' /tmp/pinned-artifacts.json)}; \
            FIREBASE_SHASUM=${FIREBASE_SHASUM:-$(jq -r '.firebase.shasum' /tmp/pinned-artifacts.json)}; \
            SUPABASE_TARBALL_URL=${SUPABASE_TARBALL_URL:-$(jq -r '.supabase.url' /tmp/pinned-artifacts.json)}; \
            SUPABASE_SHA256=${SUPABASE_SHA256:-$(jq -r '.supabase.sha256' /tmp/pinned-artifacts.json)}; \
            INFISICAL_TARBALL_URL=${INFISICAL_TARBALL_URL:-$(jq -r '.infisical.url' /tmp/pinned-artifacts.json)}; \
            INFISICAL_SHASUM=${INFISICAL_SHASUM:-$(jq -r '.infisical.shasum' /tmp/pinned-artifacts.json)}; \
        fi \
        && ARCH=$(dpkg --print-architecture) \
        && echo "Downloading Supabase CLI (verify by provided SHA256)..." \
        && if [ -z "$SUPABASE_TARBALL_URL" ] || [ -z "$SUPABASE_SHA256" ]; then echo "SUPABASE_TARBALL_URL and SUPABASE_SHA256 must be provided (build-arg or pinned file)" >&2; exit 1; fi \
        && curl -fSL "$SUPABASE_TARBALL_URL" -o /tmp/supabase.tar.gz \
        && echo "$SUPABASE_SHA256  /tmp/supabase.tar.gz" | sha256sum -c - \
        && tar -xzf /tmp/supabase.tar.gz -C /tmp \
        && mv /tmp/supabase /usr/local/bin/ \
        && chmod +x /usr/local/bin/supabase \
        && rm -f /tmp/supabase.tar.gz \
        && set -eux \
        # Install npm global packages from provided tarball URLs and verify hashes
        && for NAME in "playwright" "firebase-tools" "infisical"; do \
            case "$NAME" in \
                playwright) URL="$PLAYWRIGHT_TARBALL_URL"; SUM="$PLAYWRIGHT_SHASUM";; \
                firebase-tools) URL="$FIREBASE_TARBALL_URL"; SUM="$FIREBASE_SHASUM";; \
                infisical) URL="$INFISICAL_TARBALL_URL"; SUM="$INFISICAL_SHASUM";; \
            esac; \
            if [ -z "$URL" ] || [ -z "$SUM" ]; then echo "Missing URL or SHASUM for $NAME" >&2; exit 1; fi; \
            echo "Downloading $NAME tarball from $URL"; curl -fSL "$URL" -o /tmp/$NAME.tgz; \
            # choose sha256 or sha1 based on length
            if [ ${#SUM} -eq 64 ]; then echo "$SUM  /tmp/$NAME.tgz" | sha256sum -c -; else echo "$SUM  /tmp/$NAME.tgz" | sha1sum -c -; fi; \
            node /usr/lib/node_modules/npm/bin/npm-cli.js install -g /tmp/$NAME.tgz; \
            rm -f /tmp/$NAME.tgz; \
        done \
        # Install Playwright OS dependencies using the installed package
        && playwright install-deps

# Switch to vscode user for user-space SDKs
USER vscode
ENV HOME="/home/vscode"
ENV FLUTTER_HOME="$HOME/flutter-sdk"
ENV NODE_OPTIONS="--max-old-space-size=9216"
ENV PATH="$PATH:$FLUTTER_HOME/bin"

# 4. Flutter SDK Pre-cache
RUN git clone https://github.com/flutter/flutter.git -b stable $FLUTTER_HOME \
    && $FLUTTER_HOME/bin/flutter precache

# 5. Workspace Injector Script
# Switch to root to safely write and change file ownership
USER root
RUN cat << 'EOF' > /home/vscode/init_workspace.sh
#!/bin/bash
echo "🚀 Starting Full Environment Setup..."

# 1. Git Configuration
# Tell Git to use a writeable file for global settings instead of the busy mount
export GIT_CONFIG_GLOBAL="/home/vscode/.gitconfig_local"
export NODE_OPTIONS="--max-old-space-size=9216"

if [ ! -f "$GIT_CONFIG_GLOBAL" ]; then
    cp /home/vscode/.gitconfig "$GIT_CONFIG_GLOBAL" 2>/dev/null || touch "$GIT_CONFIG_GLOBAL"
fi

if ! grep -q "GIT_CONFIG_GLOBAL" ~/.bashrc; then
    echo 'export GIT_CONFIG_GLOBAL="/home/vscode/.gitconfig_local"' >> ~/.bashrc
fi

git config --global --add safe.directory /workspace

# 2. Secure Local SSH Key Setup
MOUNTED_KEY="/home/vscode/.ssh/id_ed25519"
LOCAL_KEY="/home/vscode/.ssh/id_ed25519_local"

# Use sudo to ensure we can create/fix the directory
sudo mkdir -p /home/vscode/.ssh
sudo chown -R vscode:vscode /home/vscode/.ssh
chmod 700 /home/vscode/.ssh

if [ -f "$MOUNTED_KEY" ]; then
    cp "$MOUNTED_KEY" "$LOCAL_KEY"
    chmod 600 "$LOCAL_KEY"
    
    git config --global user.signingkey "$LOCAL_KEY"
    git config --global gpg.format ssh
    git config --global commit.gpgsign true
    echo "✅ Dedicated Sub-key secured and Git signing configured."
else
    echo "❌ Private key mount missing at $MOUNTED_KEY!"
fi

# 3. Deno Setup
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

mkdir -p ~/.vscode-server/data/Machine

if [ ! -f ~/.vscode-server/data/Machine/settings.json ]; then
    echo '{}' > ~/.vscode-server/data/Machine/settings.json
fi

grep -q '"deno.path"' ~/.vscode-server/data/Machine/settings.json || \
sed -i 's|}|,\n  "deno.path": "/home/vscode/.deno/bin/deno",\n  "deno.enable": true\n}|' \
~/.vscode-server/data/Machine/settings.json

# 4. Android SDK Setup
export ANDROID_HOME="/home/vscode/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export PATH="$PATH":"$HOME/.pub-cache/bin"

# Download Linux cmdline-tools if missing
if [ ! -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo "⬇️ Downloading Linux Android SDK Command-line Tools..."
    mkdir -p "/home/vscode/android-sdk/cmdline-tools"
    
    wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip
    unzip -q /tmp/cmdline-tools.zip -d "/home/vscode/android-sdk/cmdline-tools"
    
    mv "/home/vscode/android-sdk/cmdline-tools/cmdline-tools" "/home/vscode/android-sdk/cmdline-tools/latest"
    rm /tmp/cmdline-tools.zip
    
    echo "📦 Installing Android Platform Tools..."
    yes | /home/vscode/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses
    /home/vscode/android-sdk/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

if ! grep -q "ANDROID_HOME" ~/.bashrc; then
    echo "export ANDROID_HOME=\"/home/vscode/android-sdk\"" >> ~/.bashrc
    echo "export PATH=\"\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools\"" >> ~/.bashrc
fi

# 5. Flutter SDK Setup
export FLUTTER_HOME="/home/vscode/flutter-sdk"
export PATH="$PATH:$FLUTTER_HOME/bin"

if ! grep -q "flutter-sdk" ~/.bashrc; then
    echo "📝 Updating ~/.bashrc..."
    echo 'export FLUTTER_HOME="/home/vscode/flutter-sdk"' >> ~/.bashrc
    echo "export PATH=\"\$PATH:\$FLUTTER_HOME/bin\"" >> ~/.bashrc
fi

flutter config --android-sdk "$ANDROID_HOME"

# 6. Workspace Dependencies
if [ -f "/workspace/package.json" ]; then
    echo "📦 Installing NPM dependencies..."
    cd /workspace && npm ci --legacy-peer-deps
fi

if [ -d "/workspace/mobile" ]; then
    echo "🐦 Running flutter pub get..."
    cd /workspace/mobile && flutter pub get
fi

# 7. IDE Extensions Installation
EXTENSIONS=(
  "Dart-Code.flutter" "Dart-Code.dart-code" "dsznajder.es7-react-js-snippets"
  "esbenp.prettier-vscode" "bradlc.vscode-tailwindcss" "formulahendry.auto-rename-tag"
  "christian-kohler.path-intellisense" "christian-kohler.npm-intellisense" "vitest.explorer"
  "ms-playwright.playwright" "ms-edgedevtools.vscode-edge-devtools" "davidanson.vscode-markdownlint"
  "meezilla.json" "ms-vscode.vscode-typescript-next" "oderwat.indent-rainbow"
  "dbaeumer.vscode-eslint" "usernamehw.errorlens" "supabase.vscode-supabase-extension"
  "denoland.vscode-deno"
)

for CLI_PATH in \
    $(find ~/.vscode-server/bin ~/.antigravity-server/bin \
    -type f \( -name "code-server" -o -name "antigravity-server" \) \
    -executable 2>/dev/null); do

    echo "Using $CLI_PATH"

    for ext in "${EXTENSIONS[@]}"; do
        "$CLI_PATH" --install-extension "$ext" --force --telemetry-level off
    done
done

hash -r
echo "🎯 All systems go!"
EOF

# Fix permissions so vscode owns the script
RUN chmod +x /home/vscode/init_workspace.sh && chown vscode:vscode /home/vscode/init_workspace.sh

# Start the SSH Daemon
WORKDIR /workspace
EXPOSE 22 3000
CMD ["/usr/sbin/sshd", "-D"]