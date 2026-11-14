<#
.SYNOPSIS
    GhostClass Dev-Environment & ADB Bridge Launcher for Windows.
    Connects Android Emulator / Physical Device from Windows Host to DevContainer.

.PARAMETER Mode
    "Emulator", "Physical", or "Skip".
#>
param(
    [ValidateSet("Emulator", "Physical", "Skip")]
    [string]$Mode
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$User = "vscode"

# Ensure WSL SSH agent socket is initialized before Docker mounts it
Write-Host "[WSL] Initializing WSL SSH Relay..." -ForegroundColor Cyan
wsl --exec bash -c 'source ~/.bashrc' 2>$null

Write-Host "`n[GhostClass] Initializing Windows Development Bridge..." -ForegroundColor Cyan

# 1. Verify Docker Desktop
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker CLI not found on host." -ForegroundColor Red
    exit 1
}

if (!(docker info 2>$null)) {
    Write-Host "[ERROR] Docker daemon is not accessible. Ensure Docker Desktop is running." -ForegroundColor Red
    exit 1
}

# Find DevContainer name dynamically or fall back to default
$ContainerName = $(docker ps --filter "label=devcontainer.local_folder" --format "{{.Names}}" 2>$null | Select-Object -First 1)
if (-not $ContainerName) {
    $ContainerName = "GhostClass_Sandbox"
}

$Status = (docker inspect -f '{{.State.Status}}' $ContainerName 2>$null).Trim()
if ($Status -ne "running") {
    Write-Host "[Docker] Starting container $ContainerName..." -ForegroundColor Cyan
    docker start $ContainerName > $null
    Start-Sleep -Seconds 2
}

# 2. Select Debug Target
if (-not $Mode) {
    Write-Host "`n[Target] Select Debug Target Environment:" -ForegroundColor Magenta
    Write-Host " [1] Android Emulator (Host GPU Accelerated)" -ForegroundColor Cyan
    Write-Host " [2] Physical Device (Wi-Fi ADB)" -ForegroundColor Cyan
    Write-Host " [3] Skip ADB (Container Only)" -ForegroundColor Cyan
    $Choice = Read-Host "Enter selection (1, 2, or 3)"
    
    if ($Choice -eq "3") { $Mode = "Skip" }
    elseif ($Choice -eq "2") { $Mode = "Physical" }
    else { $Mode = "Emulator" }
}

$EmulatorProc = $null

