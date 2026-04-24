# GhostClass Mobile

<!-- markdownlint-disable MD060 -->

Native Flutter companion to the [GhostClass](../README.md) web application — bringing the same attendance management experience to Android and iOS with full offline support and hardware-backed security.

[![Flutter](https://img.shields.io/badge/Flutter-3.27%2B-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![Dart](https://img.shields.io/badge/Dart-3.11%2B-0175C2?logo=dart&logoColor=white)](https://dart.dev)
[![Android](https://img.shields.io/badge/Android-10%2B_(API_29)-3DDC84?logo=android&logoColor=white)](https://developer.android.com)
[![iOS](https://img.shields.io/badge/iOS-13%2B-000000?logo=apple&logoColor=white)](https://developer.apple.com)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Overview

GhostClass Mobile is a secure, zero-trust Flutter application that communicates with the GhostClass backend API. Every network request is encrypted with JWE (JSON Web Encryption), device integrity is attested by Firebase App Check with Play Integrity (Android) and DeviceCheck (iOS), and all credentials are stored in hardware-backed secure storage — never in plain SharedPreferences.

## ✨ Features

- **Dashboard** 📊 — Attendance overview with stats grid, progress ring, trend chart, and per-course bunk calculator
- **Course Cards** 🃏 — Same hatched-pattern modified attendance visualization as the web, with disable/enable toggle
- **Attendance Calendar** 📅 — Day-by-day attendance history calendar
- **Manual Tracker** 👻 — Track wrongly marked absences until they're corrected
- **Scores** 📋 — Exam and assignment results grouped by course, with per-question breakdown
- **Leave Applications** 📝 — View EzyGo leave application status
- **Notifications** 🔔 — In-app notification center
- **Help & Contact** 📚 — Built-in help docs (rendered Markdown) and contact form
- **Dark / Light Theme** 🌓 — System-aware theme with manual override
- **Zero-Trust Security** 🔐 — App Check, Play Integrity, JWE encryption, SecureStorage, anti-tapjacking

## 🛠️ Tech Stack

### Framework & Language

| Package | Version | Purpose |
|---|---|---|
| Flutter | 3.27+ | Cross-platform UI framework |
| Dart | ^3.11.4 | Language |

### State Management

| Package | Version | Purpose |
|---|---|---|
| `flutter_riverpod` | ^3.3.1 | Reactive state management |
| `riverpod_annotation` + `build_runner` | ^4.0.2 | Code-gen providers |

### Networking & Backend

| Package | Version | Purpose |
|---|---|---|
| `dio` | ^5.9.2 | HTTP client with interceptors |
| `supabase_flutter` | ^2.12.2 | Supabase auth + realtime |

### Navigation

| Package | Version | Purpose |
|---|---|---|
| `go_router` | ^17.1.0 | Declarative routing |

### Security

| Package | Version | Purpose |
|---|---|---|
| `firebase_core` | ^4.7.0 | Firebase SDK |
| `firebase_app_check` | ^0.4.3 | Device integrity attestation |
| `flutter_play_integrity_wrapper` | local | Vendored Play Integrity plugin |
| `flutter_secure_storage` | ^10.0.0 | Hardware-backed credential storage |
| `jose` + `pointycastle` | ^0.3.5 / ^3.9.1 | JWE key parsing + RSA operations |
| `encrypt` | ^5.0.3 | AES-256 symmetric encryption |

### UI & Charts

| Package | Version | Purpose |
|---|---|---|
| `lucide_icons` | ^0.257.0 | Icon set (matches web) |
| `google_fonts` | ^8.0.2 | Typography |
| `flutter_animate` | ^4.5.2 | Declarative animations |
| `fl_chart` | ^1.2.0 | Attendance trend charts |
| `flutter_markdown_plus` | ^1.0.7 | Help page Markdown renderer |

### Monitoring

| Package | Version | Purpose |
|---|---|---|
| `sentry_flutter` + `sentry_dio` | ^9.18.0 | Error tracking + performance |

### Utilities

| Package | Version | Purpose |
|---|---|---|
| `shared_preferences` | ^2.5.5 | Non-sensitive local preferences |
| `intl` | ^0.20.2 | Date/number formatting |
| `url_launcher` | ^6.3.2 | Open external links |
| `image_picker` | ^1.1.2 | Profile photo selection |

## 📁 Project Structure

```text
mobile/
├── android/                  # Android host app (Kotlin, Gradle)
│   └── app/
│       └── src/main/kotlin/com/devakesu/ghostclass/
│           └── MainActivity.kt   # Anti-tapjacking + FLAG_SECURE
├── ios/                      # iOS host app (Swift, Xcode)
│   └── Runner/
│       └── AppDelegate.swift
├── packages/
│   └── flutter_play_integrity_wrapper/  # Vendored Play Integrity plugin
├── assets/
│   ├── icon.png              # App icon
│   └── logo.png              # GhostClass logo
├── lib/
│   ├── main.dart             # Entry point — Firebase init, App Check, Sentry, runApp
│   ├── firebase_options.dart # Generated Firebase config
│   ├── config/
│   │   ├── app_config.dart   # Runtime config (API URLs, feature flags)
│   │   └── app_secrets.dart  # ⚠️ GITIGNORED — local secrets (keys, tokens)
│   ├── constants/
│   │   ├── static_content.dart  # Help/legal Markdown content
│   │   └── content_cache.dart   # In-memory content cache
│   ├── logic/
│   │   ├── bunk.dart            # Attendance calculation algorithm (mirrors web)
│   │   ├── attendance_utils.dart # Attendance data helpers
│   │   ├── app_exception.dart   # Typed exception hierarchy
│   │   ├── error_handler.dart   # Centralized error handler mixin
│   │   ├── error_utils.dart     # Error formatting utilities
│   │   ├── encrypted_value.dart # AES-256 value wrapper
│   │   └── ezygo_batch_fetcher.dart # Rate-limited EzyGo API batch client
│   ├── models/
│   │   ├── attendance.dart      # Attendance report types
│   │   ├── course_details.dart  # Course model
│   │   ├── course_instructor.dart # Instructor model
│   │   ├── dashboard_stats.dart # Aggregate dashboard statistics
│   │   ├── leave.dart           # Leave application model
│   │   ├── notification.dart    # Notification model
│   │   ├── score.dart           # Exam/score model
│   │   └── tracking.dart        # Manual tracking record model
│   ├── providers/              # Riverpod providers
│   │   ├── auth_provider.dart   # Auth state + EzyGo token lifecycle
│   │   ├── academic_provider.dart # Academic year/semester info
│   │   ├── dashboard_provider.dart # Dashboard data aggregation
│   │   ├── tracking_provider.dart  # Manual tracking state
│   │   ├── leave_provider.dart     # Leave applications state
│   │   ├── score_provider.dart     # Scores state
│   │   ├── notification_provider.dart # Notifications state
│   │   ├── instructor_provider.dart   # Instructor info
│   │   ├── outage_provider.dart       # Service outage detection
│   │   ├── theme_provider.dart        # Theme state
│   │   └── ui_state_provider.dart     # Transient UI state
│   ├── router/
│   │   └── app_router.dart      # GoRouter configuration + guards
│   ├── screens/
│   │   ├── splash_screen.dart          # Launch + auth redirect
│   │   ├── login_screen.dart           # EzyGo credential login
│   │   ├── accept_terms_screen.dart    # T&C acceptance gate
│   │   ├── navigation_shell.dart       # Bottom nav shell
│   │   ├── dashboard_screen.dart       # Main attendance dashboard
│   │   ├── attendance_calendar_screen.dart # Daily calendar view
│   │   ├── tracking_screen.dart        # Manual absence tracker
│   │   ├── scores_screen.dart          # Exam scores + breakdown
│   │   ├── leaves_screen.dart          # Leave applications
│   │   ├── notifications_screen.dart   # Notification center
│   │   ├── profile_screen.dart         # User profile & settings
│   │   ├── help_screen.dart            # Help docs (Markdown)
│   │   ├── contact_screen.dart         # Contact form
│   │   ├── ghostclass_screen.dart      # GhostClass info screen
│   │   └── static_screen.dart          # Legal/static content
│   ├── services/
│   │   ├── api_service.dart           # Dio HTTP client + JWE interceptor
│   │   ├── jwe_service.dart           # JWE key fetch + encrypt/decrypt
│   │   ├── jwe_interceptor.dart       # Dio interceptor for JWE wrapping
│   │   ├── secure_storage.dart        # flutter_secure_storage wrapper
│   │   ├── security_guard.dart        # App Check + Play Integrity check
│   │   ├── stealth_headers_service.dart # Anti-fingerprinting header injection
│   │   ├── profile_service.dart       # User profile CRUD
│   │   ├── settings_service.dart      # User settings persistence
│   │   └── logger.dart               # Sentry-integrated logger
│   ├── theme/
│   │   └── app_theme.dart    # Material 3 theme with custom tokens
│   └── widgets/
│       ├── dashboard/        # Dashboard-specific widgets
│       │   ├── course_card.dart         # Per-course attendance card
│       │   ├── disable_aware_course_card.dart # Card with disable toggle
│       │   ├── course_list_section.dart # Scrollable course list
│       │   ├── header_section.dart      # Dashboard hero header
│       │   ├── progress_section.dart    # Overall progress ring
│       │   ├── stats_grid_section.dart  # Summary stats 2×2 grid
│       │   ├── trend_chart.dart         # fl_chart attendance trend
│       │   └── hatch_painter.dart       # 45° hatch pattern painter
│       ├── attendance/
│       │   ├── add_course_dialog.dart   # Add manual course dialog
│       │   └── edit_instructor_dialog.dart # Edit instructor dialog
│       ├── add_attendance_dialog.dart   # Universal add-record dialog
│       ├── security_error_dialog.dart   # App Check failure dialog
│       ├── service_error_dialog.dart    # API error dialog
│       ├── service_error_view.dart      # Inline error state widget
│       ├── service_refresh_indicator.dart # Pull-to-refresh wrapper
│       ├── service_toast.dart           # Snackbar toast helper
│       ├── loading_overlay.dart         # Full-screen loading overlay
│       ├── dashed_border_painter.dart   # Custom dashed border painter
│       └── app_footer.dart             # App footer widget
├── test/                     # Flutter test suite
├── pubspec.yaml              # Package manifest
└── analysis_options.yaml     # Dart lint config
```

## 🚀 Getting Started

### Prerequisites

- **Flutter SDK** — 3.27+ ([install](https://docs.flutter.dev/get-started/install))
- **Dart SDK** — ^3.11.4 (bundled with Flutter)
- **Android Studio / Xcode** — for emulator/simulator
- **Firebase CLI** — for App Check configuration
- **A GhostClass backend** — see the [root README](../README.md) for web setup

### Quick Start

```bash
# 1. From the repo root, navigate to the mobile app
cd mobile

# 2. Install dependencies
flutter pub get

# 3. Create the secrets file (gitignored)
#    See "Secrets Setup" below

# 4. Connect a device or start an emulator, then run
flutter run
```

> **Note:** The app will not build without `lib/config/app_secrets.dart`.
> See the **Secrets Setup** section below.

### Secrets Setup

`lib/config/app_secrets.dart` is gitignored because it contains sensitive keys. Create it manually:

```dart
// lib/config/app_secrets.dart
import 'package:flutter/foundation.dart';

const String kSupabaseUrl = 'https://xxxx.supabase.co';
const String kSupabaseAnonKey = 'your-anon-key';
const String kSentryDsn = 'https://xxxx@sentry.io/xxxx';
const String kGhostclassApiUrl = 'https://your-ghostclass-instance.com';
// Other secret keys as required by AppConfig
```

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **App Check** with:
   - Android: **Play Integrity** provider (production) / **Debug** provider (dev)
   - iOS: **DeviceCheck** provider (production) / **Debug** provider (dev)
3. Download and place the config files:
   - `android/app/google-services.json` ← gitignored
   - `ios/Runner/GoogleService-Info.plist` ← gitignored
4. Run `flutterfire configure` if regenerating `firebase_options.dart`

### Running Tests

```bash
# All tests
flutter test

# With coverage
flutter test --coverage
```

### Building

```bash
# Android APK (debug)
flutter build apk --debug

# Android App Bundle (release)
flutter build appbundle --release

# iOS (release, requires macOS + Xcode)
flutter build ios --release
```

## 🔒 Security Architecture

GhostClass Mobile implements a zero-trust security model:

| Layer | Mechanism |
|---|---|
| **Device Attestation** | Firebase App Check → Play Integrity (Android) / DeviceCheck (iOS) |
| **Network Encryption** | Every API request/response wrapped in JWE (RSA-OAEP + AES-256-GCM) |
| **Credential Storage** | `flutter_secure_storage` (Android Keystore / iOS Keychain) |
| **Anti-Tapjacking** | `FLAG_SECURE` on Android `MainActivity` |
| **Stealth Headers** | Custom header injection to avoid EzyGo fingerprinting |
| **Token Lifecycle** | EzyGo bearer token encrypted at rest; auto-refreshed on expiry |
| **CSRF Bypass** | `MOBILE_API_SECRET` header used in place of cookie-based CSRF |

## 📱 Platform Requirements

| Platform | Minimum | Target | Compile |
|---|---|---|---|
| Android | API 29 (Android 10) | API 35 (Android 15) | API 36 |
| iOS | iOS 13 | latest | latest Xcode |

---

*Part of the [GhostClass](../README.md) monorepo.*
