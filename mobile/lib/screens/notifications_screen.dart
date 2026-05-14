import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';

// The exact Riverpod 3.x auto-dispose future provider type is an internal
// generic that cannot be named explicitly in consumer code.
// ignore: specify_nonobvious_property_types
final notificationPermissionProvider = FutureProvider.autoDispose<bool>((
  ref,
) async {
  try {
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.denied;
  } on Object {
    return false;
  }
});

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen>
    with WidgetsBindingObserver {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-check permission as soon as the user returns from the Settings screen.
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(notificationPermissionProvider);
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      final notifier = ref.read(notificationsProvider.notifier);
      final state = ref.read(notificationsProvider).value;
      if (state != null &&
          state.hasNextPage &&
          !ref.read(notificationsProvider).isLoading) {
        final _ = notifier.fetchNextPage();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final notificationsAsync = ref.watch(notificationsProvider);
    final permissionAsync = ref.watch(notificationPermissionProvider);
    final isDenied = permissionAsync.when(
      data: (v) => v,
      loading: () => false,
      error: (_, e) => false,
    );

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Notifications',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        actions: [
          if (isDenied)
            const Tooltip(
              message: 'Push notifications are disabled',
              child: _DeniedBellButton(),
            ),
          notificationsAsync.whenData((data) {
                if (data.unreadCount > 0) {
                  return IconButton(
                    icon: const Icon(LucideIcons.checkCheck),
                    onPressed: () {
                      final _ = showDialog<void>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: Text(
                            'Mark all as read?',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          content: const Text(
                            'This will mark all current notifications as read.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Cancel'),
                            ),
                            TextButton(
                              onPressed: () {
                                final _ = ref
                                    .read(notificationsProvider.notifier)
                                    .markAllAsRead();
                                Navigator.pop(context);
                                ServiceToast.show(
                                  context,
                                  'All notifications marked as read',
                                );
                              },
                              child: const Text('Mark all read'),
                            ),
                          ],
                        ),
                      );
                    },
                    tooltip: 'Mark all as read',
                  );
                }
                return const SizedBox.shrink();
              }).value ??
              const SizedBox.shrink(),
        ],
      ),
      body: Column(
        children: [
          if (isDenied) const _PermissionBanner(),
          Expanded(
            child: notificationsAsync.when(
              data: (data) => ServiceRefreshIndicator(
                onRefresh: () => ref.refresh(notificationsProvider.future),
                child: _buildList(context, ref, data),
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, stack) => Center(child: Text(error.toString())),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    WidgetRef ref,
    NotificationsState data,
  ) {
    if (data.allNotifications.isEmpty) {
      return ListView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.2),
          Center(
            child: Column(
              children: [
                Icon(
                  LucideIcons.bellOff,
                  size: 64,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.2),
                ),
                const SizedBox(height: 16),
                const Text('All caught up!'),
                Text(
                  'You have no new notifications.',
                  style: TextStyle(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    final unreadConflicts = data.actionNotifications
        .where((n) => !n.isRead)
        .toList();
    final unreadRegular = data.regularNotifications
        .where((n) => !n.isRead)
        .toList();
    final readNotifications = data.allNotifications
        .where((n) => n.isRead)
        .toList();

    // Sorting: Newest first within each group
    int compareNotifications(AppNotification a, AppNotification b) {
      return b.createdAt.compareTo(a.createdAt);
    }

    unreadConflicts.sort(compareNotifications);
    unreadRegular.sort(compareNotifications);
    readNotifications.sort(compareNotifications);

    return ListView(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      children: [
        if (unreadConflicts.isNotEmpty) ...[
          _buildSectionHeader(context, 'ACTION REQUIRED', Colors.amber),
          const SizedBox(height: 12),
          ...unreadConflicts.map(
            (n) => _NotificationCard(
              notification: n,
              key: ValueKey('notif_${n.id}_${n.isRead}'),
            ),
          ),
          const SizedBox(height: 24),
        ],
        if (unreadRegular.isNotEmpty) ...[
          _buildSectionHeader(context, 'UNREAD', Colors.blue),
          const SizedBox(height: 12),
          ...unreadRegular.map(
            (n) => _NotificationCard(
              notification: n,
              key: ValueKey('notif_${n.id}_${n.isRead}'),
            ),
          ),
          const SizedBox(height: 24),
        ],
        if (readNotifications.isNotEmpty) ...[
          _buildSectionHeader(context, 'EARLIER', Colors.grey),
          const SizedBox(height: 12),
          ...readNotifications.map(
            (n) => _NotificationCard(
              notification: n,
              key: ValueKey('notif_${n.id}_${n.isRead}'),
            ),
          ),
        ],
        if (data.hasNextPage)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
      ],
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title, Color color) {
    return Row(
      children: [
        if (title == 'ACTION REQUIRED')
          Icon(LucideIcons.alertCircle, size: 14, color: color),
        if (title == 'ACTION REQUIRED') const SizedBox(width: 8),
        Text(
          title,
          style: GoogleFonts.manrope(
            fontSize: 11,
            fontWeight: FontWeight.w900,
            color: color.withValues(alpha: 0.8),
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }
}

/// Amber bell-off AppBar icon that opens app settings.
/// Extracted into its own const-constructible widget so the
/// enclosing [Tooltip] can itself be const.
class _DeniedBellButton extends StatelessWidget {
  const _DeniedBellButton();

  @override
  Widget build(BuildContext context) {
    return const IconButton(
      icon: Icon(LucideIcons.bellOff),
      color: Colors.amber,
      onPressed: openAppSettings,
    );
  }
}

/// Banner shown at the top of the notifications screen when push
/// notification permission has been denied by the user. Tapping it
/// routes directly to the device's app-settings page.
class _PermissionBanner extends StatelessWidget {
  const _PermissionBanner();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: openAppSettings,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.amber.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Colors.amber.withValues(alpha: 0.25),
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                LucideIcons.bellOff,
                size: 18,
                color: Colors.amber,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Notifications are paused',
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.amber.shade700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Tap to enable push notifications in Settings.',
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: Colors.amber.shade600,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              LucideIcons.arrowRight,
              size: 16,
              color: Colors.amber.withValues(alpha: 0.6),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.1);
  }
}

class _NotificationCard extends ConsumerWidget {
  const _NotificationCard({required this.notification, super.key});
  final AppNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isRead = notification.isRead;
    final topic = notification.topic?.toLowerCase() ?? '';

    var icon = LucideIcons.info;
    var iconColor = Theme.of(context).colorScheme.primary;
    if (topic.contains('sync')) {
      icon = LucideIcons.refreshCcw;
      iconColor = Colors.green;
    } else if (topic.contains('conflict')) {
      icon = LucideIcons.alertTriangle;
      iconColor = Colors.amber;
    } else if (topic.contains('attendance')) {
      icon = LucideIcons.calendarClock;
      iconColor = Colors.blue;
    }

    return InkWell(
      onTap: () {
        final _ = ref
            .read(notificationsProvider.notifier)
            .toggleRead(notification.id, wasRead: isRead);
        ServiceToast.show(
          context,
          isRead ? 'Marked as unread' : 'Marked as read',
          duration: const Duration(seconds: 2),
        );
      },
      borderRadius: BorderRadius.circular(20),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isRead
              ? Colors.transparent
              : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isRead
                ? Colors.transparent
                : Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.1),
          ),
          boxShadow: isRead
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.02),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isRead)
              Container(
                margin: const EdgeInsets.only(right: 12, top: 12),
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                ),
              ),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          notification.title,
                          style: GoogleFonts.manrope(
                            fontSize: 14,
                            fontWeight: isRead
                                ? FontWeight.w600
                                : FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface
                                .withValues(alpha: isRead ? 0.6 : 1.0),
                          ),
                        ),
                      ),
                      Text(
                        _formatRelativeTime(notification.createdAt),
                        style: GoogleFonts.manrope(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    notification.description,
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      color: Theme.of(context).colorScheme.onSurface.withValues(
                        alpha: isRead ? 0.4 : 0.6,
                      ),
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05);
  }

  String _formatRelativeTime(String dateString) {
    try {
      final date = DateTime.parse(dateString);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return DateFormat('MMM d').format(date);
    } on Object {
      return '';
    }
  }
}
