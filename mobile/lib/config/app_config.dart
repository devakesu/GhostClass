import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'app_secrets.dart';

/// Centralized configuration for the application.
///
/// Sensitive configuration is stored in [AppSecrets] (gitignored).
/// Dynamic environment variable lookups (dart-define) remain removed to
/// maximize stealth.
class AppConfig {
  AppConfig._();

  // ─── Supabase Config ───────────────────────────────────────────────────────

  /// The Supabase API endpoint (Proxied via ghostclass.devakesu.com for ISP bypass).
  static String get supabaseUrl => _d(
    AppSecrets.isDev
        ? AppSecrets.supabaseUrlDev
        : AppSecrets.supabaseProxyUrlProd,
  );

  /// The Supabase publishable public key (previously anon key).
  static EncryptedValue get supabasePublishableKey =>
      EncryptedValue.fromPlaintext(
        _d(
          AppSecrets.isDev
              ? AppSecrets.supabasePublishableKeyDev
              : AppSecrets.supabasePublishableKeyProd,
        ),
      );

  /// The official GhostClass web application URL.
  static String get webUrl => 'https://ghostclass.devakesu.com';

  /// The Supabase Origin used to bypass "Forbidden: missing Origin header" errors.
  /// Spoofed to match the official app domain.
  static String get supabaseOrigin => webUrl;

  // ─── Backend & Bridge Config ───────────────────────────────────────────────

  /// The GhostClass web app's API origin (Auth Bridge).
  static String get ghostclassApiUrl => AppSecrets.isDev
      ? AppSecrets.ghostclassApiUrlDev
      : AppSecrets.ghostclassApiUrlProd;

  /// The EzyGo authentication root.
  static String get ezygoAuthUrl => _d(AppSecrets.ezygoAuthUrl);

  /// The EzyGo Base API root (everything before the endpoint).
  static String get ezygoApiRoot => _d(AppSecrets.ezygoApiRoot);

  /// The EzyGo Web Origin used in stealth headers.
  static String get ezygoOrigin => _d(AppSecrets.ezygoOrigin);

  // ─── Sentry Config ─────────────────────────────────────────────────────────

  /// The Sentry DSN for error tracking.
  static String get sentryDsn => _d(AppSecrets.sentryDsn);

  /// Firebase Cloud Project Number for Play Integrity
  static String get firebaseCloudProjectNumber => '424804867878';

  // ─── App Metadata ──────────────────────────────────────────────────────────

  /// Current application version.
  static String get appVersion => '3.0.8';

  /// Commit SHA injected by CI for release builds.
  static String get appCommitSha =>
      const String.fromEnvironment('APP_COMMIT_SHA', defaultValue: 'local');

  /// Build timestamp injected by CI for release builds.
  static String get buildTimestamp =>
      const String.fromEnvironment('BUILD_TIMESTAMP', defaultValue: 'local');

  /// GitHub Actions run ID injected by CI.
  static String get githubRunId =>
      const String.fromEnvironment('GITHUB_RUN_ID', defaultValue: 'local');

  /// GitHub Actions run number injected by CI.
  static String get githubRunNumber =>
      const String.fromEnvironment('GITHUB_RUN_NUMBER', defaultValue: 'local');

  /// Whether this binary was produced as a release build.
  static bool get isReleaseBuild => kReleaseMode;

  /// Effective date for legal terms.
  static String get legalEffectiveDate => 'May 11, 2026';

  /// Author branding.
  static String get authorName => '@deva.kesu';

  /// Author portfolio URL.
  static String get authorUrl => 'https://devakesu.com';

  /// Project source URL.
  static String get githubUrl => 'https://github.com/devakesu/GhostClass';

  /// Original project credits URL.
  static String get creditsUrl => 'https://github.com/ABHAY-100/Bunkr';

  /// Optional donation URL.
  static String get donateUrl => 'https://pages.razorpay.com/devakesu';

  /// Display name of the application.
  static String get appName => 'GhostClass';

  /// The Play Store URL for the application.
  static String get playStoreUrl =>
      'https://play.google.com/store/apps/details?id=com.devakesu.ghostclass';

  /// Official legal contact email.
  static String get legalEmail => 'legal@ghostclass.devakesu.com';

  /// Official support email.
  static String get supportEmail => 'contact@ghostclass.devakesu.com';

  /// The governing law region for terms.
  static String get governingLawRegion => 'India';

  /// The specific legal jurisdiction.
  static String get governingLawSpecific => 'Kochi, Kerala, India';

  /// Required Terms of Service version.
  static String get termsVersion => '2.8';

  /// Message displayed during background synchronization.
  static String get syncLoadingMessage =>
      _d('U3luY2luZyB3aXRoIEV6eUdvLi4uIPCfkbs=');

  // ─── Internal Helpers ──────────────────────────────────────────────────────

  /// Simple base64 decoding for stealth strings.
  /// This prevents sensitive strings and variable names from appearing plainly in the binary.
  /// ALL values must be base64-encoded uniformly to maintain consistent obfuscation.
  static String _d(String encoded) {
    if (encoded.isEmpty) return '';
    try {
      final trimmed = encoded.trim();
      if (trimmed.isEmpty) return '';

      // Normalize adds padding and handles URL-safe/standard base64 mixed alphabets.
      // If normalization or decoding fails, it's likely not base64, so we return raw.
      return utf8.decode(base64.decode(base64.normalize(trimmed)));
    } catch (e) {
      // Return the raw string as fallback if it's not actually base64
      // This allows migration and reduces breakage for unencoded dev strings
      return encoded;
    }
  }
}
