# --- CONFIGURATION ---
$ContainerName = "GhostClass_Sandbox"
$SSHPort = 7522
$User = "vscode"
$ADB_Port = 5037

# 1. Grab the exact text of your public key (stripping out any Windows newlines)
$pubKey = (Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw).Trim()

# 2. Inject it into the container and enforce strict 700/600 permissions
wsl docker exec -u vscode GhostClass_Sandbox bash -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pubKey' > ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

Write-Host "🚀 Step 1: Starting Docker Container..." -ForegroundColor Cyan
# Added 'wsl' prefix here
$Status = wsl docker inspect -f '{{.State.Status}}' $ContainerName 2>$null

if ($Status -ne "running") {
    # Added 'wsl' prefix here
    wsl docker start $ContainerName
    Write-Host "✅ Container started." -ForegroundColor Green
} else {
    Write-Host "ℹ️ Container already running." -ForegroundColor Gray
}

# --- WAIT FOR SSH SERVER ---
Write-Host "⏳ Step 2: Waiting for SSH server on port $SSHPort..." -ForegroundColor Cyan
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
        Write-Error "❌ SSH server failed to start in time. Check container logs."
        exit
    }
}

# --- REVERSE TUNNEL (The Direct Emulator Bridge) ---
Write-Host "🌉 Step 3: Tunneling the raw Emulator connection..." -ForegroundColor Cyan

$ID_FILE = "$env:USERPROFILE\.ssh\id_ed25519"

# Notice the change here: We are forwarding port 5555 now. No more -L 8181 needed!
Start-Process ssh -ArgumentList "-N", "-o", "StrictHostKeyChecking=no", "-i", "`"$ID_FILE`"", "-R", "5555:127.0.0.1:5555", "-p", "7522", "vscode@localhost" -WindowStyle Hidden

Write-Host "✅ Direct Emulator Tunnel established." -ForegroundColor Green

# --- CLEAN & CONNECT ADB ---
Write-Host "🧹 Step 4: Initializing Container's native ADB..." -ForegroundColor Cyan

# 1. Kill the container's old ADB instance
wsl docker exec -u $User $ContainerName adb kill-server

# Give it a second to breathe
Start-Sleep -Seconds 2

# 2. Tell the Container's ADB to connect to the SSH Tunnel
wsl docker exec -u $User $ContainerName adb connect 127.0.0.1:5555

Write-Host "✅ Connected! Container now fully controls the emulator." -ForegroundColor Green

Write-Host "`n🎯 All systems go! You can now run 'flutter run' in VS Code." -ForegroundColor Magenta
# SIG # Begin signature block
# MIIFfQYJKoZIhvcNAQcCoIIFbjCCBWoCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCB8YrXCWA+JkMOc
# Qz7LOnejTeLs1yXt9BrzSJx/L/l8yaCCAvowggL2MIIB3qADAgECAhAgDfxRX/Zk
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
# HAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZIhvcNAQkEMSIEIEbF
# tvAsAyGHtidXMUZikLLn9plp/bybA0W2mB3bfMlxMA0GCSqGSIb3DQEBAQUABIIB
# ADb3aYMxol9YyeX/058VE/iKqgmPAMyz4NEdaS8t5mUFlh5LZhIdp0Bp3BETVv6v
# JWjownIBIoSRrE0jywJdnyxEZD9NP8A7ic5L0v2fF2OYj1HGZydG4YLTP903Nd7Y
# UCeGfs/3/2xv72y4aCCG9c0AIIoi9ZjcC4lLTcjGGWrn2V/erU+ZVxZa8xBfuXft
# 1bZw1em1qZFKtanOX/H0ZQDU1MVZlqeT7tuMpVssRyEw9CwqZTVZOlqHA0rD8S/8
# OWYXaUnkfuw/v8pNCrctfdwo7gj+g/F+usQfSdXwBIQRt2Y7RD3GmxuAh9grntlT
# 43f2/B1RV1XxRMgI0aAZTew=
# SIG # End signature block
