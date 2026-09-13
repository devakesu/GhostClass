import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';

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
        'conflicts': 12,
        'updates': 0,
        'errors': 3,
      };

      final result = CronSyncResult.fromJson(json);

      expect(result.success, false);
      expect(result.processed, 7);
      expect(result.deletions, 0);
      expect(result.conflicts, 12);
      expect(result.updates, 0);
      expect(result.errors, 3);
      expect(result.hasChanges, false);
    });

    test('hasChanges returns true only when deletions > 0 or updates > 0', () {
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

      const noChangesWithConflicts = CronSyncResult(
        success: false,
        processed: 5,
        deletions: 0,
        conflicts: 4,
        updates: 0,
        errors: 1,
      );
      expect(noChangesWithConflicts.hasChanges, false);

      const zeroChanges = CronSyncResult(
        success: true,
        processed: 5,
        deletions: 0,
        conflicts: 0,
        updates: 0,
        errors: 0,
      );
      expect(zeroChanges.hasChanges, false);
    });

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
      container..read(notificationsProvider)
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

        container..read(notificationsProvider)
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
          conflicts: 12,
          updates: 0,
          errors: 3,
        );

        service.handleCronSyncResult(resultWithoutChanges);

        expect(observer.disposedProviders.isEmpty, true);
      },
    );
  });
}
