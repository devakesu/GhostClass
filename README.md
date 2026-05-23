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
  <img src="https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2.6-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind-CSS%204.3.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Flutter-3.44.0-02569B?style=for-the-badge&logo=flutter&logoColor=white" alt="Flutter" />
  <img src="https://img.shields.io/badge/Android-10+-3DDC84?style=for-the-badge&logo=android&logoColor=black" alt="Android" />
  <img src="https://img.shields.io/badge/iOS-13+-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Vitest-4.1.7-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-1.60.0-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
</p>
<!-- markdownlint-enable MD033 -->

## Overview

GhostClass is the ultimate academic survival tool for students who want to manage their attendance without the main character energy of a professor. Featuring a sleek web dashboard and a native Flutter mobile application with real-time analytics and visual performance charts, it helps you track your classes so you never accidentally ghost your degree. With a built-in "bunk calculator" to tell you exactly how many lectures you can skip before it becomes a canon event, and a dedicated tracker for suspicious absences, GhostClass ensures your attendance stays valid while you live your best life. Built to integrate with existing attendance providers, GhostClass can fetch attendance and leave data from EzyGo and related sources and presents it with a clean, intuitive interface. No more confusing numbers - just clear, actionable insights!

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

- **Zero-Trust Bridge**: Every mobile-to-server and server-to-server request is encrypted with **JWE** (RSA-OAEP + AES-GCM).
- **Device Attestation**: App Check with Play Integrity (Android) and DeviceCheck (iOS) prevents bot abuse.
- **Multi-Device Support**: Stay logged in on multiple devices simultaneously without session conflicts.
- **Build Transparency**: Full SLSA Level 3 provenance and mobile binary verification.

## 🛠️ Tech Stack

### Core Framework

- **Next.js 16.2.6** - React 19 with App Router
- **TypeScript 6.0.3** - Strict mode for type safety
- **Flutter 3.44.0** - Cross-platform native mobile application
- **Node.js** - v24.14.1+

### Styling & UI

- **Tailwind CSS 4.3.0** - Utility-first styling with custom design system
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
- **JWE (JSON Web Encryption)** - Secure cross-platform payload encryption for mobile-to-server and server-to-server communication
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
mobile/                # Native Flutter application (Riverpod, JWE, SecureStorage)
├── lib/
│   ├── logic/         # Core business logic and bunk algorithm parity
│   ├── providers/     # Riverpod reactive state management handlers
│   ├── screens/       # Application views and dashboard UI
│   ├── services/      # Encrypted storage, JWE client, and direct API egress
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

- **Node.js** - v24.14.1+
- **npm** - v11.11.0+

- **Flutter SDK** - 3.44.0
- **Docker** - For containerized deployment (optional)

### Quick Start (Web)

1. **Setup**: `git clone` the repo and run `npm install --legacy-peer-deps`.
2. **Database**: Link your project and run `npx supabase db push`.
3. **Environment**: Install the Infisical CLI, authenticate via `infisical login`, and organize secrets inside `/build-time`, `/runtime`, and `/ci` path folders.
4. **Run**: Inject variables securely in-memory using `infisical run -- npm run dev` and visit `http://localhost:3000`.

### Quick Start (Mobile)

1. **Install Flutter**: Ensure Flutter SDK 3.44.0 is installed.
2. **Setup**: Navigate to `mobile/` and run `flutter pub get`.
3. **Secrets**: Copy `app_secrets.dart.example` to `app_secrets.dart` and fill your API keys.
4. **Run**: Connect a device and run `flutter run`.

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
- ✅ **Security**: AES-256-GCM, JWE, and CSRF isolation tests.

### 📱 Mobile Testing (Flutter)

- ✅ **Unit & Widget**: `flutter test` (Core logic, Riverpod providers, async exceptions)
- ✅ **CI/CD Enforcement**: Mandatory 80% global coverage gate on PRs via `flutter test --coverage`

### 🛡️ Coverage Highlights

- ✅ **Algorithm**: 100% logic coverage for bunk and parity calculations.
- ✅ **Security**: Verified implementation of JWE, App Check, and RSA-OAEP.
- ✅ **Performance**: Benchmarked egress proxies and Riverpod cache deduplication.
- ✅ **UI/UX**: Full interaction testing for dashboard and manual tracking flows.

## 🔒 Security

GhostClass implements multiple layers of security:

- **AES-256-GCM Encryption** - All sensitive tokens and credentials encrypted at rest.
- **Multi-Device Session Security** - Concurrent logins without session invalidation.
- **Zero-Trust Bridge Security** - **JWE (JSON Web Encryption)** for mobile-to-server and server-to-server communication.
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

***Thank you for your interest in GhostClass! Bunk classes & enjoy, but don't forget to study!! 😝🤝***
