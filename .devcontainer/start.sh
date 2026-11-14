#!/usr/bin/env bash
# ==============================================================================
# GhostClass Dev-Environment & ADB Bridge Launcher for macOS and Linux.
# Connects host Android Emulator / Physical Device to the DevContainer.
# ==============================================================================
set -euo pipefail

CONTAINER_NAME="GhostClass_Sandbox"
USER="vscode"

echo -e "\033[1;36m[GhostClass] Initializing macOS/Linux Development Bridge...\033[0m"

# 1. Verify Docker
if ! command -v docker >/dev/null 2>&1; then
    echo -e "\033[1;31m[ERROR] Docker CLI not found on host.\033[0m"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo -e "\033[1;31m[ERROR] Docker daemon is not accessible. Ensure Docker is running.\033[0m"
    exit 1
fi

# 2. Check / Start DevContainer
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "\033[1;36m[Docker] Starting container ${CONTAINER_NAME}...\033[0m"
        docker start "${CONTAINER_NAME}" >/dev/null
        sleep 2
    else
        echo -e "\033[1;33m[WARN] Container ${CONTAINER_NAME} not found. Open the project in VS Code / Antigravity Dev Containers first.\033[0m"
    fi
fi

# 3. Select Target Mode
MODE="${1:-}"
if [ -z "$MODE" ]; then
    echo -e "\n\033[1;35m[Target] Select Debug Target Environment:\033[0m"
    echo -e " \033[1;36m[1] Android Emulator (Host Accelerated)\033[0m"
    echo -e " \033[1;36m[2] Physical Device (Wi-Fi / USB)\033[0m"
    echo -e " \033[1;36m[3] Skip ADB (Container Only)\033[0m"
    read -rp "Enter selection (1, 2, or 3): " choice
    case "$choice" in
        2) MODE="Physical" ;;
        3) MODE="Skip" ;;
        *) MODE="Emulator" ;;
    esac
fi

if [ "$MODE" != "Skip" ]; then
    if ! command -v adb >/dev/null 2>&1; then
        echo -e "\033[1;33m[WARN] Host 'adb' command not found. Install Android platform-tools on host to bridge devices.\033[0m"
    else
        echo -e "\n\033[1;36m[ADB] Ensuring Host ADB Server is listening on all interfaces (-a)...\033[0m"
        adb kill-server >/dev/null 2>&1 || true
        adb -a nodaemon server >/dev/null 2>&1 &
        HOST_ADB_PID=$!
        sleep 2

        if [ "$MODE" = "Physical" ]; then
            echo -e "\033[1;36m[Device] Detecting Physical Device...\033[0m"
            DEVICE_IP=$(adb shell ip route 2>/dev/null | awk '/src/ {print $NF}' | head -n 1 || true)
            if [ -z "$DEVICE_IP" ]; then
                read -rp "Enter device Wi-Fi IP (e.g. 192.168.1.50): " DEVICE_IP
            fi
            if [ -n "$DEVICE_IP" ]; then
                echo -e "\033[1;36m[ADB] Switching device to TCP mode (Port 5555)...\033[0m"
                adb tcpip 5555 >/dev/null 2>&1 || true
                sleep 1
                adb connect "${DEVICE_IP}:5555" >/dev/null 2>&1 || true
                if docker ps -q -f name="^${CONTAINER_NAME}$" >/dev/null 2>&1; then
                    echo -e "\033[1;32m[Container] Connecting Container ADB to ${DEVICE_IP}:5555...\033[0m"
                    docker exec -u "$USER" "$CONTAINER_NAME" adb connect "${DEVICE_IP}:5555" >/dev/null 2>&1 || true
                fi
            fi
        else
            echo -e "\033[1;36m[AVD] Checking Host Android Emulator...\033[0m"
            emuState=$(adb -e get-state 2>/dev/null || true)
            if [ "$emuState" != "device" ]; then
                if command -v emulator >/dev/null 2>&1; then
                    echo -e "   \033[1;36m[AVD] Inspecting available AVD emulators...\033[0m"
                    avds=()
                    while IFS= read -r line; do
                        [ -n "$line" ] && avds+=("$line")
                    done < <(emulator -list-avds 2>/dev/null || true)

                    if [ ${#avds[@]} -gt 1 ]; then
                        echo -e "\n\033[1;35m[AVD] Available Android Virtual Devices (AVDs):\033[0m"
                        for i in "${!avds[@]}"; do
                            echo -e " \033[1;36m[$((i + 1))]\033[0m ${avds[$i]}"
                        done
                        read -rp "Select AVD to launch (1-${#avds[@]}) [Default: 1]: " selection
                        if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#avds[@]}" ]; then
                            target_avd="${avds[$((selection - 1))]}"
                        else
                            target_avd="${avds[0]}"
                        fi
                    elif [ ${#avds[@]} -eq 1 ]; then
                        target_avd="${avds[0]}"
                        echo -e "   \033[1;32m[AVD] Selected AVD: ${target_avd}\033[0m"
                    else
                        read -rp "No AVD found with 'emulator -list-avds'. Enter AVD name [Default: Pixel_10_Pro_XL]: " manual_avd
                        target_avd="${manual_avd:-Pixel_10_Pro_XL}"
                    fi

                    echo -e "   \033[1;36m[AVD] Launching AVD emulator: ${target_avd}...\033[0m"
                    emulator -avd "$target_avd" -netdelay none -netspeed full >/dev/null 2>&1 &
                    HOST_EMU_PID=$!

                    echo -e "   \033[1;36m[AVD] Waiting for Emulator to boot...\033[0m"
                    for ((i=0; i<35; i++)); do
                        emuState=$(adb -e get-state 2>/dev/null || true)
                        [ "$emuState" = "device" ] && break
                        sleep 2
                    done
                else
                    echo -e "\033[1;33m[WARN] 'emulator' binary not found on host PATH. Ensure emulator is running or launch via Android Studio.\033[0m"
                fi
            fi

            if docker ps -q -f name="^${CONTAINER_NAME}$" >/dev/null 2>&1; then
                docker exec -u "$USER" "$CONTAINER_NAME" adb connect host.docker.internal:5555 >/dev/null 2>&1 || true
            fi
        fi

        echo -e "\n\033[1;36m[ADB] Container ADB Devices:\033[0m"
        docker exec -u "$USER" "$CONTAINER_NAME" adb devices 2>/dev/null || true
    fi
fi

echo -e "\n\033[1;32m[Ready] GhostClass Dev Environment is running!\033[0m"
echo -e "\033[0;33mNote for macOS users:\033[0m Native macOS desktop and iOS apps require Xcode and must be run on the macOS host directly."
read -rp "Press ENTER to teardown ADB bridge..."

if [ "$MODE" != "Skip" ]; then
    if [ "$MODE" = "Emulator" ]; then
        adb -e emu kill >/dev/null 2>&1 || true
        [ -n "${HOST_EMU_PID:-}" ] && kill "$HOST_EMU_PID" 2>/dev/null || true
    fi
    if [ -n "${HOST_ADB_PID:-}" ]; then
        kill "$HOST_ADB_PID" 2>/dev/null || true
    fi
fi
echo -e "\033[1;32m[OK] Cleanup complete.\033[0m"
