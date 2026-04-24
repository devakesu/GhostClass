import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationsProvider);

    return notificationsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(child: Text(error.toString())),
      data: (data) {
        return ServiceRefreshIndicator(
          onRefresh: () async {
            await ref.read(notificationsProvider.notifier).fetchNextPage();
          },
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(
                'Notifications',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              if (data.notifications.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 48),
                  child: Center(child: Text('No notifications yet.')),
                ),
            ],
          ),
        );
      },
    );
  }
}
