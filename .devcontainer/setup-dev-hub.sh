#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# GhostClass Development Container Launcher
# Bridges to devcontainer CLI or launches the Docker Sandbox directly.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER_NAME="GhostClass_Sandbox"
IMAGE_NAME="ghostclass-devhub:latest"

echo -e "\033[1;36m[GhostClass] Initializing DevContainer Launcher...\033[0m"

# 1. Verify Docker
if ! command -v docker >/dev/null 2>&1; then
    echo -e "\033[1;31m[ERROR] Docker CLI not found. Ensure Docker Desktop or Docker engine is running.\033[0m"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo -e "\033[1;31m[ERROR] Docker daemon is not accessible.\033[0m"
    exit 1
fi

# 2. Check if devcontainer CLI is installed
if command -v devcontainer >/dev/null 2>&1; then
    echo -e "\033[1;32m[DevContainer] Launching workspace via DevContainer CLI...\033[0m"
    cd "$PROJECT_ROOT"
    devcontainer up --workspace-folder "$PROJECT_ROOT"
    echo -e "\033[1;32m[DevContainer] Workspace is up! Run 'devcontainer exec --workspace-folder . bash' to enter.\033[0m"
    exit 0
fi

# 3. Fallback: Direct Docker Build & Run using .devcontainer/Dockerfile
echo -e "\033[1;33m[DevContainer] 'devcontainer' CLI not found on host.\033[0m"
echo -e "\033[1;36m[Docker] Building $IMAGE_NAME from .devcontainer/Dockerfile...\033[0m"

cd "$PROJECT_ROOT"
docker build -t "$IMAGE_NAME" -f .devcontainer/Dockerfile .

# Check if container is already running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "\033[1;32m[Docker] Container ${CONTAINER_NAME} is already running.\033[0m"
else
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "\033[1;36m[Docker] Starting existing stopped container ${CONTAINER_NAME}...\033[0m"
        docker start "${CONTAINER_NAME}" >/dev/null
    else
        echo -e "\033[1;36m[Docker] Creating and starting container ${CONTAINER_NAME}...\033[0m"
        docker run -d \
            --name "${CONTAINER_NAME}" \
            --restart=unless-stopped \
            --ipc=host \
            --add-host=host.docker.internal:host-gateway \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v "${PROJECT_ROOT}:/workspaces/GhostClass" \
            -v ghostclass-pub-cache:/home/vscode/.pub-cache \
            -v ghostclass-gradle-cache:/home/vscode/.gradle \
            -v ghostclass-npm-cache:/home/vscode/.npm \
            -v ghostclass-playwright-cache:/home/vscode/.cache/ms-playwright \
            -e ADB_SERVER_SOCKET="tcp:host.docker.internal:5037" \
            -e NODE_OPTIONS="--max-old-space-size=9216" \
            -e CHROME_EXECUTABLE="/usr/bin/google-chrome" \
            -e PLAYWRIGHT_BROWSERS_PATH="/home/vscode/.cache/ms-playwright" \
            -p 3000:3000 \
            -p 8181:8181 \
            -p 54321:54321 \
            -p 54322:54322 \
            -p 54323:54323 \
            -p 4000:4000 \
            -p 5001:5001 \
            -p 8080:8080 \
            -p 9099:9099 \
            "$IMAGE_NAME" sleep infinity >/dev/null

        echo -e "\033[1;36m[Docker] Running post-create workspace initialization...\033[0m"
        docker exec -u vscode "${CONTAINER_NAME}" bash /home/vscode/init_workspace.sh
    fi
fi

echo -e "\n\033[1;32m[Ready] GhostClass Dev Environment is ready!\033[0m"
echo -e "💡 To attach an interactive shell: \033[1;37mdocker exec -it -u vscode ${CONTAINER_NAME} bash\033[0m"
echo -e "💡 To connect ADB emulator / devices: \033[1;37mbash .devcontainer/start.sh\033[0m"
echo -e "💡 In VS Code / Antigravity / Cursor: Use \033[1;37m'Dev Containers: Reopen in Container'\033[0m"
