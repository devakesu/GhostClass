import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:ghostclass/config/app_secrets.dart';
import 'package:ghostclass/constants/static_content.dart' as static_content;
import 'package:ghostclass/logic/encrypted_value.dart';

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

  /// The app domain (no scheme), used to derive emails and web URL.
  static String get _appDomain => const String.fromEnvironment(
    'APP_DOMAIN',
    defaultValue: 'ghostclass.devakesu.com',
  );

  /// The official GhostClass web application URL.
  static String get webUrl => 'https://$_appDomain';

  /// The Supabase Origin used to bypass "Forbidden: missing Origin header" errors.
  /// Spoofed to match the official app domain.
  static String get supabaseOrigin =>
      AppSecrets.isDev ? 'https://localhost:3000' : webUrl;

  // ─── Backend & Bridge Config ───────────────────────────────────────────────

  /// The GhostClass web app's API origin (Auth Bridge).
  static String get ghostclassApiUrl => _d(
    AppSecrets.isDev
        ? AppSecrets.ghostclassApiUrlDev
        : AppSecrets.ghostclassApiUrlProd,
  );

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

  /// Current application version (derived from Infisical compilation injection).
  static String get appVersion =>
      const String.fromEnvironment('APP_VERSION', defaultValue: '4.4.7');

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

  /// Author branding.
  static String get authorName => const String.fromEnvironment(
    'AUTHOR_NAME',
    defaultValue: '@deva.kesu',
  );

  /// Author portfolio URL.
  static String get authorUrl => const String.fromEnvironment(
    'AUTHOR_URL',
    defaultValue: 'https://devakesu.com',
  );

  /// Project source URL.
  static String get githubUrl => const String.fromEnvironment(
    'GITHUB_URL',
    defaultValue: 'https://github.com/devakesu/GhostClass',
  );

  /// Original project credits URL.
  static String get creditsUrl => 'https://github.com/ABHAY-100/Bunkr';

  /// Optional donation URL.
  static String get donateUrl => const String.fromEnvironment(
    'DONATE_URL',
    defaultValue: 'https://pages.razorpay.com/devakesu',
  );

  /// Display name of the application.
  static String get appName => const String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'GhostClass',
  );

  /// The Play Store URL for the application.
  static String get playStoreUrl {
    const pkg = String.fromEnvironment(
      'ANDROID_PACKAGE_NAME',
      defaultValue: 'com.devakesu.apps.ghostclass',
    );
    return 'https://play.google.com/store/apps/details?id=$pkg';
  }

  /// The App Store URL for the application.
  static String get appStoreUrl {
    const appId = String.fromEnvironment(
      'IOS_APP_ID',
      defaultValue: '6478952324',
    );
    return 'https://apps.apple.com/app/id$appId';
  }

  /// Official legal contact email.
  static String get legalEmail => 'legal@$_appDomain';

  /// Official support email.
  static String get supportEmail => 'contact@$_appDomain';

  /// Required Terms of Service version.
  static String get termsVersion => static_content.termsVersion;

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
      final decoded = utf8
          .decode(base64.decode(base64.normalize(trimmed)))
          .trim();

      // For URLs, we strip trailing slashes to ensure path joining works consistently
      if (decoded.startsWith('http')) {
        var result = decoded;
        while (result.endsWith('/')) {
          result = result.substring(0, result.length - 1);
        }
        return result;
      }

      return decoded;
    } on Object {
      if (!AppSecrets.isDev) {
        assert(false, 'AppConfig._d: value appears to be unencoded: $encoded');
      }
      // Return the raw string as fallback if it's not actually base64
      // This allows migration and reduces breakage for unencoded dev strings
      final fallback = encoded.trim();
      if (fallback.startsWith('http')) {
        var result = fallback;
        while (result.endsWith('/')) {
          result = result.substring(0, result.length - 1);
        }
        return result;
      }
      return fallback;
    }
  }
}
