import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class TransparencyBadge extends StatelessWidget {
  final VoidCallback? onTap;
  final bool expanded;

  const TransparencyBadge({super.key, this.onTap, this.expanded = false});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final accent =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).colorScheme.surface;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = Theme.of(context).colorScheme.onSecondary;

    final content = AnimatedContainer(
      duration: 220.ms,
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.symmetric(
        horizontal: expanded ? 22 : 20,
        vertical: expanded ? 10 : 9,
      ),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            accent.withValues(alpha: 0.18),
            accent.withValues(alpha: 0.06),
            bg.withValues(alpha: 0.96),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.12),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(LucideIcons.shieldCheck, size: 16, color: accent),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Build transparency',
                  style: GoogleFonts.manrope(
                    fontSize: expanded ? 14 : 13,
                    fontWeight: FontWeight.w800,
                    color: onSurface,
                    height: 1.1,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (expanded) ...[
                  const SizedBox(height: 3),
                  Text(
                    'Signed APK · SBOM · provenance',
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: muted.withValues(alpha: 0.9),
                      height: 1.2,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 12),
            Icon(LucideIcons.arrowRight, size: 16, color: accent),
          ],
        ],
      ),
    );

    final child = expanded
        ? content
        : ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 280, maxWidth: 360),
            child: content,
          );

    if (onTap == null) return child;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: child,
      ),
    );
  }
}
