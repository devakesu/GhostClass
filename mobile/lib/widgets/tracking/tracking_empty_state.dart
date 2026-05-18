import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class EmptyTrackingState extends StatelessWidget {
  const EmptyTrackingState({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.clipboardList,
            size: 64,
            color: Theme.of(context).colorScheme.onSurface.withValues(
              alpha: isDark ? 0.1 : 0.2,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No tracking records found.',
            style: GoogleFonts.manrope(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Mark attendance from Dashboard or Calendar\nto see them here.',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
