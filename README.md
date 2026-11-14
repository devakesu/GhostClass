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
  <img src="https://img.shields.io/badge/Next.js-16.4.6-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2.8-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind-CSS%204.3.5-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-7.0.2-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Flutter-3.50.0-02569B?style=for-the-badge&logo=flutter&logoColor=white" alt="Flutter" />
  <img src="https://img.shields.io/badge/Android-10+-3DDC84?style=for-the-badge&logo=android&logoColor=black" alt="Android" />
  <img src="https://img.shields.io/badge/iOS-13+-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Vitest-5.0.0-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-1.62.1-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
</p>
<!-- markdownlint-enable MD033 -->

## Overview

GhostClass is the ultimate academic survival tool for students who want to
manage their attendance without the main character energy of a professor.
Featuring a sleek web dashboard and a native Flutter mobile application with
real-time analytics and visual performance charts, it helps you track your
classes so you never accidentally ghost your degree. With a built-in "bunk
calculator" to tell you exactly how many lectures you can skip before it becomes
a canon event, and a dedicated tracker for suspicious absences, GhostClass
ensures your attendance stays valid while you live your best life. Built to
integrate with existing attendance providers, GhostClass can fetch attendance
and leave data from EzyGo and related sources and presents it with a clean,
intuitive interface. No more confusing numbers - just clear, actionable
insights!

## 📲 Get the Mobile App

<!-- markdownlint-disable MD033 -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devakesu.apps.ghostclass" target="_blank" rel="noopener noreferrer">
    <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" width="260" />
  </a>
</p>
<!-- markdownlint-enable MD033 -->

## 🎯 Key Vibes

- **Student-First Dashboard** 🎈: A friendly dashboard with quick insights and a
  cheeky tone that still gets serious about accuracy.
- **The Bunk Calc** 🧮: Precise, actionable bunk counts presented with both
  "official" and "what-you-see" metrics so you know exactly how many classes you
  can miss before the threshold comes for your neck.
- **Visual Receipts** 📊: Performance charts, detailed calendar history, and
  downloadable attendance snapshots for an attendance glow-up, verifications, or
  appeals.
- **Manual Tracking** ✍️: Mark custom attendance; GhostClass reconciles them
  once official records arrive.
- **Anti-Ghosting Tracker** 👻: A personalized list to watch wrongly marked
  absences like a hawk until they get updated.
- **Course Toggle** 🔕: Per-semester course disable toggle (for challenge-passed
  / dropped courses) to clean up your aggregate statistics and keep your
  dashboard uncluttered.
- **Academic Documents** 📂: Unified viewer for Leave Applications and Exam
  Scores with detailed breakdowns.
- **Offline-First PWA + Native Parity** 📱: Use the web PWA or native Flutter
  mobile app; data and calculations stay perfectly consistent across both.

### 🔐 Security & Reliability

- **Zero-Trust Bridge**: Authenticated mobile-to-server and server-to-server
  communication with TLS and CSRF protection.
- **Device Attestation**: App Check with Play Integrity (Android) and
  DeviceCheck (iOS) prevents bot abuse.
- **Multi-Device Support**: Stay logged in on multiple devices simultaneously
  without session conflicts.
- **Build Transparency**: Full SLSA Level 3 provenance and mobile binary
  verification.

## 🛠️ Tech Stack

### Core Framework

- **Next.js 16.4.6** - React 19 with App Router
- **TypeScript 7.0.2** - Native compiler (@typescript/native) with TS 6.0.2 for linting compatibility
- **Flutter 3.50.0** - Cross-platform native mobile application
- **Node.js** - v26.13.1+

### Styling & UI

- **Tailwind CSS 4.3.5** - Utility-first styling with custom design system
- **Radix UI** - Accessible, unstyled component primitives
- **Shadcn UI** - Beautiful pre-styled components
- **Framer Motion** - Smooth animations and transitions
- **Lucide Icons** - Modern, customizable icon library

### Data & State Management

- **TanStack Query (React Query) v5** - Server state management with smart
  caching
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
- **App Check / Play Integrity** - Device attestation to prevent bot abuse and
  tampering on mobile
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

GhostClass uses a unified attendance logic with full parity between Web
(TypeScript) and Mobile (Dart). It calculates current attendance, "bunkable"
classes, and required sessions to reach a target.

