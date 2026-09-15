import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_context_service.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class _MockApiService extends Mock implements ApiService {}

class _MockSecureStorageService extends Mock implements SecureStorageService {}

class _MockSupabaseClient extends Mock implements supabase.SupabaseClient {}

class _MockGoTrueClient extends Mock implements supabase.GoTrueClient {}

class _MockSession extends Mock implements supabase.Session {}

final class InvalidationObserver extends ProviderObserver {
  final disposedProviders = <Object>[];

  @override
  void didDisposeProvider(ProviderObserverContext context) {
    disposedProviders.add(context.provider);
    super.didDisposeProvider(context);
  }
}

void main() {
  group('CronSyncResult', () {
    test('parses from JSON correctly', () {
      final json = {
        'success': true,
        'processed': 7,
        'deletions': 2,
        'conflicts': 1,
        'updates': 3,
        'errors': 0,
      };

      final result = CronSyncResult.fromJson(json);

      expect(result.success, true);
      expect(result.processed, 7);
      expect(result.deletions, 2);
      expect(result.conflicts, 1);
      expect(result.updates, 3);
      expect(result.errors, 0);
      expect(result.hasChanges, true);
    });

    test('handles partial sync or error payload with stats', () {
      final json = {
        'success': false,
        'processed': 7,
        'deletions': 0,
        'conflicts': 0,
        'updates': 0,
        'errors': 3,
      };

      final result = CronSyncResult.fromJson(json);

      expect(result.success, false);
      expect(result.processed, 7);
      expect(result.deletions, 0);
      expect(result.conflicts, 0);
      expect(result.updates, 0);
      expect(result.errors, 3);
      expect(result.hasChanges, false);
    });

    test(
      'hasChanges returns true when deletions > 0, updates > 0, or conflicts > 0',
      () {
        const onlyUpdates = CronSyncResult(
          success: true,
          processed: 5,
          deletions: 0,
          conflicts: 2,
          updates: 1,
          errors: 0,
        );
        expect(onlyUpdates.hasChanges, true);

        const onlyDeletions = CronSyncResult(
          success: true,
          processed: 5,
          deletions: 1,
          conflicts: 0,
          updates: 0,
          errors: 0,
        );
        expect(onlyDeletions.hasChanges, true);

        const onlyConflicts = CronSyncResult(
          success: false,
          processed: 5,
          deletions: 0,
          conflicts: 4,
          updates: 0,
          errors: 1,
        );
        expect(onlyConflicts.hasChanges, true);

        const zeroChanges = CronSyncResult(
          success: true,
          processed: 5,
          deletions: 0,
          conflicts: 0,
          updates: 0,
          errors: 0,
        );
        expect(zeroChanges.hasChanges, false);
      },
    );

    test(
      'ApiService.parseSyncResult parses map and returns null for invalid data',
      () {
        final parsed = ApiService.parseSyncResult({
          'success': true,
          'processed': 1,
          'deletions': 0,
          'conflicts': 0,
          'updates': 2,
          'errors': 0,
        });

        expect(parsed, isNotNull);
        expect(parsed!.updates, 2);
        expect(parsed.hasChanges, true);

        expect(ApiService.parseSyncResult('not a map'), isNull);
        expect(ApiService.parseSyncResult(null), isNull);
      },
    );
  });

  group('Academic Year & Semester Normalization', () {
    test(
      'yearsDiffer correctly matches same academic years in different formats',
      () {
        // 2025-2026 vs 25-26 should NOT be treated as a rollover
        expect(
          ProfileHydrationService.yearsDiffer('2025-2026', '25-26'),
          false,
        );
        expect(
          ProfileHydrationService.yearsDiffer('25-26', '2025-2026'),
          false,
        );
        expect(
          ProfileHydrationService.yearsDiffer('2025-2026', '2025-2026'),
          false,
        );
        expect(ProfileHydrationService.yearsDiffer('2025', '2025'), false);
      },
    );

    test('yearsDiffer flags true for genuine academic rollovers', () {
      expect(
        ProfileHydrationService.yearsDiffer('2024-2025', '2025-2026'),
        true,
      );
      expect(
        ProfileHydrationService.yearsDiffer('2025-2026', '2026-2027'),
        true,
      );
      expect(ProfileHydrationService.yearsDiffer('24-25', '25-26'), true);
      expect(ProfileHydrationService.yearsDiffer('2024', '2025'), true);
    });

    test('semestersDiffer detects semester rollovers accurately', () {
      expect(ProfileHydrationService.semestersDiffer('Odd', 'Odd'), false);
      expect(ProfileHydrationService.semestersDiffer('odd', 'ODD '), false);
      expect(ProfileHydrationService.semestersDiffer('4', '4'), false);
      expect(ProfileHydrationService.semestersDiffer('Odd', 'Even'), true);
      expect(ProfileHydrationService.semestersDiffer('4', '5'), true);
    });
  });

  group('ProfileHydrationService.handleCronSyncResult', () {
    test('invalidates screen providers when hasChanges is true', () {
      final observer = InvalidationObserver();
      final container = ProviderContainer(observers: [observer]);
      addTearDown(container.dispose);

      // Read providers first to activate them
      container
        ..read(notificationsProvider)
        ..read(dashboardProvider)
        ..read(trackingProvider);

      observer.disposedProviders.clear();

      final service = container.read(profileHydrationServiceProvider.notifier);

      // Trigger sync result with updates > 0
      const resultWithChanges = CronSyncResult(
        success: true,
        processed: 10,
        deletions: 0,
        conflicts: 1,
        updates: 2,
        errors: 0,
      );

      service.handleCronSyncResult(resultWithChanges);

      expect(observer.disposedProviders.contains(notificationsProvider), true);
      expect(observer.disposedProviders.contains(dashboardProvider), true);
      expect(observer.disposedProviders.contains(trackingProvider), true);
    });

    test(
      'does NOT invalidate screen providers when deletions == 0 and updates == 0',
      () {
        final observer = InvalidationObserver();
        final container = ProviderContainer(observers: [observer]);
        addTearDown(container.dispose);

        container
          ..read(notificationsProvider)
          ..read(dashboardProvider)
          ..read(trackingProvider);

        observer.disposedProviders.clear();

        final service = container.read(
          profileHydrationServiceProvider.notifier,
        );

        const resultWithoutChanges = CronSyncResult(
          success: false,
          processed: 7,
          deletions: 0,
          conflicts: 0,
          updates: 0,
          errors: 3,
        );

        service.handleCronSyncResult(resultWithoutChanges);

        expect(observer.disposedProviders.isEmpty, true);
      },
    );
  });

  group('AcademicContextService changer flow', () {
    late _MockApiService mockApi;
    late _MockSecureStorageService mockStorage;
    late _MockSupabaseClient mockSupabase;
    late _MockGoTrueClient mockAuth;
    late _MockSession mockSession;

    setUpAll(() {
      registerFallbackValue(
        const AcademicState(semester: 'odd', year: '2024-25'),
      );
      registerFallbackValue(UserSettings.defaults());
      registerFallbackValue(const UserProfile(firstName: 'Fallback'));
      registerFallbackValue(_MockSecureStorageService());
    });

    setUp(() {
      mockApi = _MockApiService();
      mockStorage = _MockSecureStorageService();
      mockSupabase = _MockSupabaseClient();
      mockAuth = _MockGoTrueClient();
      mockSession = _MockSession();

      when(() => mockSupabase.auth).thenReturn(mockAuth);
      when(() => mockAuth.currentSession).thenReturn(mockSession);
      when(() => mockSession.isExpired).thenReturn(false);
      when(() => mockSession.accessToken).thenReturn('test-supabase-token');

      when(() => mockStorage.getAcademicState()).thenAnswer(
        (_) async => const AcademicState(semester: 'even', year: '2024-25'),
      );
      when(() => mockStorage.saveAcademicState(any())).thenAnswer((_) async {});
      when(() => mockStorage.saveSettings(any())).thenAnswer((_) async {});
      when(() => mockStorage.saveUserProfile(any())).thenAnswer((_) async {});
      when(() => mockStorage.saveEzygoToken(any())).thenAnswer((_) async {});
      when(
        () => mockStorage.saveSupabaseUserId(any()),
      ).thenAnswer((_) async {});
      when(() => mockStorage.clearAllCachedData()).thenAnswer((_) async {});

      when(() => mockApi.clearCaches()).thenReturn(null);
    });

    test(
      'updateAcademicContext sets isSyncing: true during execution and saves nextAcademic',
      () async {
        final observer = InvalidationObserver();
        final container = ProviderContainer(
          observers: [observer],
          overrides: [
            apiServiceProvider.overrideWithValue(mockApi),
            secureStorageProvider.overrideWithValue(mockStorage),
            supabaseClientProvider.overrideWithValue(mockSupabase),
          ],
        );
        addTearDown(container.dispose);

        // Warm up providers so observer tracks invalidations
        container
          ..read(academicProvider)
          ..read(dashboardProvider);

        observer.disposedProviders.clear();

        container.read(authProvider.notifier).state = AsyncValue.data(
          AuthenticatedUser(
            supabaseUserId: 'user-1',
            ezygoToken: EncryptedValue.fromPlaintext('token'),
            settings: UserSettings.defaults(),
            profile: const UserProfile(
              firstName: 'Test',
              currentSemester: 'even',
              currentYear: '2024-25',
            ),
          ),
        );

        final yearCompleter = Completer<Response<dynamic>>();
        when(
          () => mockApi.updateAcademicYear(any(), any()),
        ).thenAnswer((_) => yearCompleter.future);
        when(() => mockApi.updateSemester(any(), any())).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: RequestOptions(path: '/semester'),
            statusCode: 200,
          ),
        );
        when(
          () => mockApi.refreshProfile(
            any(),
            sync: any(named: 'sync'),
            force: any(named: 'force'),
          ),
        ).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: RequestOptions(path: '/profile'),
            statusCode: 200,
            data: {
              'current_semester': 'odd',
              'current_year': '2024-25',
            },
          ),
        );

        // Launch update in background
        final updateFuture = container
            .read(academicContextServiceProvider.notifier)
            .updateAcademicContext('odd', '2024-25');

        // Verify that isSyncing is IMMEDIATELY true while operation is in-flight!
        expect(container.read(authProvider).value?.isSyncing, true);

        // Now complete the year update
        yearCompleter.complete(
          Response<dynamic>(
            requestOptions: RequestOptions(path: '/year'),
            statusCode: 200,
          ),
        );

        await updateFuture;

        // Verify isSyncing is restored to false
        expect(container.read(authProvider).value?.isSyncing, false);

        // Verify storage received the saved academic state
        verify(
          () => mockStorage.saveAcademicState(
            const AcademicState(semester: 'odd', year: '2024-25'),
          ),
        ).called(greaterThanOrEqualTo(1));

        // Verify academicProvider updated to new period
        expect(
          container.read(academicProvider).value,
          const AcademicState(semester: 'odd', year: '2024-25'),
        );

        // Verify user profile and settings updated
        final user = container.read(authProvider).value;
        expect(user?.settings.semester, 'odd');
        expect(user?.settings.academicYear, '2024-25');
        expect(user?.profile?.currentSemester, 'odd');
        expect(user?.profile?.currentYear, '2024-25');

        // Verify dashboard screen provider was invalidated
        expect(observer.disposedProviders.contains(dashboardProvider), true);
        // academicProvider is updated via updateState (not re-invalidated) to avoid
        // a double-rebuild that caused stale tracking data bugs. The correct value
        // is already verified at lines 394-397 above.
      },
    );

    test(
      'ProfileHydrationService semestersDiffer normalizes canonical semester representations',
      () {
        expect(ProfileHydrationService.semestersDiffer('odd', '1'), false);
        expect(ProfileHydrationService.semestersDiffer('odd', 'i'), false);
        expect(ProfileHydrationService.semestersDiffer('ODD', 'odd'), false);
        expect(ProfileHydrationService.semestersDiffer('even', '2'), false);
        expect(ProfileHydrationService.semestersDiffer('even', 'ii'), false);
        expect(ProfileHydrationService.semestersDiffer('EVEN', 'even'), false);

        expect(ProfileHydrationService.semestersDiffer('odd', 'even'), true);
        expect(ProfileHydrationService.semestersDiffer('1', '2'), true);
        expect(ProfileHydrationService.semestersDiffer('odd', '2'), true);
        expect(ProfileHydrationService.semestersDiffer('even', '1'), true);

        expect(ProfileHydrationService.semestersDiffer(null, 'odd'), false);
        expect(ProfileHydrationService.semestersDiffer('odd', null), false);
      },
    );
  });
}
