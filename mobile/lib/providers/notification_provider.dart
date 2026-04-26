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
  final List<AppNotification> notifications;
  final int unreadCount;
  final bool hasNextPage;

  const NotificationsState({
    required this.notifications,
    required this.unreadCount,
    this.hasNextPage = false,
  });

  factory NotificationsState.empty() =>
      const NotificationsState(notifications: [], unreadCount: 0);

  List<AppNotification> get actionNotifications => notifications
      .where((item) => (item.topic?.contains('conflict') ?? false) && !item.isRead)
      .toList();

  List<AppNotification> get regularNotifications {
    final actionIds = actionNotifications.map((n) => n.id).toSet();
    return notifications.where((n) => !actionIds.contains(n.id)).toList();
  }
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
    return _fetchNotifications(page: 0);
  }

  Future<NotificationsState> _fetchNotifications({required int page}) async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return NotificationsState.empty();

    final from = page * _pageSize;
    final to = from + _pageSize - 1;

    final response = await supabase
        .from('notification')
        .select()
        .eq('auth_user_id', userId)
        .order('created_at', ascending: false)
        .range(from, to);

    final List<AppNotification> newNotifications =
        (response as List).map((n) => AppNotification.fromJson(n)).toList();

    // Fetch unread count
    final countRes = await supabase
        .from('notification')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('is_read', false);
    
    final unreadCount = (countRes as List).length;

    final existingNotifications = page == 0 ? <AppNotification>[] : state.value?.notifications ?? <AppNotification>[];
    final allNotifications = [...existingNotifications, ...newNotifications];

    return NotificationsState(
      notifications: allNotifications,
      unreadCount: unreadCount,
      hasNextPage: newNotifications.length == _pageSize,
    );
  }

  Future<void> fetchNextPage() async {
    if (state.value?.hasNextPage == false) return;
    _currentPage++;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchNotifications(page: _currentPage));
  }

  Future<void> toggleRead(int id, bool currentStatus) async {
    final supabase = Supabase.instance.client;
    await supabase
        .from('notification')
        .update({'is_read': !currentStatus})
        .eq('id', id);
    
    ref.invalidateSelf();
  }

  Future<void> markAllAsRead() async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    await supabase
        .from('notification')
        .update({'is_read': true})
        .eq('auth_user_id', userId)
        .eq('is_read', false);
    
    ref.invalidateSelf();
  }
}
