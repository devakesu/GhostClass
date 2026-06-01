import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AppNotification {
  AppNotification({
    required this.id,
    required this.title,
    required this.description,
    required this.createdAt,
    this.topic,
    this.isRead = false,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as int,
      title: json['title'] as String? ?? 'Notification',
      description: json['description'] as String? ?? '',
      createdAt: DateTime.parse(json['created_at'] as String),
      topic: json['topic'] as String?,
      isRead: json['is_read'] as bool? ?? false,
    );
  }
  final int id;
  final String title;
  final String description;
  final DateTime createdAt;
  final String? topic;
  final bool isRead;
}

class NotificationsState {
  const NotificationsState({
    required this.actionNotifications,
    required this.regularNotifications,
    required this.unreadCount,
    this.hasNextPage = false,
    this.isFetchingNextPage = false,
  });

  factory NotificationsState.empty() => const NotificationsState(
    actionNotifications: [],
    regularNotifications: [],
    unreadCount: 0,
  );
  final List<AppNotification> actionNotifications;
  final List<AppNotification> regularNotifications;
  final int unreadCount;
  final bool hasNextPage;
  final bool isFetchingNextPage;

  List<AppNotification> get allNotifications => [
    ...actionNotifications,
    ...regularNotifications,
  ];

  NotificationsState copyWith({
    List<AppNotification>? actionNotifications,
    List<AppNotification>? regularNotifications,
    int? unreadCount,
    bool? hasNextPage,
    bool? isFetchingNextPage,
  }) {
    return NotificationsState(
      actionNotifications: actionNotifications ?? this.actionNotifications,
      regularNotifications: regularNotifications ?? this.regularNotifications,
      unreadCount: unreadCount ?? this.unreadCount,
      hasNextPage: hasNextPage ?? this.hasNextPage,
      isFetchingNextPage: isFetchingNextPage ?? this.isFetchingNextPage,
    );
  }
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationsState>(
      NotificationsNotifier.new,
    );

class NotificationsNotifier extends AsyncNotifier<NotificationsState> {
  int _currentPage = 0;
  static const _pageSize = 20;
  final _toggleReadInFlight = <int>{};
  String? _lastUserId;

  @override
  Future<NotificationsState> build() async {
    final user = ref.watch(authProvider).value;
    if (user == null) {
      _lastUserId = null;
      return NotificationsState.empty();
    }

    if (_lastUserId == user.supabaseUserId && state.hasValue) {
      return state.value!;
    }

    _lastUserId = user.supabaseUserId;
    return _fetchInitialData(user.supabaseUserId);
  }

  Future<NotificationsState> _fetchInitialData(String userId) async {
    final supabase = Supabase.instance.client;

    // 1. Fetch ALL Unread Notifications (both conflicts and regular)
    // This ensures the unread count matches the visible unread items.
    final results = await Future.wait([
      supabase
          .from('notification')
          .select()
          .eq('auth_user_id', userId)
          .eq('is_read', false)
          .order('created_at', ascending: false),
      // 2. Fetch first page of General Feed for "EARLIER" section
      supabase
          .from('notification')
          .select()
          .eq('auth_user_id', userId)
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1),
    ]);

    final allUnread = (results[0] as List)
        .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
        .toList();

    final feedItems = (results[1] as List)
        .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
        .toList();

    // Separate unread into Actions (Conflicts) and Regular
    final actionNotifications = allUnread
        .where((n) => n.topic?.toLowerCase().contains('conflict') ?? false)
        .toList();

    final unreadRegular = allUnread
        .where((n) => !(n.topic?.toLowerCase().contains('conflict') ?? false))
        .toList();

    // Deduplicate: regularNotifications = unreadRegular + (read notifications from feed)
    // Exclude conflict-topic items from the regular feed even if they've been read,
    // to prevent them reappearing in the wrong section after a data refresh.
    final unreadIds = allUnread.map((n) => n.id).toSet();
    final readFromFeed = feedItems
        .where(
          (n) =>
              !unreadIds.contains(n.id) &&
              !(n.topic?.toLowerCase().contains('conflict') ?? false),
        )
        .toList();

