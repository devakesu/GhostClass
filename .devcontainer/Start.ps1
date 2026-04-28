# --- CONFIGURATION ---
$ContainerName = "GhostClass_Sandbox"
$SSHPort = 7522
$User = "vscode"
$WslConfigPath = "$env:USERPROFILE\.wslconfig"
$ID_FILE = "$env:USERPROFILE\.ssh\id_ed25519"

function Set-WslLimits ($Memory, $Processors) {
    $ConfigContent = "[wsl2]`nmemory=$Memory`nprocessors=$Processors"
    Set-Content -Path $WslConfigPath -Value $ConfigContent
    Write-Host "⚙️ .wslconfig updated: $Memory RAM, $Processors Cores." -ForegroundColor Yellow
}

# ==========================================
# PHASE 1: WSL LIMITS
# ==========================================
Write-Host "🔄 Phase 1: Applying 10GB / 12-Core limits & restarting WSL..." -ForegroundColor Cyan
Set-WslLimits -Memory "12GB" -Processors 12 -swap "8GB"
wsl --shutdown
Start-Sleep -Seconds 3 

# ==========================================
# PHASE 2: START UP (Docker & Emulator)
# ==========================================
Write-Host "🚀 Phase 2: Starting dependencies..." -ForegroundColor Cyan

# Running normally without wsl prefix (assuming Docker Desktop integration is active)
$Status = wsl --exec docker inspect -f '{{.State.Status}}' $ContainerName 2>$null
if ($Status -ne "running") {
    wsl --exec docker start $ContainerName
    Write-Host "✅ Container started." -ForegroundColor Green
} else {
    Write-Host "ℹ️ Container already running." -ForegroundColor Gray
}

# Key Injection
$pubKey = (Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw).Trim()
wsl --exec docker exec -u vscode $ContainerName bash -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pubKey' > ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

Write-Host "📱 Starting Android Emulator..."
$EmulatorProc = Start-Process emulator -ArgumentList "-avd Medium_Phone_API_36.1 -netdelay none -netspeed full" -PassThru -WindowStyle Hidden

# ==========================================
# PHASE 3: NETWORKING & ADB
# ==========================================
Write-Host "⏳ Waiting for SSH server on port $SSHPort..." -ForegroundColor Cyan
$maxRetries = 10
$retryCount = 0
while ($retryCount -lt $maxRetries) {
    if (Test-NetConnection -ComputerName localhost -Port $SSHPort -InformationLevel Quiet) {
        Write-Host "✅ SSH is alive!" -ForegroundColor Green
        break
    }
    $retryCount++
    Start-Sleep -Seconds 2
    if ($retryCount -eq $maxRetries) {
        Write-Error "❌ SSH server failed to start."
        Read-Host "🛑 Script failed. Press Enter to exit..." 
        exit
    }
}

Write-Host "🌉 Tunneling the raw Emulator connection..." -ForegroundColor Cyan
$SshProc = Start-Process ssh -ArgumentList "-N", "-o", "StrictHostKeyChecking=no", "-i", "`"$ID_FILE`"", "-R", "5555:127.0.0.1:5555", "-p", "7522", "vscode@localhost" -WindowStyle Hidden -PassThru
Write-Host "✅ Direct Emulator Tunnel established." -ForegroundColor Green

Write-Host "🧹 Initializing Container's native ADB..." -ForegroundColor Cyan
wsl --exec docker exec -u $User $ContainerName adb kill-server
Start-Sleep -Seconds 2
wsl --exec docker exec -u $User $ContainerName adb connect 127.0.0.1:5555
Write-Host "✅ Connected! Container now fully controls the emulator." -ForegroundColor Green

# --- ISOLATED ADMIN ELEVATION FOR PORT PROXY ---
$WslIp = (wsl --exec hostname -I).Trim().Split(" ")[0]
Write-Host "🛡️ Requesting Admin rights to map Port 3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$WslIp" -Verb RunAs
Write-Host "✅ Routing 0.0.0.0:3000 -> $WslIp:3000" -ForegroundColor Green

# ==========================================
# PHASE 4: HOLD STATE
# ==========================================
Write-Host "`n🎯 All systems go!" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------"
Read-Host "🛑 PRESS ENTER TO TEARDOWN ENVIRONMENT AND RESTORE WSL LIMITS 🛑"
Write-Host "--------------------------------------------------------"

# ==========================================
# PHASE 5: CLEANUP & RESTORE
# ==========================================
Write-Host "🗑️ Phase 5: Tearing down..." -ForegroundColor Cyan

wsl --exec docker stop $ContainerName

if ($SshProc) { 
    Stop-Process -Id $SshProc.Id -Force -ErrorAction SilentlyContinue 
    Write-Host "✅ SSH Tunnel closed."
}

