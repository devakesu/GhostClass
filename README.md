# GhostClass

![GhostClass](public/logo.png)

[![Version](https://img.shields.io/github/v/release/devakesu/GhostClass?label=Version)](https://github.com/devakesu/GhostClass/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/devakesu/GhostClass/badge)](https://scorecard.dev/viewer/?uri=github.com/devakesu/GhostClass)
[![CodeQL](https://github.com/devakesu/GhostClass/actions/workflows/codeql.yml/badge.svg)](https://github.com/devakesu/GhostClass/actions/workflows/codeql.yml)
[![SLSA Level 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)
[![Attestations](https://img.shields.io/badge/Attestations-View-brightgreen?logo=github)](https://github.com/devakesu/GhostClass/attestations)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/11930/badge)](https://www.bestpractices.dev/projects/11930)
[![Security Scan: Trivy](https://img.shields.io/badge/Security-Trivy%20Scanned-blue)](.github/workflows/release.yml)

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.12-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2.8-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind-CSS%204.3.3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Flutter-3.44.0-02569B?style=for-the-badge&logo=flutter&logoColor=white" alt="Flutter" />
  <img src="https://img.shields.io/badge/Android-10+-3DDC84?style=for-the-badge&logo=android&logoColor=black" alt="Android" />
  <img src="https://img.shields.io/badge/iOS-13+-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Vitest-4.1.10-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-1.62.1-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
</p>
<!-- markdownlint-enable MD033 -->

## Overview

GhostClass is the ultimate academic survival tool for students who want to manage their attendance without the main character energy of a professor. Featuring a sleek web dashboard and a native Flutter mobile application with real-time analytics and visual performance charts, it helps you track your classes so you never accidentally ghost your degree. With a built-in "bunk calculator" to tell you exactly how many lectures you can skip before it becomes a canon event, and a dedicated tracker for suspicious absences, GhostClass ensures your attendance stays valid while you live your best life. Built to integrate with existing attendance providers, GhostClass can fetch attendance and leave data from EzyGo and related sources and presents it with a clean, intuitive interface. No more confusing numbers - just clear, actionable insights!

## 📲 Get the Mobile App

<!-- markdownlint-disable MD033 -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devakesu.apps.ghostclass" target="_blank" rel="noopener noreferrer">
    <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" width="260" />
  </a>
</p>
<!-- markdownlint-enable MD033 -->

## 🎯 Key Vibes

- **Student-First Dashboard** 🎈: A friendly dashboard with quick insights and a cheeky tone that still gets serious about accuracy.
- **The Bunk Calc** 🧮: Precise, actionable bunk counts presented with both "official" and "what-you-see" metrics so you know exactly how many classes you can miss before the threshold comes for your neck.
- **Visual Receipts** 📊: Performance charts, detailed calendar history, and downloadable attendance snapshots for an attendance glow-up, verifications, or appeals.
- **Manual Tracking** ✍️: Mark custom attendance; GhostClass reconciles them once official records arrive.
- **Anti-Ghosting Tracker** 👻: A personalized list to watch wrongly marked absences like a hawk until they get updated.
- **Course Toggle** 🔕: Per-semester course disable toggle (for challenge-passed / dropped courses) to clean up your aggregate statistics and keep your dashboard uncluttered.
- **Academic Documents** 📂: Unified viewer for Leave Applications and Exam Scores with detailed breakdowns.
- **Offline-First PWA + Native Parity** 📱: Use the web PWA or native Flutter mobile app; data and calculations stay perfectly consistent across both.

### 🔐 Security & Reliability

- **Zero-Trust Bridge**: Authenticated mobile-to-server and server-to-server communication with TLS and CSRF protection.
- **Device Attestation**: App Check with Play Integrity (Android) and DeviceCheck (iOS) prevents bot abuse.
- **Multi-Device Support**: Stay logged in on multiple devices simultaneously without session conflicts.
- **Build Transparency**: Full SLSA Level 3 provenance and mobile binary verification.

## 🛠️ Tech Stack

### Core Framework

- **Next.js 16.2.12** - React 19 with App Router
- **TypeScript 6.0.3** - Strict mode for type safety
- **Flutter 3.44.0** - Cross-platform native mobile application
- **Node.js** - v24.18.1+

### Styling & UI

- **Tailwind CSS 4.3.3** - Utility-first styling with custom design system
- **Radix UI** - Accessible, unstyled component primitives
- **Shadcn UI** - Beautiful pre-styled components
- **Framer Motion** - Smooth animations and transitions
- **Lucide Icons** - Modern, customizable icon library

### Data & State Management

- **TanStack Query (React Query) v5** - Server state management with smart caching
- **Riverpod v3** - Reactive state management for Flutter
- **React Hook Form + Zod v4** - Form validation with schema validation
- **Recharts v3** - Interactive data visualizations with responsive charts
- **FL Chart** - High-performance native mobile charts

### API & Documentation

- **OpenAPI 3.1** - API specification standard
- **Scalar** - Interactive API documentation viewer

### Backend & Database

- **Supabase** - PostgreSQL database with Row Level Security
- **Supabase Auth** - Secure authentication system
- **Axios v1** - HTTP client for API requests with retry logic
- **LRU Cache v11** - In-memory caching for API responses

### Security & Monitoring

- **AES-256-GCM Encryption** - Secure token storage at rest
- **CSRF Protection** - Custom token-based protection for web
- **App Check / Play Integrity** - Device attestation to prevent bot abuse and tampering on mobile
- **Upstash Redis** - Rate limiting with `@upstash/ratelimit`
- **Sentry** - Error tracking and performance monitoring
- **GA4 Measurement Protocol** - Server-side analytics (CSP-compatible)
- **Cloudflare Turnstile** - Bot protection for web
- **OSSF Scorecard** - Security best practices monitoring

### DevOps & Deployment

- **Docker** - Containerized deployment with multi-stage builds
- **GitHub Actions** - CI/CD pipeline with reproducible builds
- **SLSA Level 3** - Supply chain security with provenance attestation
- **Trivy** - Container image vulnerability scanning
- **Coolify** - Self-hosted deployment platform
- **Playwright** - E2E testing
- **Vitest** - Unit testing

## 📁 Project Structure

```text
mobile/                # Native Flutter application (Riverpod, SecureStorage)
├── lib/
│   ├── logic/         # Core business logic and bunk algorithm parity
│   ├── providers/     # Riverpod reactive state management handlers
│   ├── screens/       # Application views and dashboard UI
│   ├── services/      # Encrypted storage and direct API egress
│   └── widgets/       # Native UI components (FL Chart, custom layout items)
src/                   # Next.js web application (React 19, Tailwind 4, TanStack Query)
├── app/               # Pages, layouts, and API route handlers
├── components/        # Reusable UI components (Attendance cards, Charts, Calendars)
├── lib/               # Core logic (Bunk algorithm, Encryption, CSRF, Supabase)
└── proxy.ts           # Middleware security guard (Auth, CSP, Origin validation)
supabase/              # Database schema, migrations, and RLS policies
workers/               # Cloudflare/AWS egress proxies for Supabase ISP bypass
```

## 🧮 Attendance Calculation Algorithm

GhostClass uses a unified attendance logic with full parity between Web (TypeScript) and Mobile (Dart). It calculates current attendance, "bunkable" classes, and required sessions to reach a target.

For the full mathematical derivation, duty leave limits (5 per course), and pseudocode, see **[ALGORITHM.md](docs/ALGORITHM.md)**.

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (with WSL2 backend enabled)
- **WSL2** (Linux distribution such as Ubuntu/Debian)
- **VS Code or Antigravity IDE/any IDE with WSL/Docker Support**

## 🐳 Dev Container Environment Setup (Recommended)

GhostClass provides an isolated, reproducible Dev Container (`.devcontainer/Dockerfile`) equipped with Node 24, Flutter SDK 3.44, Deno, Playwright, Supabase, Firebase, Infisical CLI tools, and automatic IDE extension syncing.

### 1. Initialize and Configure WSL2 (Windows Host)

To ensure optimal networking, memory utilization, and loopback connectivity, configure WSL2 on the Windows host.

#### Option A: Using the WSL Settings GUI (Recommended)

Open the WSL Settings application (search for "WSL Settings" in the Windows Start menu) or launch it by running the following command in PowerShell:

```powershell
wsl --settings
```

In the settings interface, configure the following:

- **Networking Mode**: `Mirrored`
- **Host Address Loopback**: `Enabled`
- **Automatic Memory Reclaim**: `Gradual`

#### Option B: Using the `.wslconfig` File

Create or edit `%USERPROFILE%\.wslconfig` in Windows (e.g., `C:\Users\<YourUsername>\.wslconfig`) and add the following settings:

```ini
[wsl2]
networkingMode=mirrored
hostAddressLoopback=true
autoMemoryReclaim=gradual
```

After configuring via either option, restart WSL2 by running the following command in Windows PowerShell:

```powershell
wsl --shutdown
```

### 2. Enable Windows SSH Agent (Host)

Run PowerShell as Administrator or user to enable the OpenSSH agent service and load your SSH/signing keys:

```powershell
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

### 3. Bridge SSH Agent to WSL2

In WSL2, install `socat`, download `npiperelay`, and bridge the Windows SSH pipe to Linux:

```bash
sudo apt update && sudo apt install -y socat

# Download npiperelay to bridge Windows named pipes to Linux sockets
curl -s https://api.github.com/repos/jstarks/npiperelay/releases/latest | grep "browser_download_url.*zip" | cut -d : -f 2,3 | tr -d \" | wget -qi - -O /tmp/npiperelay.zip

sudo unzip -o /tmp/npiperelay.zip npiperelay.exe -d /usr/local/bin/
sudo chmod +x /usr/local/bin/npiperelay.exe
rm /tmp/npiperelay.zip

# Self-healing SSH relay script to your ~/.bashrc
cat << 'EOF' >> ~/.bashrc
# --- SSH AGENT RELAY ---
export SSH_AUTH_SOCK="$HOME/.ssh/agent.sock"

# Test if SSH agent is actually responding end-to-end
ssh-add -l >/dev/null 2>&1
if [ $? -eq 2 ]; then
    # Kill stale relay processes and clean up socket/directory glitches
    pkill -f "npiperelay.exe" 2>/dev/null || true
    pkill -f "$SSH_AUTH_SOCK" 2>/dev/null || true
    rm -rf "$SSH_AUTH_SOCK"
    mkdir -p "$HOME/.ssh"
    # Spawn fresh relay
    if command -v npiperelay.exe >/dev/null 2>&1; then
        (nohup socat UNIX-LISTEN:"$SSH_AUTH_SOCK",fork EXEC:"npiperelay.exe -ei -s //./pipe/openssh-ssh-agent",nofork >/dev/null 2>&1 &)
    fi
fi
EOF

# Clean up potential Docker dummy directories & init socket
rm -rf ~/.ssh/agent.sock
source ~/.bashrc
```

### 4. Clone Repository in WSL2

Clone the repository in your WSL2 home or projects directory:

```bash
git clone https://github.com/devakesu/GhostClass.git
cd GhostClass
```

### 5. Build & Run Sandbox Container

Build the dev container image and launch the sandbox container with mapped ports and volume mounts:

```bash
# 1. Verify SSH agent connection (must return your keys, not an error)
ssh-add -l

# 2. Build dev container image
docker build -t ghostclass-sandbox -f .devcontainer/Dockerfile .

# 3. Launch sandbox container
docker run -d --name GhostClass_Sandbox \
  --restart unless-stopped \
  -v "$(pwd):/ghostclass" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$HOME/.ssh/agent.sock:/run/host-services/ssh-auth.sock" \
  -e SSH_AUTH_SOCK="/run/host-services/ssh-auth.sock" \
  -p 3000:3000 -p 8000:8000 -p 8080:8080 -p 4000:4000 -p 5001:5001 \
  -p 8081:8081 -p 8085:8085 -p 9099:9099 \
  -p 54321:54321 -p 54322:54322 -p 54323:54323 \
  ghostclass-sandbox
```

### 6. Attach IDE & Initialize Workspace

1. Open VS Code or Antigravity IDE.
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → select **Attach to Running Container** → `GhostClass_Sandbox`.
3. Open directory `/ghostclass` inside the container.
4. Run workspace initialization script in the integrated terminal:

   ```bash
   ~/init_workspace.sh
   ```

   _(Enter Git Name and Email when prompted to configure local commit signing and SSH identity)._

5. Run **Developer: Reload Window** in VS Code / Antigravity to refresh environment variables and extension integrations.

### 7. Android Emulator Setup & Subsequent Development Startups

To run and debug the mobile app on an Android Emulator or Physical Device:

#### Android Emulator Setup

Create an Android Virtual Device (AVD) named `Medium_Phone_API_36.1` in Android Studio's AVD Manager. _(Note: If using a different AVD name, edit the `-avd` target in `.devcontainer/Start.ps1`)_.

#### Subsequent Starts via `Start.ps1` (Windows Host)

On subsequent development startups (after initial `docker run`), execute the startup script from a Windows PowerShell terminal on the host:

```powershell
.\.devcontainer\Start.ps1
```

Select `[1] Emulator` (or pass `-Mode Emulator`).

The script automatically ensures `GhostClass_Sandbox` container is running, launches the host Android emulator (`Medium_Phone_API_36.1`), bridges Windows ADB (`5555`) to Docker network (`host.docker.internal:5555`).

Press **ENTER** in the PowerShell terminal when finished to gracefully shut down the emulator and clean up portproxy rules.

### 🔐 Secret Management & Database Initialization

Before starting the API server or mobile client, authenticate with Infisical and link your Supabase database project:

```bash
# Authenticate Infisical CLI
infisical login

# Authenticate Supabase CLI and link schema
supabase login
supabase link --project-ref <your-supabase-project-ref>
supabase db push
```

### 🐍 Running Web Application / API Server

Once Infisical and Supabase are authenticated:

Run API / Web Server with Injected Secrets:

```bash
infisical run --env=dev --projectId=xxxx --path=/build-time --path=/runtime -- npm run dev:https
```

Visit `https://localhost:3000` (or `http://localhost:3000`) for the web dashboard.

### 📱 Running Mobile App

Navigate to Mobile Directory and execute:

```bash
cd mobile
flutter pub get

infisical run --env=dev --projectId=xxxx --path=/build-time -- sh -c '
  export DART_VM_OPTIONS="--bind-address=0.0.0.0"
  flutter run \
    --dart-define=APP_DOMAIN="$APP_DOMAIN" \
    --dart-define=APP_VERSION="$APP_VERSION" \
    --dart-define=APP_COMMIT_SHA="$APP_COMMIT_SHA" \
    --dart-define=BUILD_TIMESTAMP="$BUILD_TIMESTAMP" \
    --dart-define=GITHUB_RUN_ID="$GITHUB_RUN_ID" \
    --dart-define=GITHUB_RUN_NUMBER="$GITHUB_RUN_NUMBER" \
    --dart-define=AUTHOR_NAME="$AUTHOR_NAME" \
    --dart-define=AUTHOR_URL="$AUTHOR_URL" \
    --dart-define=GITHUB_URL="$GITHUB_URL" \
    --dart-define=DONATE_URL="$DONATE_URL" \
    --dart-define=APP_NAME="$APP_NAME" \
    --dart-define=ANDROID_PACKAGE_NAME="$ANDROID_PACKAGE_NAME" \
    --dart-define=IOS_APP_ID="$IOS_APP_ID" \
    --dart-define=GHOSTCLASS_DEV_URL="$GHOSTCLASS_DEV_URL"
'
```

For contribution rules and environment configurations, please refer to **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** and **[SECURITY.md](SECURITY.md)**.

## ⚡ Performance Optimizations

GhostClass is optimized for maximum performance across platforms.

### 💻 Web & PWA

- **Service Worker**: Compiled via esbuild for offline functionality and runtime caching.
- **Intelligent Caching**: React Query for server state; `StaleWhileRevalidate` for assets.
- **Bundle Optimization**: Route-based code splitting, tree-shaking, and lazy-loaded animations.

### 📱 Mobile Native

- **Riverpod Caching**: Multi-layered in-memory deduplication for zero-latency UI.
- **Direct Egress**: Mobile requests call EzyGo directly, bypassing server proxies for lower latency.
- **Native Rendering**: High-performance `FL Chart` for responsive visualizations.

## 🧪 Testing

GhostClass maintains a comprehensive test suite with over **250+ test files** across both platforms.

### 💻 Web Testing (Vitest & Playwright)

- ✅ **Core Logic**: `npm run test` (Vitest)
- ✅ **End-to-End**: `npm run test:e2e` (Playwright)
- ✅ **Security**: AES-256-GCM and CSRF isolation tests.

### 📱 Mobile Testing (Flutter)

- ✅ **Unit & Widget**: `flutter test` (Core logic, Riverpod providers, async exceptions)
- ✅ **CI/CD Enforcement**: Mandatory 80% global coverage gate on PRs via `flutter test --coverage`

### 🛡️ Coverage Highlights

- ✅ **Algorithm**: 100% logic coverage for bunk and parity calculations.
- ✅ **Security**: Verified implementation of App Check and Device Attestation.
- ✅ **Performance**: Benchmarked egress proxies and Riverpod cache deduplication.
- ✅ **UI/UX**: Full interaction testing for dashboard and manual tracking flows.

## 🔒 Security

GhostClass implements multiple layers of security:

- **AES-256-GCM Encryption** - All sensitive tokens and credentials encrypted at rest.
- **Multi-Device Session Security** - Concurrent logins without session invalidation.
- **Device Attestation** - Play Integrity / App Check to ensure genuine device requests.
- **Secure Storage** - Hardware-backed **SecureStorage** (Android Keystore / iOS Keychain) for mobile.

## 🚀 Deployment

### 💻 Web (Docker)

GhostClass is deployed using a single-build multi-platform Docker image (`linux/amd64`, `linux/arm64`) with SLSA Level 3 provenance.

- **Build**: `docker build -t ghostclass .`
- **CI/CD**: Automatic versioning and deployment to Coolify via GitHub Actions.

### 📱 Mobile (Native)

Release artifacts are generated automatically for both platforms:

- **Android**: Signed App Bundle (`.aab`) and APK.
- **iOS**: Enterprise-signed or App Store IPA (requires macOS build agent).
- **Google Play**: [GhostClass on Google Play](https://play.google.com/store/apps/details?id=com.devakesu.apps.ghostclass)

## ❓ Frequently Asked Questions

**Why is the web dashboard sometimes slower than the mobile app?**
Web users share a server-side rate limiter to protect the proxy IP. Mobile users egress directly from their own device IPs, avoiding this shared bottleneck.

**Can I use both apps at the same time?**
Yes! Sessions are concurrent and data (settings, tracking, etc.) is synchronized via Supabase.

## 🤝 Contributing

We welcome contributions! GhostClass uses an **automatic version bumping system**. See **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** for details.

## 👥 Maintained by

- [Devanarayanan](https://github.com/devakesu/)
- Credits: [Bunkr](https://github.com/ABHAY-100/Bunkr/) (Initial codebase foundation)

## 📄 License

This project is licensed under the **[GNU General Public License v3.0](LICENSE)**.

_**Thank you for your interest in GhostClass! Bunk classes & enjoy, but don't forget to study!! 😝🤝**_
