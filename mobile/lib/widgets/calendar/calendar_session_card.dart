import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class CalendarEvent {
  const CalendarEvent({
    required this.courseName,
    required this.displaySessionName,
    required this.rawSessionKey,
    required this.status,
    required this.color,
    required this.isCorrection,
    required this.isExtra,
    required this.courseId,
    required this.dbDate,
    required this.isDisabled,
    this.courseCode,
    this.originalStatus,
    this.trackingId,
    this.remarks,
  });
  final String courseName;
  final String? courseCode;
  final String displaySessionName;
  final String rawSessionKey;
  final String status;
  final String? originalStatus;
  final Color color;
  final bool isCorrection;
  final bool isExtra;
  final String courseId;
  final String dbDate;
  final int? trackingId;
  final bool isDisabled;
  final String? remarks;
}

class CalendarSessionCard extends StatelessWidget {
  const CalendarSessionCard({
    required this.event,
    super.key,
    this.onMarkPresent,
    this.onMarkDl,
    this.onDelete,
  });
  final CalendarEvent event;
  final VoidCallback? onMarkPresent;
  final VoidCallback? onMarkDl;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accentColor = event.color;
    final disabledAccent = Theme.of(
      context,
    ).colorScheme.onSurface.withValues(alpha: 0.2);

    final accentBackground = isDark
        ? (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.1)
              : accentColor.withValues(alpha: 0.12))
        : (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.08)
              : accentColor.withValues(alpha: 0.08));

    final accentBorder = isDark
        ? (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.45)
              : accentColor.withValues(alpha: 0.45))
        : (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.7)
              : accentColor.withValues(alpha: 0.7));

    final disabledTextColor = isDark
        ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)
        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.65);

    final displaySessionColor = event.isDisabled
        ? disabledTextColor
        : _getContrastColor(event.color, isDark);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark
            ? accentBackground
            : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accentBorder, width: 1.5),
        boxShadow:
            (event.isDisabled ||
                event.status == 'Absent' ||
                event.status == 'Duty Leave' ||
                event.status == 'Other Leave' ||
                event.status == 'Present')
            ? [
                BoxShadow(
                  color: accentColor.withValues(alpha: 0.08),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      utils.formatSessionName(event.displaySessionName),
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: displaySessionColor,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      event.courseName,
                      style: GoogleFonts.manrope(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: event.isDisabled
                            ? disabledTextColor
                            : Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    if (event.courseCode != null)
                      Text(
                        event.courseCode!.toUpperCase(),
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(
                            alpha: isDark ? 0.6 : 0.65,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: event.color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: event.color.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (event.isDisabled) ...[
                          Icon(
                            LucideIcons.eyeOff,
                            size: 10,
                            color: disabledTextColor,
                          ),
                          const SizedBox(width: 6),
                        ],
                        Text(
                          event.status.toUpperCase(),
                          style: GoogleFonts.manrope(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            color: _getContrastColor(event.color, isDark),
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (event.isCorrection) ...[
                    const SizedBox(height: 6),
                    const _CorrectionTag(),
                  ],
                  if (event.isExtra) ...[
                    const SizedBox(height: 6),
                    const _SelfMarkedTag(),
                  ],
                ],
              ),
            ],
          ),
          if (event.remarks != null && event.remarks!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.02),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                event.remarks!,
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(
                    alpha: isDark ? 0.6 : 0.65,
                  ),
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
          if (!event.isExtra &&
              !event.isCorrection &&
              event.status == 'Absent') ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    icon: LucideIcons.calendarCheck,
                    label: 'MARK DL',
                    color: const Color(0xFFB45309), // Orange 700
                    onTap: onMarkDl,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ActionButton(
                    icon: LucideIcons.checkCircle,
                    label: 'MARK PRESENT',
                    color: const Color(0xFF047857), // Green 700
                    onTap: onMarkPresent,
                  ),
                ),
              ],
            ),
          ],
          if ((event.isCorrection || event.isExtra) &&
              event.trackingId != null) ...[
            const SizedBox(height: 16),
            _ActionButton(
              icon: LucideIcons.trash2,
              label: 'DELETE RECORD',
              color: const Color(0xFFEF4444), // Red 500
              onTap: onDelete,
              isFullWidth: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
    this.isFullWidth = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color color;
  final bool isFullWidth;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Translate label to a user friendly screen reader description
    var semanticLabel = label;
    if (label.toUpperCase() == 'MARK DL') {
      semanticLabel = 'Mark Duty Leave';
    } else if (label.toUpperCase() == 'MARK PRESENT') {
      semanticLabel = 'Mark Present';
    } else if (label.toUpperCase() == 'DELETE RECORD') {
      semanticLabel = 'Delete Record';
    }

    final textColor = color.computeLuminance() > 0.45
        ? const Color(0xFF1F2937)
        : Colors.white;

    return Semantics(
      button: true,
      enabled: onTap != null,
      label: semanticLabel,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            width: isFullWidth ? double.infinity : null,
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(16),
              border: isDark
                  ? Border.all(color: color.withValues(alpha: 0.1), width: 1.5)
                  : null,
              boxShadow: !isDark
                  ? [
                      BoxShadow(
                        color: color.withValues(alpha: 0.2),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 14, color: textColor),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: textColor,
                    letterSpacing: 0.8,
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

class _CorrectionTag extends StatelessWidget {
  const _CorrectionTag();

  @override
  Widget build(BuildContext context) {
    const color = Color(0xFFA855F7);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final displayColor = _getContrastColor(color, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.1 : 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.rotateCcw, size: 10, color: displayColor),
          const SizedBox(width: 6),
          Text(
            'CORRECTION',
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: displayColor,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _SelfMarkedTag extends StatelessWidget {
  const _SelfMarkedTag();

  @override
  Widget build(BuildContext context) {
    const color = Color(0xFF6366F1);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final displayColor = _getContrastColor(color, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.1 : 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.mousePointer2, size: 10, color: displayColor),
          const SizedBox(width: 6),
          Text(
            'SELF-MARKED',
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: displayColor,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

Color _getContrastColor(Color color, bool isDark) {
  if (isDark) {
    final luminance = color.computeLuminance();
    if (luminance >= 0.45) return color;
    
    final hsl = HSLColor.fromColor(color);
    var lightness = hsl.lightness;
    while (lightness < 1.0) {
      lightness = (lightness + 0.05).clamp(0.0, 1.0);
      final candidate = hsl.withLightness(lightness).toColor();
      if (candidate.computeLuminance() >= 0.45) {
        return candidate;
      }
    }
    return Colors.white;
  } else {
    final luminance = color.computeLuminance();
    if (luminance <= 0.18) return color;
    
    final hsl = HSLColor.fromColor(color);
    var lightness = hsl.lightness;
    while (lightness > 0.0) {
      lightness = (lightness - 0.05).clamp(0.0, 1.0);
      final candidate = hsl.withLightness(lightness).toColor();
      if (candidate.computeLuminance() <= 0.18) {
        return candidate;
      }
    }
    return Colors.black;
  }
}
