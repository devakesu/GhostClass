# GhostClass Mobile

![Flutter](https://img.shields.io/badge/Flutter-3.44.0-02569B?style=for-the-badge&logo=flutter&logoColor=white)
![Dart](https://img.shields.io/badge/Dart-3.11.4-0175C2?style=for-the-badge&logo=dart&logoColor=white)
![Android](https://img.shields.io/badge/Android-10+-3DDC84?style=for-the-badge&logo=android&logoColor=black)
![iOS](https://img.shields.io/badge/iOS-13+-000000?style=for-the-badge&logo=apple&logoColor=white)
![License](https://img.shields.io/badge/License-GPL%20v3-blue?style=for-the-badge)

## Overview

GhostClass Mobile is a secure, zero-trust Flutter application that communicates with the GhostClass backend API. Every network request is encrypted with JWE (JSON Web Encryption), device integrity is attested by Firebase App Check with Play Integrity (Android) and DeviceCheck (iOS), and all credentials are stored in hardware-backed secure storage — never in plain SharedPreferences.

## 📲 Download

<!-- markdownlint-disable MD033 -->
<p align="center">
   <a href="https://play.google.com/store/apps/details?id=com.devakesu.apps.ghostclass" target="_blank" rel="noopener noreferrer">
      <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" width="280" />
   </a>
</p>
<!-- markdownlint-enable MD033 -->

## ✨ Features

- **Dashboard** 📊 — Attendance overview with stats grid, progress ring, trend chart, and per-course bunk calculator
- **Course Cards** 🃏 — Same hatched-pattern modified attendance visualization as the web, with disable/enable toggle
- **Attendance Calendar** 📅 — Day-by-day attendance history calendar
- **Manual Tracker** 👻 — Track wrongly marked absences until they're corrected
- **Scores** 📋 — Exam and assignment results grouped by course, with per-question breakdown
- **Leave Applications** 📝 — View leave application status (sourced from EzyGo)
- **Notifications** 🔔 — In-app notification center
- **Help & Contact** 📚 — Built-in help docs (rendered Markdown) and contact form
- **Dark / Light Theme** 🌓 — System-aware theme with manual override
- **Zero-Trust Security** 🔐 — App Check, Play Integrity, JWE encryption, SecureStorage, anti-tapjacking

## 🛠️ Tech Stack

### Framework & Language

| Package | Version | Purpose |
| :--- | :--- | :--- |
| **Flutter** | 3.44.0 | Cross-platform UI framework |
| **Dart** | 3.11.4 | Language |

### State Management

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `flutter_riverpod` | ^3.3.1 | Reactive state management |
| `riverpod_annotation` + `build_runner` | ^4.0.2 | Code-gen providers |

### Networking & Backend

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `dio` | ^5.9.2 | HTTP client with interceptors |
| `supabase_flutter` | ^2.12.2 | Supabase auth + realtime |

### Navigation

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `go_router` | ^17.1.0 | Declarative routing |

### Security

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `firebase_core` | ^4.7.0 | Firebase SDK |
| `firebase_app_check` | ^0.4.3 | Device integrity & API protection |
| `flutter_secure_storage` | ^10.0.0 | Hardware-backed credential storage |
| `jose` + `pointycastle` | ^0.3.5+1 / ^3.9.1 | JWE key parsing + RSA operations |
| `encrypt` | ^5.0.3 | AES-256 symmetric encryption |

### UI & Charts

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `lucide_icons_flutter` | ^3.1.14+1 | Icon set (matches web) |
| `google_fonts` | ^8.0.2 | Typography |
| `flutter_animate` | ^4.5.2 | Declarative animations |
| `fl_chart` | ^1.2.0 | Attendance trend charts |
| `flutter_markdown_plus` | ^1.0.7 | Help page Markdown renderer |

### Monitoring

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `sentry_flutter` + `sentry_dio` | ^9.18.0 | Error tracking + performance |

### Utilities

| Package | Version | Purpose |
| :--- | :--- | :--- |
| `shared_preferences` | ^2.5.5 | Non-sensitive local preferences |
| `intl` | ^0.20.2 | Date/number formatting |
| `url_launcher` | ^6.3.2 | Open external links |
| `image_picker` | ^1.1.2 | Profile photo selection |

## 📁 Project Structure

```text
mobile/
├── android/                  # Android host app (Kotlin, Gradle)
│   └── app/
│       └── src/main/kotlin/com.devakesu.apps.ghostclass/
│           └── MainActivity.kt   # Anti-tapjacking + FLAG_SECURE
├── ios/                      # iOS host app (Swift, Xcode)
│   └── Runner/
│       └── AppDelegate.swift
├── packages/
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
│   │   └── static_content.dart  # Help/legal Markdown content
│   ├── logic/
│   │   ├── bunk.dart            # Attendance calculation algorithm (mirrors web)
│   │   ├── attendance_utils.dart # Attendance data helpers
│   │   ├── app_exception.dart   # Typed exception hierarchy
│   │   ├── error_handler.dart   # Centralized error handler mixin
│   │   ├── error_utils.dart     # Error formatting utilities
│   │   ├── encrypted_value.dart # AES-256 value wrapper
│   │   └── ezygo_batch_fetcher.dart # Rate-limited EzyGo API batch client (EzyGo data source)
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
│   │   ├── auth_provider.dart   # Auth state + upstream token lifecycle (EzyGo)
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
│   │   ├── login_screen.dart           # Credential login (EzyGo)
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

- **Flutter SDK** — 3.44.0 ([install](https://docs.flutter.dev/get-started/install))
- **Dart SDK** — 3.11.4 (bundled with Flutter)
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

`lib/config/app_secrets.dart` is gitignored because it contains sensitive keys. Create it by copying the example:

```bash
cp lib/config/app_secrets.dart.example lib/config/app_secrets.dart
```

Then fill in your actual values in the `AppSecrets` class:

```dart
// lib/config/app_secrets.dart
class AppSecrets {
  AppSecrets._();

  static const String supabaseProxyUrlProd = 'aHR0cHM6Ly9...'; // Base64 encoded
  static const String supabasePublishableKeyProd = 'c2JfcHVi...'; // Base64 encoded
  static const String sentryDsn = 'aHR0cHM6Ly9...'; // Base64 encoded
  static const String ghostclassApiUrlProd = 'https://ghostclass.devakesu.com/api';
  // ... other keys
}
```

> **Tip:** Securely manage and inject these values into CI builds via Infisical Native Integrations from the `/ci` folder without executing local sync scripts.

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **App Check** with:
   - Android: **Play Integrity** provider (production) / **Debug** provider (dev)
   - iOS: **DeviceCheck** provider (production) / **Debug** provider (dev)
3. Download and place the config files:
   - `android/app/google-services.json` ← gitignored
   - `ios/Runner/GoogleService-Info.plist` ← gitignored
4. Run `flutterfire configure` if regenerating `firebase_options.dart`

> **🔒 Production CI/CD Injection Note**: Because `google-services.json` and `GoogleService-Info.plist` contain project identifiers and configurations, they are strictly excluded from version control to protect production infrastructure. For automated builds, store these files as Base64 repository secrets and dynamically decode/inject them during the CI/CD pipeline initialization phase.

### Running Tests

GhostClass Mobile maintains a comprehensive automated testing suite covering logic parity, cryptographic operations, state management providers, and UI interactions.

```bash
# Execute unit and widget tests
flutter test

# Generate LCOV coverage report
flutter test --coverage
```

#### 🛡️ Testing & CI/CD Strategy

- **Minimum Module Coverage**: All core logic and data model files enforce a minimum **50% test coverage threshold**, with mission-critical modules (such as the bunk calculation algorithm and encryption services) maintained at **100% coverage**.
- **Automated CI/CD Quality Gates**: Mandatory GitHub Actions workflows validate coverage metrics on all pull requests and pushes, requiring an aggregate **80% total code coverage** before code can be merged.
- **Resilient Exception Simulations**: Tests actively simulate extreme network dropouts, plugin failures, and asynchronous edge cases using `mocktail` to verify robustness.

### Building

```bash
# Android APK (debug)
flutter build apk --debug

# Android App Bundle (release)
flutter build appbundle --release

# iOS (release, requires macOS + Xcode)
flutter build ios --release
```

> **🔑 Production Signing Note**: Release builds require valid cryptographically secure production keys. Ensure `android/key.properties` and your associated keystore (`.jks` / `.keystore`) file—both of which are **gitignored**—are placed in the `android/` directory before assembling production artifacts. For automated builds, these credentials must be injected dynamically via secure CI/CD environment secrets.

## 🔒 Security Architecture

GhostClass Mobile implements a zero-trust security model:

| Layer | Mechanism |
| :--- | :--- |
| **Device Attestation** | Firebase App Check → Play Integrity (Android) / DeviceCheck (iOS) |
| **Network Encryption** | Every API request/response wrapped in JWE (RSA-OAEP + AES-256-GCM) |
| **Credential Storage** | `flutter_secure_storage` (Android Keystore / iOS Keychain) |
| **Anti-Tapjacking** | `FLAG_SECURE` on Android `MainActivity` |
| **Stealth Headers** | Custom header injection to reduce fingerprinting during upstream data fetches |
| **Token Lifecycle** | Upstream bearer token (EzyGo) encrypted at rest; auto-refreshed on expiry |
| **Unified Auth** | Firebase App Check used in place of cookie-based CSRF for API requests |

## 📱 Platform Requirements

| Platform | Minimum | Target | Compile |
| :--- | :--- | :--- | :--- |
| Android | API 29 (Android 10) | API 35 (Android 15) | API 36 |
| iOS | iOS 13 | latest | latest Xcode |

---

*Part of the [GhostClass](../README.md) monorepo.*
