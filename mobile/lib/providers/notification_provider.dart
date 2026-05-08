import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AppNotification {
  final int id;
  final String title;
  final String description;
  final String createdAt;
  final String? topic;
  final bool isRead;

  const AppNotification({
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
      createdAt: json['created_at'] as String,
      topic: json['topic'] as String?,
      isRead: json['is_read'] as bool? ?? false,
    );
  }
}

class NotificationsState {
  final List<AppNotification> actionNotifications;
  final List<AppNotification> regularNotifications;
  final int unreadCount;
  final bool hasNextPage;

  const NotificationsState({
    required this.actionNotifications,
    required this.regularNotifications,
    required this.unreadCount,
    this.hasNextPage = false,
  });

  factory NotificationsState.empty() => const NotificationsState(
        actionNotifications: [],
        regularNotifications: [],
        unreadCount: 0,
      );

  List<AppNotification> get allNotifications =>
      [...actionNotifications, ...regularNotifications];
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationsState>(
  NotificationsNotifier.new,
);

class NotificationsNotifier extends AsyncNotifier<NotificationsState> {
  int _currentPage = 0;
  static const _pageSize = 20;

  @override
  Future<NotificationsState> build() async {
    return _fetchInitialData();
  }

  Future<NotificationsState> _fetchInitialData() async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return NotificationsState.empty();

    // 1 & 2. Fetch ALL Unread Conflicts and First Page of General Feed in parallel
    final results = await Future.wait([
      supabase
          .from('notification')
          .select()
          .eq('auth_user_id', userId)
          .ilike('topic', '%conflict%')
          .eq('is_read', false)
          .order('created_at', ascending: false),
      supabase
          .from('notification')
          .select()
          .eq('auth_user_id', userId)
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1),
    ]);

    final actionNotifications = (results[0] as List)
        .map((n) => AppNotification.fromJson(n))
        .toList();

    final feedNotifications = (results[1] as List)
        .map((n) => AppNotification.fromJson(n))
        .toList();

    // Deduplicate: Remove actions from the regular feed
    final actionIds = actionNotifications.map((n) => n.id).toSet();
    final regularNotifications =
        feedNotifications.where((n) => !actionIds.contains(n.id)).toList();

    // 3. Fetch Total Unread Count (Web Parity: accurate total even beyond first page)
    final unreadCountRes = await supabase
        .from('notification')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('is_read', false);
    final unreadCount = (unreadCountRes as List).length;

    _currentPage = 0;

    return NotificationsState(
      actionNotifications: actionNotifications,
      regularNotifications: regularNotifications,
      unreadCount: unreadCount,
      hasNextPage: feedNotifications.length == _pageSize,
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

    final List<AppNotification> newFeedItems =
        (response as List).map((n) => AppNotification.fromJson(n)).toList();

    final current = state.value!;
    final actionIds = current.actionNotifications.map((n) => n.id).toSet();

    // Filter out actions and existing regular items
    final existingRegularIds =
        current.regularNotifications.map((n) => n.id).toSet();
    final filteredNewItems = newFeedItems
        .where(
          (n) => !actionIds.contains(n.id) && !existingRegularIds.contains(n.id),
        )
        .toList();

    return NotificationsState(
      actionNotifications: current.actionNotifications,
      regularNotifications: [
        ...current.regularNotifications,
        ...filteredNewItems
      ],
      unreadCount: current.unreadCount,
      hasNextPage: newFeedItems.length == _pageSize,
    );
  }

  Future<void> fetchNextPage() async {
    final current = state.value;
    if (current == null || !current.hasNextPage) return;

    _currentPage++;
    // We don't set state to loading to avoid full-screen spinner.
    final nextState = await _fetchNextPage(page: _currentPage);
    state = AsyncValue.data(nextState);
  }

  Future<void> toggleRead(int id, bool wasRead) async {
    final previousState = state.value;
    if (previousState == null) return;

    final newIsRead = !wasRead;

    // 1. Update in actionNotifications
    final List<AppNotification> updatedActions = [];
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
    final List<AppNotification> updatedRegular = [];
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
        if (!newIsRead && (n.topic?.toLowerCase().contains('conflict') ?? false)) {
          movedToAction = updated;
        } else {
          updatedRegular.add(updated);
        }
      } else {
        updatedRegular.add(n);
      }
    }

    if (movedToAction != null) {
      updatedActions.insert(0, movedToAction);
      updatedActions.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    if (movedToRegular != null) {
      updatedRegular.insert(0, movedToRegular);
      // Re-sort regular by date if needed, but inserting at 0 is fine for now
      updatedRegular.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    final unreadChange = wasRead ? 1 : -1;
    state = AsyncValue.data(NotificationsState(
      actionNotifications: updatedActions,
      regularNotifications: updatedRegular,
      unreadCount: previousState.unreadCount + unreadChange,
      hasNextPage: previousState.hasNextPage,
    ));

    try {
      final supabase = Supabase.instance.client;
      await supabase
          .from('notification')
          .update({'is_read': newIsRead}).eq('id', id);
    } catch (e) {
      state = AsyncValue.data(previousState);
      rethrow;
    }
  }

  Future<void> markAllAsRead() async {
    final previousState = state.value;
    if (previousState == null) return;

    // Move all unread actions to regular notifications as read
    final List<AppNotification> readActions = previousState.actionNotifications
        .map((n) => AppNotification(
              id: n.id,
              title: n.title,
              description: n.description,
              createdAt: n.createdAt,
              topic: n.topic,
              isRead: true,
            ))
        .toList();

    final List<AppNotification> readRegular = previousState.regularNotifications
        .map((n) => AppNotification(
              id: n.id,
              title: n.title,
              description: n.description,
              createdAt: n.createdAt,
              topic: n.topic,
              isRead: true,
            ))
        .toList();

    final allReadRegular = [...readActions, ...readRegular];
    allReadRegular.sort((a, b) => b.createdAt.compareTo(a.createdAt));

    state = AsyncValue.data(NotificationsState(
      actionNotifications: [],
      regularNotifications: allReadRegular,
      unreadCount: 0,
      hasNextPage: previousState.hasNextPage,
    ));

    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return;

      await supabase
          .from('notification')
          .update({'is_read': true})
          .eq('auth_user_id', userId)
          .eq('is_read', false);
    } catch (e) {
      state = AsyncValue.data(previousState);
      rethrow;
    }
  }
}
