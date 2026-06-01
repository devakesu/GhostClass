import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class LabelPill extends StatelessWidget {
  const LabelPill({
    required this.label,
    required this.color,
    super.key,
    this.radius = 6.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
  });

  final String label;
  final Color color;
  final double radius;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: Theme.of(context).brightness == Brightness.dark ? 0.15 : 0.1,
        ),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Text(
        label.toUpperCase(),
        style: GoogleFonts.manrope(
          fontSize: 9,
          fontWeight: FontWeight.w900,
          color: color,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class SelectablePill extends StatelessWidget {
  const SelectablePill({
    required this.label,
    required this.count,
    required this.isSelected,
    required this.onTap,
    required this.primary,
    required this.surface,
    super.key,
    this.isDisabled = false,
  });

  final String label;
  final int count;
  final bool isSelected;
  final VoidCallback onTap;
  final Color primary;
  final Color surface;
  final bool isDisabled;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: isDisabled ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? primary : surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? primary.withValues(alpha: isDark ? 0.35 : 0.8)
                : isDisabled
                ? Theme.of(context).colorScheme.outlineVariant.withValues(
                    alpha: isDark ? 0.2 : 0.1,
                  )
                : Theme.of(context).colorScheme.outlineVariant.withValues(
                    alpha: isDark ? 0.25 : 0.35,
                  ),
          ),
          boxShadow: isSelected && !isDark
              ? [
                  BoxShadow(
                    color: primary.withValues(alpha: 0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w700,
                  fontStyle: isDisabled ? FontStyle.italic : FontStyle.normal,
                  color: isSelected
                      ? Colors.white
                      : isDisabled
                      ? Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.3)
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.8),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.white.withValues(alpha: 0.2)
                    : primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                count.toString(),
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: isSelected ? Colors.white : primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