adb -e emu kill 2>$null
if ($EmulatorProc) {
    Start-Sleep -Seconds 2
    Stop-Process -Id $EmulatorProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Emulator stopped."
}

# --- ISOLATED ADMIN ELEVATION FOR CLEANUP ---
Write-Host "🛡️ Requesting Admin rights to clean up Port 3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0" -Verb RunAs

$TotalCores = (Get-WmiObject -Class Win32_Processor).NumberOfLogicalProcessors
Write-Host "🔄 Restoring WSL config to 30GB / $TotalCores Cores..." -ForegroundColor Cyan
Set-WslLimits -Memory "30GB" -Processors $TotalCores
wsl --shutdown

Write-Host "✅ Done. Environment sanitized." -ForegroundColor Green


# SIG # Begin signature block
# MIIFfQYJKoZIhvcNAQcCoIIFbjCCBWoCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCDbbyWew8w3c/gP
# 9AHSWwIi19J295MMO29FkXhqEx8xt6CCAvowggL2MIIB3qADAgECAhAgDfxRX/Zk
# h0itgCU8KbfCMA0GCSqGSIb3DQEBCwUAMBMxETAPBgNVBAMMCGRldmFrZXN1MB4X
# DTI2MDQyNzExMTI1NFoXDTI3MDQyNzExMzI1NFowEzERMA8GA1UEAwwIZGV2YWtl
# c3UwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCrhVn79t4/fP2jtIkb
# OmN7X1HQBCywC4Vb+pJfzqbV8RP/8uhu2NOQg4deCa1srQSADnm9ItzXdAjfc4NA
# TnPdXkSx4hBsP8smizA0X8dPNbK0ODBnZcZC88eoQ/4KNdL6rqlflPGP5Dx3k06S
# JMaAkFzgcjNqoH6QNIPZHsss6T7kBglcVjn4kj/66cy5zcedRTazFCJB85Zb9U72
# pcL5ZvK5xD4yVJ1c/9lKqUW4lbg9R7G0gZ6dz44GGbZVX26Qphl5WDJxnEmh/8Jf
# JkZZiySiDjVirns+Ny/k3HnLTbSpLVLMj5a1/xOsvEghSPYvG7X51Hj1Alz5L5yf
# NlhNAgMBAAGjRjBEMA4GA1UdDwEB/wQEAwIHgDATBgNVHSUEDDAKBggrBgEFBQcD
# AzAdBgNVHQ4EFgQUjNvZgRB8L+Vi+Skv86hd2P0PPbAwDQYJKoZIhvcNAQELBQAD
# ggEBAADVMcuuh4TVc5QWwFIGNLsdtsYnfawipRI5X8TQTrjqJfdCBMBnse/kLLIT
# KbNhG5Lxylu8jXdukcUvUFt72FOFXN1eY7oocp+jQWERXVNasARORfV3GrkWRW64
# vHZG/XmfmguA5l/K0rP0pi+2pMn5mjhfjx13EAxeAMGKQU7GY1DWM5TQJDTZx4B3
# +vvFbYvYxmUmCchqWFjg9Omzpa1Q4UThRclmIk7cb6eN1bbU4tF1/4gmAe+iUkVO
# zJzvVgp/M8XO7X85V7bIZGSRa/IYRpfpVS9usJ06b7OfTMzbKxWd2+iSCSEdKztT
# fqh6873JOeOS7Wj+cuO9xt5guQMxggHZMIIB1QIBATAnMBMxETAPBgNVBAMMCGRl
# dmFrZXN1AhAgDfxRX/Zkh0itgCU8KbfCMA0GCWCGSAFlAwQCAQUAoIGEMBgGCisG
# AQQBgjcCAQwxCjAIoAKAAKECgAAwGQYJKoZIhvcNAQkDMQwGCisGAQQBgjcCAQQw
# HAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZIhvcNAQkEMSIEIE9v
# VoFjNDbGkmyrVvauX2QhJxFxHJnlZ6e/jmD4qS74MA0GCSqGSIb3DQEBAQUABIIB
# AFm4SelUKAZrPXrfMLr/E2FjGYij5MzdlktgyTFRkGb5vMcdV2E2ukudpeEoGL93
# 2D6YX4Otvkd6F4pe9P4dfOjkIrr/CK/KWvwjWxSAkLQ5IJKNeOjF5V5/31IEtMuP
# dMCKOkR99kh5yLIXdz34GfYabHs/4viyUbGlwv7EHuKscmiH/7AAk8IqEvY6yZgV
# Lcpl1Ztwni0kgMdkHsGTIk8lj74MjJnoOA/v9IsX00HFdWld6/CSbGWOHVNYJU8D
# twCGdpbHaoD0drrcgMJZg70pFNybwagWuF4ehlleDPTV3d2aixQobBlMu2he/Xrn
# qQ/NPqdzbPnifeSVg/7RWBg=
# SIG # End signature block