For the full mathematical derivation, duty leave limits (5 per course), and
pseudocode, see **[ALGORITHM.md](docs/ALGORITHM.md)**.

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (with WSL2 backend enabled on Windows, or Docker Desktop / Engine on macOS and Linux)
- **VS Code or Antigravity IDE** with the **Dev Containers** extension (or any devcontainer-compatible IDE)
- _(Optional - for Windows)_ **WSL2** (Ubuntu/Debian) for optimal host integration and SSH relay

## 🐳 Dev Container Environment Setup (Recommended)

GhostClass provides an automated, reproducible Dev Container
(`.devcontainer/devcontainer.json` & `.devcontainer/Dockerfile`) equipped with Node 26 LTS, Flutter 3.50.0 SDK,
Android SDK tools (API 36/35/34), OpenJDK 21, Playwright, Supabase, Firebase, Infisical CLI tools,
automatic IDE extension syncing, and cross-platform ADB host bridging.

### 1. Initialize and Configure WSL2 (Windows Host - Optional)

To ensure optimal networking, memory utilization, and loopback connectivity,
configure WSL2 on the Windows host.

#### Option A: Using the WSL Settings GUI (Recommended)

Open the WSL Settings application (search for "WSL Settings" in the Windows
Start menu) or launch it by running the following command in PowerShell:

```powershell
wsl --settings
```

In the settings interface, configure the following:

- **Networking Mode**: `Mirrored`
- **Host Address Loopback**: `Enabled`
- **Automatic Memory Reclaim**: `Gradual`

#### Option B: Using the `.wslconfig` File

Create or edit `%USERPROFILE%\.wslconfig` in Windows (e.g.,
`C:\Users\<YourUsername>\.wslconfig`) and add the following settings:

```ini
[wsl2]
networkingMode=mirrored
hostAddressLoopback=true
autoMemoryReclaim=gradual
```

After configuring via either option, restart WSL2 by running the following
command in Windows PowerShell:

```powershell
wsl --shutdown
```

### 2. Enable Windows SSH Agent (Host - Optional)

Run PowerShell as Administrator or user to enable the OpenSSH agent service and
load your SSH/signing keys:

