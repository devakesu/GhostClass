import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/config/app_secrets.dart';

void main() {
  group('AppSecrets', () {
    test('properties access correctly', () {
      expect(AppSecrets.isDev, isA<bool>());
      expect(AppSecrets.supabaseUrlDev, isNotEmpty);
      expect(AppSecrets.supabasePublishableKeyDev, isNotEmpty);
      expect(AppSecrets.supabaseProxyUrlProd, isNotEmpty);
      expect(AppSecrets.supabasePublishableKeyProd, isNotEmpty);
      expect(AppSecrets.sentryDsn, isNotEmpty);
      expect(AppSecrets.ghostclassApiUrlDev, isNotNull);
      expect(AppSecrets.ghostclassApiUrlProd, isNotEmpty);
      expect(AppSecrets.ezygoAuthUrl, isNotEmpty);
      expect(AppSecrets.ezygoApiRoot, isNotEmpty);
      expect(AppSecrets.ezygoOrigin, isNotEmpty);
    });
  });

  group('AppConfig', () {
    test('Supabase configs return non-empty decoded values', () {
      expect(AppConfig.supabaseUrl, isNotEmpty);
      expect(AppConfig.supabasePublishableKey.value, isNotEmpty);
      expect(AppConfig.webUrl, isNotEmpty);
      expect(AppConfig.supabaseOrigin, isNotEmpty);
    });

    test('Backend & Bridge configs return valid URLs', () {
      expect(AppConfig.ghostclassApiUrl, isNotEmpty);
      expect(AppConfig.ezygoAuthUrl, isNotEmpty);
      expect(AppConfig.ezygoApiRoot, isNotEmpty);
      expect(AppConfig.ezygoOrigin, isNotEmpty);
    });

    test('Sentry config returns valid DSN and Project Number', () {
      expect(AppConfig.sentryDsn, isNotEmpty);
      expect(AppConfig.firebaseCloudProjectNumber, isNotEmpty);
    });

    test('Metadata properties map standard strings safely', () {
      expect(AppConfig.appVersion, isNotEmpty);
      expect(AppConfig.appCommitSha, isNotEmpty);
      expect(AppConfig.buildTimestamp, isNotEmpty);
      expect(AppConfig.githubRunId, isNotEmpty);
      expect(AppConfig.githubRunNumber, isNotEmpty);
      expect(AppConfig.isReleaseBuild, isA<bool>());
      expect(AppConfig.legalEffectiveDate, isNotEmpty);
      expect(AppConfig.authorName, isNotEmpty);
      expect(AppConfig.authorUrl, isNotEmpty);
      expect(AppConfig.githubUrl, isNotEmpty);
      expect(AppConfig.creditsUrl, isNotEmpty);
      expect(AppConfig.donateUrl, isNotEmpty);
      expect(AppConfig.appName, isNotEmpty);
      expect(AppConfig.playStoreUrl, isNotEmpty);
      expect(AppConfig.legalEmail, isNotEmpty);
      expect(AppConfig.supportEmail, isNotEmpty);
      expect(AppConfig.governingLawRegion, isNotEmpty);
      expect(AppConfig.governingLawSpecific, isNotEmpty);
      expect(AppConfig.termsVersion, isNotEmpty);
      expect(AppConfig.syncLoadingMessage, isNotEmpty);
    });
  });
}
