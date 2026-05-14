# --- CONFIGURATION ---
$ContainerName = "GhostClass_Sandbox"
$SSHPort = 7522
$User = "vscode"
$WslConfigPath = "$env:USERPROFILE\.wslconfig"
$ID_FILE = "$env:USERPROFILE\.ssh\id_ed25519"
$AppPort = 3000

# --- DEV LIMITS (When coding) ---
$DevRAM = "12GB"  
$DevCores = 16
$DevSwap = "10GB"

# --- IDLE LIMITS (When exiting script) ---
$IdleRAM = "32GB"   
$IdleCores = 32
$IdleSwap = "10GB"

function Set-SafeWslLimits ($Mem, $Cores, $Swap) {
    if (-Not (Test-Path $WslConfigPath)) { Set-Content -Path $WslConfigPath -Value "[wsl2]" }
    
    $Lines = Get-Content $WslConfigPath
    $Output = @()
    
    foreach ($Line in $Lines) {
        if ($Line -match "^memory=" -or $Line -match "^processors=" -or $Line -match "^swap=") { continue }
        $Output += $Line
        
        if ($Line -match "^\[wsl2\]") {
            $Output += "memory=$Mem"
            $Output += "processors=$Cores"
            $Output += "swap=$Swap"
        }
    }
    $Output | Set-Content $WslConfigPath
    Write-Host "⚙️ Limits patched: $Mem RAM | $Cores Cores | $Swap Swap" -ForegroundColor Yellow
}

# ==========================================
# PHASE 1: SCALE UP & RESTART
# ==========================================
Write-Host "🧹 Cleaning up background processes..." -ForegroundColor Yellow
Stop-Process -Name "emulator", "qemu-system-x86_64", "ssh" -Force -ErrorAction SilentlyContinue

Write-Host "🔄 Evaluating Dev Limits..." -ForegroundColor Cyan
$NeedsReboot = Set-SafeWslLimits $DevRAM $DevCores $DevSwap

if ($NeedsReboot) {
    wsl --shutdown
    Write-Host "⏳ Waking up WSL..." -ForegroundColor Cyan
    Start-Sleep -Seconds 3 # Brief pause to let the kernel load
}

# --- NATIVE DOCKER PATCH: Force start the daemon ---
Write-Host "🔧 Booting native Docker daemon..." -ForegroundColor Cyan
# Run as root to avoid sudo password prompts
wsl -u root service docker start 2>$null

Write-Host "⏳ Waiting for Docker socket to accept connections..." -ForegroundColor Cyan
$dockerRetry = 0
while ($dockerRetry -lt 15) {
    if (wsl --exec docker info 2>$null) { 
        Write-Host "✅ Docker is online." -ForegroundColor Green
        break 
    }
    Start-Sleep -Seconds 2
    $dockerRetry++
}

# ==========================================
# PHASE 2: START UP (Docker & Emulator)
# ==========================================
Write-Host "🚀 Starting dependencies..." -ForegroundColor Cyan

$Status = wsl --exec docker inspect -f '{{.State.Status}}' $ContainerName 2>$null
if ($Status -ne "running") { 
    wsl --exec docker start $ContainerName 
    Write-Host "✅ Container started."
}

# Start a background WSL process that sleeps for 24 hours to prevent idle shutdown
Start-Process wsl -ArgumentList "-u root", "sleep", "86400" -WindowStyle Hidden

# --- OPTIMIZATION: Only install ADB if it's missing ---
Write-Host "📦 Verifying ADB inside container..." -ForegroundColor Cyan
wsl --exec docker exec -u root $ContainerName bash -c "if ! command -v adb &> /dev/null; then apt-get update && apt-get install -y android-tools-adb; fi"

# Inject the Key securely as ROOT to bypass Docker volume permission quirks
$pubKey = (Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw).Trim()
wsl --exec docker exec -u root $ContainerName bash -c "mkdir -p /home/vscode/.ssh && echo '$pubKey' > /home/vscode/.ssh/authorized_keys && chown vscode:vscode /home/vscode/.ssh && chown vscode:vscode /home/vscode/.ssh/authorized_keys && chmod 700 /home/vscode/.ssh && chmod 600 /home/vscode/.ssh/authorized_keys"

Write-Host "📱 Starting Android Emulator..."
$EmulatorProc = Start-Process emulator -ArgumentList "-avd Medium_Phone_API_36.1 -netdelay none -netspeed full" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 15

Write-Host "🔧 Ensuring SSH service is running..." -ForegroundColor Cyan
wsl --exec docker exec -u root $ContainerName service ssh start
Start-Sleep -Seconds 1

# Kill the ghost emulator inside the container so it doesn't break routing
wsl --exec docker exec -u $User $ContainerName adb -s emulator-5554 emu kill 2>$null

# ==========================================
# PHASE 3: NETWORKING & ADB (Tunnel)
# ==========================================
Write-Host "⏳ Waiting for SSH server on port $SSHPort..." -ForegroundColor Cyan
$retryCount = 0
while ($retryCount -lt 10) {
    if (Test-NetConnection -ComputerName localhost -Port $SSHPort -InformationLevel Quiet) {
        Write-Host "✅ SSH is alive!" -ForegroundColor Green
        break
    }
    $retryCount++
    Start-Sleep -Seconds 2
}

