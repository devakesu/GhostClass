import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DummyAuthNotifier extends AuthNotifier {
  @override
  FutureOr<AuthenticatedUser?> build() {
    return AuthenticatedUser(
      supabaseUserId: 'test-user-id',
      ezygoToken: EncryptedValue.fromPlaintext('token'),
      settings: UserSettings.defaults(),
    );
  }
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    try {
      await Supabase.initialize(
        url: 'https://placeholder-domain.supabase.co',
        publishableKey: 'placeholder-anon-key',
      );
    } on Object catch (_) {
      // already initialized
    }
  });

  ProviderContainer buildContainer() {
    return ProviderContainer(
      overrides: [
        authProvider.overrideWith(DummyAuthNotifier.new),
      ],
    );
  }

  group('NotificationsNotifier - markAllAsRead TOCTOU Revert', () {
    test(
      'reverts directly to snapshotBeforeUpdate if state did not mutate concurrently',
      () async {
        final container = buildContainer();
        addTearDown(container.dispose);

        final notifier = container.read(notificationsProvider.notifier);

        final initialSnapshot = NotificationsState(
          actionNotifications: [
            AppNotification(
              id: 1,
              title: 'Conflict A',
              description: 'Desc A',
              createdAt: DateTime.parse('2026-05-31T10:00:00Z'),
              topic: 'conflict',
            ),
          ],
          regularNotifications: [
            AppNotification(
              id: 2,
              title: 'Regular B',
              description: 'Desc B',
              createdAt: DateTime.parse('2026-05-31T09:00:00Z'),
              topic: 'general',
            ),
          ],
          unreadCount: 2,
          hasNextPage: true,
        );

        notifier.state = AsyncValue.data(initialSnapshot);

        // markAllAsRead will attempt DB call to placeholder domain, which must throw
        await expectLater(
          notifier.markAllAsRead(),
          throwsA(anything),
        );

        // Verify that it reverted back to initialSnapshot exactly
        final finalState = container.read(notificationsProvider).value;
        expect(finalState, isNotNull);
        expect(finalState!.actionNotifications, hasLength(1));
        expect(finalState.regularNotifications, hasLength(1));
        expect(finalState.unreadCount, 2);
        expect(finalState.hasNextPage, true);
      },
    );

    test(
      'reverts by merging if state mutated concurrently during database call',
      () async {
        final container = buildContainer();
        addTearDown(container.dispose);

        final notifier = container.read(notificationsProvider.notifier);

        final initialSnapshot = NotificationsState(
          actionNotifications: [
            AppNotification(
              id: 1,
              title: 'Conflict A',
              description: 'Desc A',
              createdAt: DateTime.parse('2026-05-31T10:00:00Z'),
              topic: 'conflict',
            ),
          ],
          regularNotifications: [
            AppNotification(
              id: 2,
              title: 'Regular B',
              description: 'Desc B',
              createdAt: DateTime.parse('2026-05-31T09:00:00Z'),
              topic: 'general',
            ),
          ],
          unreadCount: 2,
          hasNextPage: true,
        );

        notifier.state = AsyncValue.data(initialSnapshot);

        // Start markAllAsRead
        final markFuture = notifier.markAllAsRead();

        // Simulate a concurrent mutation (e.g. fetchNextPage finished and appended items C and D)
        final mutatedState = NotificationsState(
          actionNotifications: const [],
          regularNotifications: [
            // A and B got marked as read and sorted optimistically
            AppNotification(
              id: 1,
              title: 'Conflict A',
              description: 'Desc A',
              createdAt: DateTime.parse('2026-05-31T10:00:00Z'),
              topic: 'conflict',
              isRead: true,
            ),
            AppNotification(
              id: 2,
              title: 'Regular B',
              description: 'Desc B',
              createdAt: DateTime.parse('2026-05-31T09:00:00Z'),
              topic: 'general',
              isRead: true,
            ),
            // Concurrently appended C (unread) and D (read)
            AppNotification(
              id: 3,
              title: 'Regular C',
              description: 'Desc C',
              createdAt: DateTime.parse('2026-05-31T08:00:00Z'),
              topic: 'general',
            ),
            AppNotification(
              id: 4,
              title: 'Regular D',
              description: 'Desc D',
              createdAt: DateTime.parse('2026-05-31T07:00:00Z'),
              topic: 'general',
              isRead: true,
            ),
          ],
          unreadCount: 0,
        );

        notifier.state = AsyncValue.data(mutatedState);

        // Wait for markAllAsRead to fail and complete
        await expectLater(markFuture, throwsA(anything));

        // Verify the reverted/merged state:
        // - A is restored to actionNotifications as unread.
        // - B is restored to regularNotifications as unread.
        // - C and D remain in regularNotifications with their respective read/unread states.
        // - unreadCount is restored to 2 (initialSnapshot unreadCount).
        // - hasNextPage remains false (from mutatedState).
        final finalState = container.read(notificationsProvider).value;
        expect(finalState, isNotNull);

        // Action notifications restored
        expect(finalState!.actionNotifications, hasLength(1));
        expect(finalState.actionNotifications.first.id, 1);
        expect(finalState.actionNotifications.first.isRead, false);

        // Regular notifications merged
        expect(finalState.regularNotifications, hasLength(3));
        // B (id: 2) is restored to unread
        final b = finalState.regularNotifications.firstWhere((n) => n.id == 2);
        expect(b.isRead, false);

        // C (id: 3) remains in regular
        final c = finalState.regularNotifications.firstWhere((n) => n.id == 3);
        expect(c.isRead, false);

        // D (id: 4) remains in regular
        final d = finalState.regularNotifications.firstWhere((n) => n.id == 4);
        expect(d.isRead, true);

        // A (id: 1) should be filtered out of regular because it is back in actionNotifications
        expect(finalState.regularNotifications.any((n) => n.id == 1), false);

        expect(finalState.unreadCount, 2);
        expect(finalState.hasNextPage, false);
      },
    );
  });
}
