import 'package:flutter/material.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class HeaderBadge extends StatelessWidget {
  final int count;
  const HeaderBadge({super.key, required this.count});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final amber = ghostColors?.accentOrange ?? Colors.orange;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: amber.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: amber.withValues(alpha: 0.45)),
        boxShadow: [
          BoxShadow(
            color: amber.withValues(alpha: 0.05),
            blurRadius: 10,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Text(
        '$count CLASSES',
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          color: amber,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class DeleteAllButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;
  const DeleteAllButton({super.key, required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final danger = ghostColors?.dangerRed ?? Theme.of(context).colorScheme.error;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: danger.withValues(alpha: isDark ? 0.08 : 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: danger.withValues(alpha: 0.45)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.trash2, size: 14, color: danger),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 11,
                color: danger,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
