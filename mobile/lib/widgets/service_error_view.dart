import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class ServiceErrorView extends StatelessWidget {
  final String title;
  final String description;
  final VoidCallback? onRetry;
  final bool showHome;
  final Object? error;
  final bool isError;

  const ServiceErrorView({
    super.key,
    this.title = 'Service Unavailable',
    this.description = 'Please try again in a few moments.',
    this.onRetry,
    this.showHome = true,
    this.error,
    this.isError = false,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
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
              const SizedBox(height: 20),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 12,
                children: [
                  FilledButton.icon(
                    onPressed: onRetry ?? () => context.go('/'),
                    icon: const Icon(LucideIcons.refreshCcw, size: 16),
                    label: const Text('Retry'),
                  ),
                  if (showHome)
                    OutlinedButton.icon(
                      onPressed: () => context.go('/'),
                      icon: const Icon(LucideIcons.home, size: 16),
                      label: const Text('Home'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