```powershell
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

### 3. Bridge SSH Agent to WSL2 (Optional)

In WSL2, install `socat`, download `npiperelay`, and bridge the Windows SSH pipe
to Linux:

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

_(Note for macOS & Linux hosts: Docker Desktop or Docker Engine runs natively without WSL2)._

### 4. Clone Repository

Clone the repository to your local machine (or inside WSL2):

```bash
git clone https://github.com/devakesu/GhostClass.git
cd GhostClass
```

### 5. Launch Dev Container

#### Option A: One-Click Launch in VS Code / Antigravity IDE (Recommended)

1. Open the cloned `GhostClass` directory in **VS Code** or **Antigravity IDE**.
2. When prompted: **"Folder contains a Dev Container configuration file. Reopen in Container?"**, click **Reopen in Container**.
   _(Alternatively, press `Ctrl+Shift+P` / `Cmd+Shift+P` and choose **Dev Containers: Reopen in Container**)._
3. The Dev Container builds and starts automatically:
   - Configures persistent caches (`ghostclass-pub-cache`, `ghostclass-gradle-cache`, `ghostclass-npm-cache`, `ghostclass-playwright-cache`).
   - Shadows `mobile/.dart_tool` and `mobile/build` volumes for host filesystem performance.
   - Forwards ports: Web (`3000`), Dart DevTools (`8181`), Supabase (`54321`-`54323`), and Firebase (`4000`, `5001`, `8080`, `9099`).
   - Executes `postCreateCommand` (`/home/vscode/init_workspace.sh`) automatically in `/workspaces/GhostClass` to install npm and flutter dependencies, set git safe directories, start the ADB forward bridge daemon, and initialize UI/UX tooling.

#### Option B: Standalone Terminal Launcher (`setup-dev-hub.sh`)

If running from a terminal without the GUI prompt:

```bash
chmod +x .devcontainer/setup-dev-hub.sh
./.devcontainer/setup-dev-hub.sh
```

- If the `devcontainer` CLI is installed, it runs `devcontainer up --workspace-folder .`.
- Otherwise, it falls back to building `ghostclass-devhub:latest` from `.devcontainer/Dockerfile`, starting `GhostClass_Sandbox`, mounting docker socket and cache volumes, and executing `init_workspace.sh`.
- Connect to an interactive shell anytime via:

  ```bash
  docker exec -it -u vscode GhostClass_Sandbox bash
  ```

### 6. Workspace Initialization & Maintenance

Initialization occurs automatically during container creation. If you ever need to re-verify volume permissions, reinstall npm/flutter packages, or restart background bridge daemons, execute:

```bash
bash /home/vscode/init_workspace.sh
```

### 7. Android Emulator & Physical Device Debugging (Host ADB Bridge)

To debug the Flutter mobile app on an Android Emulator or Physical Device running on your host machine:

#### Windows Host

Run from a PowerShell terminal on the Windows host:

```powershell
.\.devcontainer\Start.ps1
```

#### macOS / Linux Host

Run from a terminal on the macOS or Linux host:

```bash
chmod +x .devcontainer/start.sh
./.devcontainer/start.sh
```

#### Target Selection & Dynamic AVD Detection

Both bridge scripts provide an interactive menu:

- `[1] Android Emulator (Host Accelerated)`: Dynamically detects installed AVDs using `emulator -list-avds` (e.g. `Pixel_10_Pro_XL`), launches the emulator with host hardware acceleration, binds host ADB with `-a` (all interfaces), and connects container ADB to `host.docker.internal:5555`.
- `[2] Physical Device (Wi-Fi / USB)`: Auto-detects device Wi-Fi IP (or prompts for it), switches ADB to TCP mode (`5555`), and connects the container directly to the device.
- `[3] Skip ADB (Container Only)`: Bypasses ADB setup when developing web or backend services only.

#### In-Container Port Forward Bridge (`scripts/adb_forward_bridge.py`)

During workspace initialization, `scripts/adb_forward_bridge.py` runs as a background daemon inside the container. It monitors `adb forward --list` and automatically bridges container `127.0.0.1:<PORT>` to `host.docker.internal:<PORT>`. This ensures the Flutter CLI, Dart VM Service (`8181`), and DevTools connect seamlessly without `Connection refused` errors.

Press **ENTER** in the host terminal running `Start.ps1` or `start.sh` when done to gracefully shut down the ADB bridge and emulator.

### 🔐 Secret Management & Database Initialization

Before starting the API server or mobile client, authenticate with Infisical and
link your Supabase database project:

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

Visit `https://localhost:3000` (or `http://localhost:3000`) for the web
dashboard.

### 📱 Running Mobile App

Navigate to Mobile Directory and execute:

```bash
cd mobile
flutter pub get

infisical run --env=dev --projectId=xxxx --path=/build-time -- sh -c '
  export DART_VM_OPTIONS="--bind-address=0.0.0.0"
  flutter run \
    --dart-define=APP_DOMAIN="$NEXT_PUBLIC_APP_DOMAIN" \
    --dart-define=APP_VERSION="$NEXT_PUBLIC_APP_VERSION" \
    --dart-define=AUTHOR_NAME="$NEXT_PUBLIC_AUTHOR_NAME" \
    --dart-define=AUTHOR_URL="$NEXT_PUBLIC_AUTHOR_URL" \
    --dart-define=GITHUB_URL="$NEXT_PUBLIC_GITHUB_URL" \
    --dart-define=DONATE_URL="$NEXT_PUBLIC_DONATE_URL" \
    --dart-define=APP_NAME="$APP_NAME" \
    --dart-define=ANDROID_PACKAGE_NAME="$ANDROID_PACKAGE_NAME" \
    --dart-define=IOS_APP_ID="$IOS_APP_ID" \
    --dart-define=FIREBASE_API_KEY_ANDROID="$FIREBASE_API_KEY_ANDROID" \
    --dart-define=FIREBASE_ANDROID_APP_ID="$FIREBASE_ANDROID_APP_ID" \
    --dart-define=FIREBASE_MESSAGING_SENDER_ID="$FIREBASE_MESSAGING_SENDER_ID" \
    --dart-define=FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
    --dart-define=FIREBASE_STORAGE_BUCKET="$FIREBASE_STORAGE_BUCKET" \
    --dart-define=FIREBASE_API_KEY_IOS="$FIREBASE_API_KEY_IOS" \
    --dart-define=FIREBASE_IOS_APP_ID="$FIREBASE_IOS_APP_ID" \
    --dart-define=FIREBASE_IOS_BUNDLE_ID="$FIREBASE_IOS_BUNDLE_ID"
'
```

