import 'package:flutter_riverpod/flutter_riverpod.dart';

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
}

class NotificationsState {
  final List<AppNotification> notifications;
  final int unreadCount;

  const NotificationsState({
    required this.notifications,
    required this.unreadCount,
  });

  factory NotificationsState.empty() =>
      const NotificationsState(notifications: [], unreadCount: 0);

  List<AppNotification> get actionNotifications => notifications
      .where((item) => item.topic?.contains('action') ?? false)
      .toList();

  List<AppNotification> get regularNotifications => notifications
      .where((item) => !(item.topic?.contains('action') ?? false))
      .toList();
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationsState>(
      NotificationsNotifier.new,
    );

class NotificationsNotifier extends AsyncNotifier<NotificationsState> {
  @override
  Future<NotificationsState> build() async => NotificationsState.empty();

  Future<void> markAsRead(int id) async {}

  Future<void> markAllAsRead() async {}

  Future<void> fetchNextPage() async {}
}