    final regularNotifications = [...unreadRegular, ...readFromFeed];

    _currentPage = 0;

    return NotificationsState(
      actionNotifications: actionNotifications,
      regularNotifications: regularNotifications,
      unreadCount: allUnread.length,
      hasNextPage: feedItems.length == _pageSize,
    );
  }

  Future<NotificationsState> _fetchNextPage({required int page}) async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return state.value ?? NotificationsState.empty();

    final from = page * _pageSize;
    final to = from + _pageSize - 1;

    final response = await supabase
        .from('notification')
        .select()
        .eq('auth_user_id', userId)
        .order('created_at', ascending: false)
        .range(from, to);

    final newFeedItems = (response as List)
        .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
        .toList();

    // Use null-safe access instead of force-unwrap: although fetchNextPage()
    // guards on current != null, state is async and could theoretically
    // transition to null between the guard and this private call.
    final current = state.value;
    if (current == null) return NotificationsState.empty();
    final actionIds = current.actionNotifications.map((n) => n.id).toSet();

    // Filter out actions and existing regular items
    final existingRegularIds = current.regularNotifications
        .map((n) => n.id)
        .toSet();
    final filteredNewItems = newFeedItems
        .where(
          (n) =>
              !actionIds.contains(n.id) && !existingRegularIds.contains(n.id),
        )
        .toList();

