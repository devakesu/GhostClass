import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class HeaderSection extends StatelessWidget {
  final DashboardData data;

  const HeaderSection({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<GhostColors>();
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Dashboard',
                  style: GoogleFonts.manrope(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const _NotificationBell(),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${data.selectedSemester.toUpperCase()} · ${data.selectedYear}',
              style: TextStyle(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            if (colors?.brandPrimary != null) ...[
              const SizedBox(height: 12),
              Container(
                height: 4,
                width: 88,
                decoration: BoxDecoration(
                  color: colors!.brandPrimary,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NotificationBell extends ConsumerWidget {
  const _NotificationBell();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationsProvider);
    
    return IconButton(
      onPressed: () => context.push('/notifications'),
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(LucideIcons.bell, size: 24),
          notificationsAsync.whenData((data) {
            if (data.unreadCount > 0) {
              return Positioned(
                right: -2,
                top: -2,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      width: 2,
                    ),
                  ),
                  constraints: const BoxConstraints(
                    minWidth: 16,
                    minHeight: 16,
                  ),
                  child: Center(
                    child: Text(
                      data.unreadCount > 9 ? '9+' : data.unreadCount.toString(),
                      style: GoogleFonts.manrope(
                        color: Theme.of(context).colorScheme.onPrimary,
                        fontSize: 8,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
              );
            }
            return const SizedBox.shrink();
          }).value ?? const SizedBox.shrink(),
        ],
      ),
    );
  }
}
