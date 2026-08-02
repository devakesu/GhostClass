<#
.SYNOPSIS
    GhostClass Sandbox dev-env launcher for Docker Desktop.
    Setup ADB, supports Emulator, Physical target, or Skip.

.PARAMETER Mode
    "Emulator", "Physical", or "Skip".
#>
param(
    [ValidateSet("Emulator", "Physical", "Skip")]
    [string]$Mode
)

$ContainerName = "GhostClass_Sandbox"
$User          = "vscode"
$VmServicePort = 8181

# Ensure WSL SSH agent socket is initialized before Docker mounts it
Write-Host "🔑 Initializing WSL SSH Relay..." -ForegroundColor Cyan
wsl --exec bash -c 'source ~/.bashrc'

Write-Host "🔧 Verifying Docker Desktop..." -ForegroundColor Cyan
if (!(docker info 2>$null)) {
    Write-Host "❌ Docker Desktop is not running." -ForegroundColor Red
    exit 1
}

$Status = (docker inspect -f '{{.State.Status}}' $ContainerName 2>$null).Trim()
if ($Status -ne "running") {
    Write-Host "🚀 Starting container..." -ForegroundColor Cyan
    wsl --exec bash -ic "docker start $ContainerName" > $null
    Start-Sleep -Seconds 2
}

if (-not $Mode) {
    Write-Host "`n🤖 Select Debug Target Environment:" -ForegroundColor Magenta
    Write-Host " [1] Emulator" -ForegroundColor Cyan
    Write-Host " [2] Physical Device (Wi-Fi ADB)" -ForegroundColor Cyan
    Write-Host " [3] Skip ADB (Container Only)" -ForegroundColor Cyan
    $Choice = Read-Host "Enter selection (1, 2, or 3)"
    
    if ($Choice -eq "3") { $Mode = "Skip" }
    elseif ($Choice -eq "2") { $Mode = "Physical" }
    else { $Mode = "Emulator" }
}

