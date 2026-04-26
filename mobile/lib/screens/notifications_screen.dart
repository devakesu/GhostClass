import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_animate/flutter_animate.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationsProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Notifications',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        actions: [
          notificationsAsync.whenData((data) {
            if (data.unreadCount > 0) {
              return IconButton(
                icon: const Icon(LucideIcons.checkCheck),
                onPressed: () => ref.read(notificationsProvider.notifier).markAllAsRead(),
                tooltip: 'Mark all as read',
              );
            }
            return const SizedBox.shrink();
          }).value ?? const SizedBox.shrink(),
        ],
      ),
      body: notificationsAsync.when(
        data: (data) => ServiceRefreshIndicator(
          onRefresh: () async => ref.read(notificationsProvider.notifier).fetchNextPage(),
          child: _buildList(context, ref, data),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text(error.toString())),
      ),
    );
  }

  Widget _buildList(BuildContext context, WidgetRef ref, NotificationsState data) {
    if (data.notifications.isEmpty) {
      return ListView(
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.2),
          Center(
            child: Column(
              children: [
                Icon(LucideIcons.bellOff, size: 64, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2)),
                const SizedBox(height: 16),
                const Text('All caught up!'),
                Text('You have no new notifications.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
              ],
            ),
          ),
        ],
      );
    }

    final actionNotifications = data.actionNotifications;
    final regularNotifications = data.regularNotifications;

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      children: [
        if (actionNotifications.isNotEmpty) ...[
          _buildSectionHeader(context, 'ACTION REQUIRED', Colors.amber),
          const SizedBox(height: 12),
          ...actionNotifications.map((n) => _NotificationCard(notification: n)),
          const SizedBox(height: 24),
        ],
        if (regularNotifications.isNotEmpty) ...[
          _buildSectionHeader(context, 'RECENT ACTIVITY', Colors.grey),
          const SizedBox(height: 12),
          ...regularNotifications.map((n) => _NotificationCard(notification: n)),
        ],
        if (data.hasNextPage)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: TextButton(
                onPressed: () => ref.read(notificationsProvider.notifier).fetchNextPage(),
                child: const Text('Load More'),
              ),
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

class _NotificationCard extends ConsumerWidget {
  final AppNotification notification;

  const _NotificationCard({required this.notification});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isRead = notification.isRead;
    final topic = notification.topic?.toLowerCase() ?? '';
    
    IconData icon = LucideIcons.info;
    Color iconColor = Theme.of(context).colorScheme.primary;
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
      onTap: () => ref.read(notificationsProvider.notifier).toggleRead(notification.id, isRead),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isRead ? Colors.transparent : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isRead 
              ? Colors.transparent 
              : Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1),
          ),
          boxShadow: isRead ? null : [
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
                            fontWeight: isRead ? FontWeight.w600 : FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: isRead ? 0.6 : 1.0),
                          ),
                        ),
                      ),
                      Text(
                        _formatRelativeTime(notification.createdAt),
                        style: GoogleFonts.manrope(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    notification.description,
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: isRead ? 0.4 : 0.6),
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
    } catch (e) {
      return '';
    }
  }
}
