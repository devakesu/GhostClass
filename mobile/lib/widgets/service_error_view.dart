import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class ServiceErrorView extends ConsumerWidget {
  const ServiceErrorView({
    super.key,
    this.title = 'Connection Error',
    this.description =
        'Ezygo API is not responding properly, either it is down or has been modified. Please try again after some time.\n \n If the issue persists even after significant time, please contact us.',
    this.onRetry,
    this.showHome = true,
    this.error,
  });
  final String title;
  final String description;
  final VoidCallback? onRetry;
  final bool showHome;
  final Object? error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Center(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    LucideIcons.alertTriangle,
                    size: 30,
                    color: Colors.amber,
                  ),
                ).animate().fadeIn().scale(
                  begin: const Offset(0.85, 0.85),
                  end: const Offset(1, 1),
                ),
                const SizedBox(height: 20),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  description,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 24),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton(
                      onPressed: onRetry ?? () => context.go('/'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 12,
                        ),
                        shape: const StadiumBorder(),
                        backgroundColor: Theme.of(context).colorScheme.primary,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(LucideIcons.refreshCcw, size: 16),
                          const SizedBox(width: 8),
                          Text(
                            'Retry',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700,
                              height: 1.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showHome)
                      FilledButton(
                        onPressed: () => context.go('/'),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 12,
                          ),
                          shape: const StadiumBorder(),
                          backgroundColor:
                              Theme.of(
                                context,
                              ).extension<GhostColors>()?.accentBlue ??
                              Colors.blue,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.home, size: 16),
                            const SizedBox(width: 8),
                            Text(
                              'Home',
                              style: GoogleFonts.manrope(
                                fontWeight: FontWeight.w700,
                                height: 1.1,
                              ),
                            ),
                          ],
                        ),
                      ),
                    FilledButton(
                      onPressed: () => SupportHelper.openContactPage(
                        context,
                        subject: title,
                        message:
                            'I am experiencing an issue with the Ezygo API.\n\n'
                            'Context: ${error?.toString() ?? "Unknown Error"}',
                      ),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 12,
                        ),
                        shape: const StadiumBorder(),
                        backgroundColor:
                            Theme.of(
                              context,
                            ).extension<GhostColors>()?.brandPurple ??
                            Colors.purple,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(LucideIcons.messageSquare, size: 16),
                          const SizedBox(width: 8),
                          Text(
                            'Contact Us',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700,
                              height: 1.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () async {
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/');
                  },
                  icon: Icon(
                    LucideIcons.logOut,
                    size: 14,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.4),
                  ),
                  label: Text(
                    'Logout & try again',
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