if ($Mode -ne "Skip") {
    # Reset ADB on container to start fresh
    docker exec -u $User $ContainerName adb kill-server 2>$null

    if ($Mode -eq "Physical") {
        Write-Host "📱 Preparing Physical Device via USB/Wi-Fi..." -ForegroundColor Cyan
        adb start-server | Out-Null
        
        # 1. Fetch Wi-Fi IP while USB is attached
        $RouteOutput = adb shell ip route 2>$null
        $DeviceIp = ($RouteOutput | Select-String -Pattern 'src\s+(\d+\.\d+\.\d+\.\d+)').Matches.Groups[1].Value

        if (-not $DeviceIp) {
            Write-Host "❌ Could not determine device's Wi-Fi IP. Is USB plugged in and authorized?" -ForegroundColor Red
            exit 1
        }

        # 2. Switch phone to TCP mode on host
        Write-Host "📡 Switching device ADB to TCP mode (Port 5555)..." -ForegroundColor Cyan
        adb tcpip 5555 | Out-Null
        Start-Sleep -Seconds 3

        # 3. Connect Host ADB over Wi-Fi first to authenticate key pair
        Write-Host "🤝 Connecting Windows Host ADB to ${DeviceIp}:5555..." -ForegroundColor Cyan
        adb connect "${DeviceIp}:5555" | Out-Null
        Start-Sleep -Seconds 2

        Write-Host "📱 Connecting Container ADB to Device IP: ${DeviceIp}:5555" -ForegroundColor Green
        docker exec -u $User $ContainerName adb connect "${DeviceIp}:5555" | Out-Null

    } else {
        Write-Host "📱 Launching Local Emulator..." -ForegroundColor Cyan
        $EmulatorProc = Start-Process emulator -ArgumentList "-avd Medium_Phone_API_36.1 -netdelay none -netspeed full" -PassThru -WindowStyle Hidden
        
        # Wait for emulator to fully register on Windows ADB
        Write-Host "⏳ Waiting for Emulator ADB boot..." -ForegroundColor Cyan
        $emuBooted = $false
        for ($i = 0; $i -lt 20; $i++) {
            $emuState = (adb -e get-state 2>$null)
            if ($emuState -eq "device") { $emuBooted = $true; break }
            Start-Sleep -Seconds 2
        }

        if (-not $emuBooted) {
            Write-Host "❌ Emulator failed to boot or register ADB on host." -ForegroundColor Red
            exit 1
        }

        # Use host.docker.internal so the container routes to Windows Host
        Write-Host "🔌 Connecting Container ADB to host.docker.internal:5555..." -ForegroundColor Cyan
        docker exec -u $User $ContainerName adb connect host.docker.internal:5555 | Out-Null
    }

    $retryCount = 0
    # Match target to host.docker.internal for Emulator mode
    $Target = if ($Mode -eq "Physical") { "${DeviceIp}:5555" } else { "host.docker.internal:5555" }
    
    while ($retryCount -lt 15) {
        $containerState = (docker exec -u $User $ContainerName adb -s $Target get-state 2>$null)
        if ($containerState -eq "device") {
            Write-Host "✅ Container ADB Connected & Authorized to $Target!" -ForegroundColor Green
            break
        }
        Start-Sleep -Seconds 2
        $retryCount++
    }

    if ($retryCount -ge 15) {
        Write-Host "⚠️ Warning: ADB connection timed out inside container. You may need to accept an RSA auth prompt on phone screen." -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️ Skipping ADB configuration." -ForegroundColor Cyan
}

Write-Host "`n🎯 All systems go!" -ForegroundColor Magenta
Read-Host "🛑 PRESS ENTER TO TEARDOWN ENVIRONMENT 🛑"

Write-Host "🗑️ Tearing down..." -ForegroundColor Cyan

if ($Mode -eq "Emulator") {
    Write-Host "🛑 Terminating emulator..." -ForegroundColor Cyan
    adb -e emu kill 2>$null
    Start-Sleep -Seconds 3
    if ($EmulatorProc) { Stop-Process -Id $EmulatorProc.Id -Force -ErrorAction SilentlyContinue }
} elseif ($Mode -eq "Physical") {
    adb disconnect 2>$null | Out-Null
}

if ($Mode -ne "Skip") {
    docker exec -u $User $ContainerName adb kill-server 2>$null
}

Write-Host "✅ Environment sanitized. gg." -ForegroundColor Green

# SIG # Begin signature block
# MIIFfQYJKoZIhvcNAQcCoIIFbjCCBWoCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCDExE0VmBcJhrmd
# u6wbjbci3pk4NvreeYH+8iNVZ/RTUKCCAvowggL2MIIB3qADAgECAhAmKGzz2Y/i
# k00s+ReTOHmTMA0GCSqGSIb3DQEBCwUAMBMxETAPBgNVBAMMCGRldmFrZXN1MB4X
# DTI2MDYwNzEzNTA0MloXDTI3MDYwNzE0MTA0MlowEzERMA8GA1UEAwwIZGV2YWtl
# c3UwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDEoLmTS8czHXtaQFpw
# 6w6gmTU9ciThCmc2H78V47zO+J+3NrdSHRx5jqT/liWIQ8konlM+DiozDx4TXz8U
# LBbI1UJTR7lbTUJayzy7d59NzVD9YKLBvfw/KAleMFaAIPbM1xMfZnHreppsnMMj
# rh/N1XmO7/0sLa2F9vV4xGhM17b24U/bnozmP3Gtm+kxO5j4XCr1vX3H9JDcBAPl
# Cuu3YQASdN/iOtLZ4Qu25R8onqzYF4vv4pFtaQSpD2b/WX/KJ2kKKAsK2bdBgQlF
# ETXhRN40OoT3oULKS+rEGnisvJ6wVdC5kScXYy0M+OE9tdU+DO+B3w3ui+6ztAYp
# YKXdAgMBAAGjRjBEMA4GA1UdDwEB/wQEAwIHgDATBgNVHSUEDDAKBggrBgEFBQcD
# AzAdBgNVHQ4EFgQUhlC/oAYJSIGNOeB4Lq85vZb8y5AwDQYJKoZIhvcNAQELBQAD
# ggEBAC8BtGR3ct33qhR0mW1K8NnVa1YRYiQ3Jl9hh7z7Z+NZ3X2VFzECuAx4wlki
# SjVIGxmWiMt51kxDPo8G9If1b6lvH7ukbVOlw/30AvyL0SDj1v9E9rAKzTaDhN9k
# wgTUZ+nxbCsX1uRrV6Nik3d/juOKpXvWAhWHmDn/qIaYqmmLoABsgrWyhZxUzTSV
# 6xCoxlJcCUIB5jicAUqmq4JAyID2ARYCi8FjdxX3+i0PoV/403+WTZgMVbwZFJBf
# G8oP+3TfnrI3X24woPZnyV+OeuLibsSFXq8qmrARY8lWrmT+m3Vl86ibtjj8ppFm
# 05EwtDcUqVGObcNhvsYrTipXJR0xggHZMIIB1QIBATAnMBMxETAPBgNVBAMMCGRl
# dmFrZXN1AhAmKGzz2Y/ik00s+ReTOHmTMA0GCWCGSAFlAwQCAQUAoIGEMBgGCisG
# AQQBgjcCAQwxCjAIoAKAAKECgAAwGQYJKoZIhvcNAQkDMQwGCisGAQQBgjcCAQQw
# HAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZIhvcNAQkEMSIEICjV
# b2J0wt5ulmJZJMupO60TlxopXtftLY8fIoBVVwjiMA0GCSqGSIb3DQEBAQUABIIB
# AAUYsPsF123GHKr/C0f0p1Hwa9ACLfDx8Q5iu5FFvX5sD2GJ6gQJuVTzSQ8xUXLh
# E9aG7sWtafhN+nCx0fld3HARawmmrpzw1b455MHlO+RSsoQxzeBw8s2vINTbBBHI
# 0X02tQuX4/LKhecY88wKD+DnBjyvFWxahkxjfXWVUtHn9UzGOf8mRD/RDcZgvHFV
# aPeACodp1CLzMgghFx8t0V6TP+kWlbDlg5NRRtxwj1zEsBMZ3tsrijTE7PtttMIg
# UAc0f9JAZGJEpixxPoUHPUN+ejYJQ1xzpPvrIUcAEr7Aa+6lxV73dWn+bNgdNOqo
# BQcMwKj1RPLAVl8m6mvCd2g=
# SIG # End signature block
