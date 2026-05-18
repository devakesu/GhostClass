import 'package:flutter/material.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class CalendarHeader extends StatelessWidget {
  const CalendarHeader({
    required this.focusedDay,
    required this.canMovePrev,
    required this.canMoveNext,
    required this.onPrevious,
    required this.onNext,
    required this.onToday,
    required this.onDateSelect,
    super.key,
  });
  final DateTime focusedDay;
  final bool canMovePrev;
  final bool canMoveNext;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback? onToday;
  final VoidCallback onDateSelect;

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  button: true,
                  label:
                      'Select Month, currently ${DateFormat('MMMM yyyy').format(focusedDay)}',
                  child: GestureDetector(
                    onTap: onDateSelect,
                    child: Row(
                      children: [
                        Text(
                          DateFormat('MMMM yyyy').format(focusedDay),
                          style: GoogleFonts.manrope(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.onSurface,
                            letterSpacing: -1,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          LucideIcons.calendarDays,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
                if (onToday != null)
                  Semantics(
                    button: true,
                    label: 'Jump to today',
                    child: GestureDetector(
                      onTap: onToday,
                      child: Text(
                        'Jump to Today',
                        style: GoogleFonts.manrope(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: primary,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            Row(
              children: [
                _HeaderNavButton(
                  icon: LucideIcons.chevronLeft,
                  onTap: onPrevious,
                  enabled: canMovePrev,
                ),
                const SizedBox(width: 8),
                _HeaderNavButton(
                  icon: LucideIcons.chevronRight,
                  onTap: onNext,
                  enabled: canMoveNext,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderNavButton extends StatelessWidget {
  const _HeaderNavButton({
    required this.icon,
    required this.onTap,
    required this.enabled,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: icon == LucideIcons.chevronLeft ? 'Previous Month' : 'Next Month',
      enabled: enabled,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: enabled ? 1.0 : 0.3,
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.15),
              ),
            ),
            child: Icon(
              icon,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.85),
              size: 20,
            ),
          ),
        ),
      ),
    );
  }
}