if ($Mode -ne "Skip") {
    # Reset ADB on container to start fresh
    docker exec -u $User $ContainerName adb kill-server 2>$null
    Write-Host "`n[ADB] Ensuring Host ADB Server is listening on all interfaces (-a)..." -ForegroundColor Cyan
    # Stop any localhost-bound ADB server to re-bind with -a
    adb kill-server 2>$null
    Start-Process adb -ArgumentList "-a nodaemon server" -WindowStyle Hidden
    Start-Sleep -Seconds 2

    if ($Mode -eq "Physical") {
        Write-Host "[Device] Preparing Physical Device via USB/Wi-Fi..." -ForegroundColor Cyan
        adb start-server | Out-Null
        
        # 1. Fetch device Wi-Fi IP while USB is attached
        $RouteOutput = adb shell ip route 2>$null
        $DeviceIp = ($RouteOutput | Select-String -Pattern 'src\s+(\d+\.\d+\.\d+\.\d+)').Matches.Groups[1].Value

        if (-not $DeviceIp) {
            Write-Host "[WARN] Could not auto-detect device Wi-Fi IP. Ensure USB debugging is authorized." -ForegroundColor Yellow
            $DeviceIp = Read-Host "Enter device Wi-Fi IP manually (e.g. 192.168.1.50)"
        }

        if ($DeviceIp) {
            # 2. Switch phone to TCP mode on host
            Write-Host "[ADB] Switching device to TCP mode (Port 5555)..." -ForegroundColor Cyan
            adb tcpip 5555 | Out-Null
            Start-Sleep -Seconds 2

            # 3. Connect Host ADB over Wi-Fi first to authenticate key pair
            Write-Host "[ADB] Connecting Windows Host ADB to ${DeviceIp}:5555..." -ForegroundColor Cyan
            adb connect "${DeviceIp}:5555" | Out-Null
            Start-Sleep -Seconds 1

            if (docker ps -q -f name="$ContainerName" 2>$null) {
                Write-Host "[Container] Connecting Container ADB to Device IP: ${DeviceIp}:5555..." -ForegroundColor Green
                docker exec -u $User $ContainerName adb connect "${DeviceIp}:5555" | Out-Null
            }
        }
    } else {
        Write-Host "[AVD] Checking Local Android Emulator..." -ForegroundColor Cyan
        $emuState = (adb -e get-state 2>$null)
        if ($emuState -ne "device") {
            Write-Host "   [AVD] Inspecting available AVD emulators..." -ForegroundColor Cyan
            [string[]]$avds = @(emulator -list-avds 2>$null | Where-Object { $_ -and $_.Trim() -ne "" })
            
            $targetAvd = $null
            if ($avds.Length -gt 1) {
                Write-Host "`n[AVD] Available Android Virtual Devices (AVDs):" -ForegroundColor Magenta
                for ($idx = 0; $idx -lt $avds.Length; $idx++) {
                    Write-Host " [$($idx + 1)] $($avds[$idx])" -ForegroundColor Cyan
                }
                $selection = Read-Host "Select AVD to launch (1-$($avds.Length)) [Default: 1]"
                if ($selection -match '^\d+$' -and [int]$selection -ge 1 -and [int]$selection -le $avds.Length) {
                    $targetAvd = $avds[[int]$selection - 1]
                } else {
                    $targetAvd = $avds[0]
                }
            } elseif ($avds.Length -eq 1) {
                $targetAvd = $avds[0]
                Write-Host "   [AVD] Selected AVD: $targetAvd" -ForegroundColor Green
            } else {
                $manualAvd = Read-Host "No AVD found with 'emulator -list-avds'. Enter AVD name [Default: Medium_Phone_API_36.1]"
                $targetAvd = if ($manualAvd) { $manualAvd } else { "Medium_Phone_API_36.1" }
            }

            Write-Host "   [AVD] Launching AVD emulator: $targetAvd..." -ForegroundColor Cyan
            $EmulatorProc = Start-Process emulator -ArgumentList "-avd $targetAvd -netdelay none -netspeed full" -PassThru -WindowStyle Hidden
            
            Write-Host "   [AVD] Waiting for Emulator to complete boot..." -ForegroundColor Cyan
            for ($i = 0; $i -lt 35; $i++) {
                $emuState = (adb -e get-state 2>$null)
                if ($emuState -eq "device") { break }
                Start-Sleep -Seconds 2
            }
        }
        
        if ($emuState -eq "device") {
            Write-Host "   [OK] Android Emulator is online and registered on host." -ForegroundColor Green
            if (docker ps -q -f name="$ContainerName" 2>$null) {
                docker exec -u $User $ContainerName adb connect host.docker.internal:5555 2>$null | Out-Null
            }
        } else {
            Write-Host "[WARN] Emulator took too long to boot. Check Android Studio Device Manager." -ForegroundColor Yellow
        }
    }

    $retryCount = 0
    $authorizedDevice = $null
    
    while ($retryCount -lt 15) {
        # Check all devices reported by the container ADB client
        $deviceLines = (docker exec -u $User $ContainerName adb devices 2>$null) | Where-Object { $_ -match '\s+device$' }
        if ($deviceLines) {
            $authorizedDevice = ($deviceLines[0] -split '\s+')[0]
            Write-Host "[OK] Container ADB Connected & Authorized to $authorizedDevice!" -ForegroundColor Green
            break
        }
        Start-Sleep -Seconds 1
        $retryCount++
    }

    if (-not $authorizedDevice) {
        Write-Host "[WARN] ADB connection timed out inside container. You may need to accept an RSA auth prompt on phone screen." -ForegroundColor Yellow
    }

    # Verify container status if running
    if (docker ps -q -f name="$ContainerName" 2>$null) {
        Write-Host "`n[ADB] Verifying Container ADB devices list:" -ForegroundColor Cyan
        docker exec -u $User $ContainerName adb devices
    }
} else {
    Write-Host "[ADB] Skipping ADB configuration." -ForegroundColor Cyan
}

Write-Host "`n[Ready] All systems go!" -ForegroundColor Magenta
Write-Host "[Ready] Environment ready! You can now run Flutter apps directly inside your container or IDE." -ForegroundColor Green
Read-Host "[STOP] PRESS ENTER TO TEARDOWN ENVIRONMENT [STOP]"

Write-Host "[Cleanup] Tearing down..." -ForegroundColor Cyan

if ($Mode -eq "Emulator") {
    Write-Host "[Cleanup] Terminating emulator..." -ForegroundColor Cyan
    adb -e emu kill 2>$null
    Start-Sleep -Seconds 3
    if ($EmulatorProc) { Stop-Process -Id $EmulatorProc.Id -Force -ErrorAction SilentlyContinue }
} elseif ($Mode -eq "Physical") {
    adb disconnect 2>$null | Out-Null
}

if ($Mode -ne "Skip") {
    docker exec -u $User $ContainerName adb kill-server 2>$null
}

Write-Host "[OK] Environment sanitized." -ForegroundColor Green