    return NotificationsState(
      actionNotifications: current.actionNotifications,
      regularNotifications: [
        ...current.regularNotifications,
        ...filteredNewItems,
      ],
      unreadCount: current.unreadCount,
      hasNextPage: newFeedItems.length == _pageSize,
    );
  }

  Future<void> fetchNextPage() async {
    final current = state.value;
    if (current == null || !current.hasNextPage || current.isFetchingNextPage) {
      return;
    }

    state = AsyncValue.data(current.copyWith(isFetchingNextPage: true));
    final page = _currentPage + 1;
    try {
      final nextState = await _fetchNextPage(page: page);
      if (!ref.mounted) return;
      _currentPage = page;
      state = AsyncValue.data(nextState.copyWith(isFetchingNextPage: false));
    } finally {
      if (ref.mounted && (state.value?.isFetchingNextPage ?? false)) {
        final latest = state.value ?? current;
        state = AsyncValue.data(latest.copyWith(isFetchingNextPage: false));
      }
    }
  }

  Future<void> toggleRead(int id, {required bool wasRead}) async {
    if (_toggleReadInFlight.contains(id)) return;
    _toggleReadInFlight.add(id);

    try {
      final previousState = state.value;
      if (previousState == null) return;

      final newIsRead = !wasRead;

      // 1. Update in actionNotifications
      final updatedActions = <AppNotification>[];
      AppNotification? movedToRegular;

      for (final n in previousState.actionNotifications) {
        if (n.id == id) {
          final updated = AppNotification(
            id: n.id,
            title: n.title,
            description: n.description,
            createdAt: n.createdAt,
            topic: n.topic,
            isRead: newIsRead,
          );
          if (newIsRead) {
            movedToRegular = updated;
          } else {
            updatedActions.add(updated);
          }
        } else {
          updatedActions.add(n);
        }
      }

      // 2. Update in regularNotifications
      final updatedRegular = <AppNotification>[];
      AppNotification? movedToAction;

      for (final n in previousState.regularNotifications) {
        if (n.id == id) {
          final updated = AppNotification(
            id: n.id,
            title: n.title,
            description: n.description,
            createdAt: n.createdAt,
            topic: n.topic,
            isRead: newIsRead,
          );

          // If a conflict is marked as UNREAD, it must move back to actionNotifications
          if (!newIsRead &&
              (n.topic?.toLowerCase().contains('conflict') ?? false)) {
            movedToAction = updated;
          } else {
            updatedRegular.add(updated);
          }
        } else {
          updatedRegular.add(n);
        }
      }

      if (movedToAction != null) {
        updatedActions
          ..insert(0, movedToAction)
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      }

      if (movedToRegular != null) {
        updatedRegular
          ..insert(0, movedToRegular)
          // Re-sort regular by date if needed, but inserting at 0 is fine for now
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      }

      final unreadChange = wasRead ? 1 : -1;
      state = AsyncValue.data(
        NotificationsState(
          actionNotifications: updatedActions,
          regularNotifications: updatedRegular,
          unreadCount: previousState.unreadCount + unreadChange,
          hasNextPage: previousState.hasNextPage,
        ),
      );

      try {
        final supabase = Supabase.instance.client;
        await supabase
            .from('notification')
            .update({'is_read': newIsRead})
            .eq('id', id);
      } on Object catch (_) {
        state = AsyncValue.data(previousState);
        rethrow;
      }
    } finally {
      _toggleReadInFlight.remove(id);
    }
  }

  Future<void> markAllAsRead() async {
    final snapshotBeforeUpdate = state.value;
    if (snapshotBeforeUpdate == null) return;

    // Move all unread actions to regular notifications as read
    final readActions = snapshotBeforeUpdate.actionNotifications
        .map(
          (n) => AppNotification(
            id: n.id,
            title: n.title,
            description: n.description,
            createdAt: n.createdAt,
            topic: n.topic,
            isRead: true,
          ),
        )
        .toList();

    final readRegular = snapshotBeforeUpdate.regularNotifications
        .map(
          (n) => AppNotification(
            id: n.id,
            title: n.title,
            description: n.description,
            createdAt: n.createdAt,
            topic: n.topic,
            isRead: true,
          ),
        )
        .toList();

    final allReadRegular = [...readActions, ...readRegular]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    final optimisticState = NotificationsState(
      actionNotifications: [],
      regularNotifications: allReadRegular,
      unreadCount: 0,
      hasNextPage: snapshotBeforeUpdate.hasNextPage,
    );

    state = AsyncValue.data(optimisticState);

    try {
      final supabase = Supabase.instance.client;
      final userId =
          ref.read(authProvider).value?.supabaseUserId ??
          supabase.auth.currentUser?.id;
      if (userId == null) {
        // If there's no authenticated user, treat this as an error so callers/tests
        // observing failure semantics can react accordingly instead of silently
        // returning and leaving optimistic state applied.
        throw Exception('No authenticated user for markAllAsRead');
      }

      await supabase
          .from('notification')
          .update({'is_read': true})
          .eq('auth_user_id', userId)
          .eq('is_read', false);
    } on Object catch (_) {
      final currentState = state.value;
      if (currentState == null || currentState == optimisticState) {
        state = AsyncValue.data(snapshotBeforeUpdate);
      } else {
        // State mutated concurrently (e.g. fetchNextPage).
        // Revert the read status of notifications that were present in snapshotBeforeUpdate
        // and restore actionNotifications.
        final originalActionIds = snapshotBeforeUpdate.actionNotifications
            .map((n) => n.id)
            .toSet();

        final originalIsRead = {
          for (final n in snapshotBeforeUpdate.allNotifications) n.id: n.isRead,
        };

        final revertedRegular = currentState.regularNotifications
            .where((n) => !originalActionIds.contains(n.id))
            .map((n) {
              final wasRead = originalIsRead[n.id];
              if (wasRead != null) {
                return AppNotification(
                  id: n.id,
                  title: n.title,
                  description: n.description,
                  createdAt: n.createdAt,
                  topic: n.topic,
                  isRead: wasRead,
                );
              }
              return n;
            })
            .toList();

        state = AsyncValue.data(
          NotificationsState(
            actionNotifications: snapshotBeforeUpdate.actionNotifications,
            regularNotifications: revertedRegular,
            unreadCount: snapshotBeforeUpdate.unreadCount,
            hasNextPage: currentState.hasNextPage,
            isFetchingNextPage: currentState.isFetchingNextPage,
          ),
        );
      }
      rethrow;
    }
  }
}