Write-Host "🌉 Tunneling Windows Emulator into the Container..." -ForegroundColor Cyan
$SshProc = Start-Process ssh -ArgumentList "-N", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-i", "`"$ID_FILE`"", "-R", "5555:127.0.0.1:5555", "-p", $SSHPort, "$User@127.0.0.1" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 5

Write-Host "🧹 Connecting Container's native ADB..." -ForegroundColor Cyan
wsl --exec docker exec -u $User $ContainerName adb kill-server
Start-Sleep -Seconds 2

Write-Host "🌉 Connecting Container's ADB..." -ForegroundColor Cyan
$retryCount = 0
while ($retryCount -lt 10) {
    wsl --exec docker exec -u $User $ContainerName adb connect 127.0.0.1:5555 | Out-Null
    $AdbState = wsl --exec docker exec -u $User $ContainerName adb -s 127.0.0.1:5555 get-state 2>$null

    if ($AdbState -eq "device") {
        Write-Host "✅ ADB Linked and Authorized!" -ForegroundColor Green
        break
    } elseif ($AdbState -eq "unauthorized") {
        Write-Host "⚠️  Connected but UNAUTHORIZED. Check emulator screen!" -ForegroundColor Yellow
        break
    } else {
        Write-Host "❌ ADB Connection failed or device offline. Retrying..." -ForegroundColor Red
    }
    $retryCount++
    Start-Sleep -Seconds 2
}

# --- ISOLATED ADMIN ELEVATION FOR EXTERNAL ACCESS ---
$WslIp = (wsl --exec hostname -I).Trim().Split(" ")[0]
Write-Host "🛡️ Requesting Admin rights to expose Port $AppPort to local network..." -ForegroundColor Cyan

$PortProxyCmd = "netsh interface portproxy add v4tov4 listenport=$AppPort listenaddress=0.0.0.0 connectport=$AppPort connectaddress=$WslIp; New-NetFirewallRule -DisplayName 'GhostClass-App' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $AppPort -ErrorAction SilentlyContinue"

Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command `"$PortProxyCmd`"" -Verb RunAs
Write-Host "✅ Network routing active: PC_IP:$AppPort -> Container:$AppPort" -ForegroundColor Green

# ==========================================
# PHASE 4: HOLD STATE
# ==========================================
Write-Host "`n🎯 All systems go!" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------"
Read-Host "🛑 PRESS ENTER TO TEARDOWN ENVIRONMENT & IDLE WSL 🛑"
Write-Host "--------------------------------------------------------"

# ==========================================
# PHASE 5: CLEANUP & SCALE DOWN
# ==========================================
Write-Host "🗑️ Tearing down..." -ForegroundColor Cyan

if ($SshProc) {
    Stop-Process -Id $SshProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "✅ SSH Tunnel closed."
}

Write-Host "📱 Sending shutdown signal to Emulator..." -ForegroundColor Yellow
wsl --exec docker exec -u $User $ContainerName adb shell reboot -p 2>$null
Start-Sleep -Seconds 3

wsl --exec docker stop $ContainerName
Write-Host "✅ Container stopped."

adb -e emu kill 2>$null
if ($EmulatorProc) { 
    Stop-Process -Id $EmulatorProc.Id -Force -ErrorAction SilentlyContinue 
    Write-Host "✅ Emulator process terminated."
}

Write-Host "🔄 Throttling WSL back to Idle limits..." -ForegroundColor Cyan
Set-SafeWslLimits $IdleRAM $IdleCores $IdleSwap
wsl --shutdown

Write-Host "✅ Environment sanitized & WSL put to sleep." -ForegroundColor Green

Write-Host "🛡️ Requesting Admin rights to clean up network routes..." -ForegroundColor Cyan
$CleanupCmd = "netsh interface portproxy delete v4tov4 listenport=$AppPort listenaddress=0.0.0.0; Remove-NetFirewallRule -DisplayName 'GhostClass-App' -ErrorAction SilentlyContinue"
Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command `"$CleanupCmd`"" -Verb RunAs
Write-Host "✅ Network routes and firewall rules sanitized." -ForegroundColor Green


# SIG # Begin signature block
# MIIFfQYJKoZIhvcNAQcCoIIFbjCCBWoCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCC8RFq+GngGPmt5
# /1c62PUwJfNX9we64JKxQLFg2rWbh6CCAvowggL2MIIB3qADAgECAhAgDfxRX/Zk
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
# HAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZIhvcNAQkEMSIEIEEk
# 2wiUBVdA61lng4u4OXRUs7QD5TaGABWOzhc1SogGMA0GCSqGSIb3DQEBAQUABIIB
# AAFD9+VnXEIjvuTx/p7Oi6X2rds+SlPaW1AQzFDWxIG2pA7Y/pj34sR78x/C1aRO
# XlUl3xwySp5OOqbO0w4b6+tijjM7HZCWXspNBbLDZyrmS0mMoMUmGNJJjPjLt6nd
# lHv00A19G5s5UfEbXrrkzO8quwGA5ptEbVQUn3d+c/Btm/rcqTTDN4xsC3ttOA+9
# nwyGCRtrhmsbbc3blUrgtFSShbAARyrsbPU7EOzR6Hmak0DGhyaQ5vmaH7KL7KDU
# sz2bJpAx1X/QrMP98215BlcFaj4/1wyQ4yt2Heedo9KE6ZIlUKsJaEA3AVgOTFA/
# RgGY6dQcyBqI/UGW9aqS+y8=
# SIG # End signature block