For contribution rules and environment configurations, please refer to
**[CONTRIBUTING.md](docs/CONTRIBUTING.md)** and **[SECURITY.md](SECURITY.md)**.

## ⚡ Performance Optimizations

GhostClass is optimized for maximum performance across platforms.

### 💻 Web & PWA

- **Service Worker**: Compiled via esbuild for offline functionality and runtime
  caching.
- **Intelligent Caching**: React Query for server state; `StaleWhileRevalidate`
  for assets.
- **Bundle Optimization**: Route-based code splitting, tree-shaking, and
  lazy-loaded animations.

### 📱 Mobile Native

- **Riverpod Caching**: Multi-layered in-memory deduplication for zero-latency
  UI.
- **Direct Egress**: Mobile requests call EzyGo directly, bypassing server
  proxies for lower latency.
- **Native Rendering**: High-performance `FL Chart` for responsive
  visualizations.

## 🧪 Testing

GhostClass maintains a comprehensive test suite with over **250+ test files**
across both platforms.

### 💻 Web Testing (Vitest & Playwright)

- ✅ **Core Logic**: `npm run test` (Vitest)
- ✅ **End-to-End**: `npm run test:e2e` (Playwright)
- ✅ **Security**: AES-256-GCM and CSRF isolation tests.

### 📱 Mobile Testing (Flutter)

- ✅ **Unit & Widget**: `flutter test` (Core logic, Riverpod providers, async
  exceptions)
- ✅ **CI/CD Enforcement**: Mandatory 80% global coverage gate on PRs via
  `flutter test --coverage`

### 🛡️ Coverage Highlights

- ✅ **Algorithm**: 100% logic coverage for bunk and parity calculations.
- ✅ **Security**: Verified implementation of App Check and Device Attestation.
- ✅ **Performance**: Benchmarked egress proxies and Riverpod cache
  deduplication.
- ✅ **UI/UX**: Full interaction testing for dashboard and manual tracking
  flows.

## 🔒 Security

GhostClass implements multiple layers of security:

- **AES-256-GCM Encryption** - All sensitive tokens and credentials encrypted at
  rest.
- **Multi-Device Session Security** - Concurrent logins without session
  invalidation.
- **Device Attestation** - Play Integrity / App Check to ensure genuine device
  requests.
- **Secure Storage** - Hardware-backed **SecureStorage** (Android Keystore / iOS
  Keychain) for mobile.

## 🚀 Deployment

### 💻 Web (Docker)

GhostClass is deployed using a single-build multi-platform Docker image
(`linux/amd64`, `linux/arm64`) with SLSA Level 3 provenance.

- **Build**: `docker build -t ghostclass .`
- **CI/CD**: Automatic versioning and deployment to Coolify via GitHub Actions.

### 📱 Mobile (Native)

Release artifacts are generated automatically for both platforms:

- **Android**: Signed App Bundle (`.aab`) and APK.
- **iOS**: Enterprise-signed or App Store IPA (requires macOS build agent).
- **Google Play**:
  [GhostClass on Google Play](https://play.google.com/store/apps/details?id=com.devakesu.apps.ghostclass)

## ❓ Frequently Asked Questions

**Why is the web dashboard sometimes slower than the mobile app?** Web users
share a server-side rate limiter to protect the proxy IP. Mobile users egress
directly from their own device IPs, avoiding this shared bottleneck.

**Can I use both apps at the same time?** Yes! Sessions are concurrent and data
(settings, tracking, etc.) is synchronized via Supabase.

## 🤝 Contributing

We welcome contributions! GhostClass uses an **automatic version bumping
system**. See **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** for details.

## 👥 Maintained by

- [Devanarayanan](https://github.com/devakesu/)
- Credits: [Bunkr](https://github.com/ABHAY-100/Bunkr/) (Initial codebase
  foundation)

## 📄 License

This project is licensed under the
**[GNU General Public License v3.0](LICENSE)**.

_**Thank you for your interest in GhostClass! Bunk classes & enjoy, but don't
forget to study!! 😝🤝**_
