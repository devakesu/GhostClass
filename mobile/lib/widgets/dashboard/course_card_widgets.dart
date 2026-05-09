import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class StatBox extends StatelessWidget {
  final String label;
  final int base;
  final int? correction;
  final int? extra;
  final Color color;

  const StatBox({
    super.key,
    required this.label,
    required this.base,
    required this.color,
    this.correction,
    this.extra,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ghostColors = Theme.of(context).extension<GhostColors>();
    
    final int total = base + (correction ?? 0) + (extra ?? 0);

    return Expanded(
      child: Semantics(
        label: '$label: $total classes. ${base > 0 ? "Base: $base." : ""} '
            '${correction != null && correction != 0 ? "Adjustment: $correction." : ""} '
            '${extra != null && extra! > 0 ? "Tracking: $extra." : ""}',
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: color.withValues(alpha: isDark ? 0.15 : 0.22),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withValues(alpha: isDark ? 0.4 : 0.7)),
          ),
          child: Column(
            children: [
              Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  color: isDark ? color : Color.lerp(color, Colors.black, 0.4),
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 8),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        base.toString(),
                        style: GoogleFonts.manrope(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: color == Theme.of(context).colorScheme.onSurface ? Theme.of(context).colorScheme.onSurface : color,
                        ),
                      ),
                      if (correction != null && correction != 0) ...[
                        const SizedBox(width: 4),
                        Text(
                          '${correction! > 0 ? "+" : ""}$correction',
                          style: GoogleFonts.manrope(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: ghostColors?.accentOrange ?? Colors.orange,
                          ),
                        ),
                      ],
                      if (extra != null && extra! > 0) ...[
                        const SizedBox(width: 4),
                        Text(
                          '+$extra',
                          style: GoogleFonts.manrope(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: ghostColors?.accentBlue ?? Colors.blue,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SimpleBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  const SimpleBunkPanel({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final color = result.canBunk > 0
        ? (Theme.of(context).extension<GhostColors>()?.successGreen ?? Colors.green)
        : (Theme.of(context).extension<GhostColors>()?.dangerRed ?? Colors.red);

    final String message = result.canBunk > 0
        ? 'You can safely bunk ${result.canBunk} ${result.canBunk == 1 ? 'class' : 'classes'}'
        : result.requiredToAttend > 0
            ? 'You need to attend ${result.requiredToAttend} more ${result.requiredToAttend == 1 ? 'class' : 'classes'}'
            : 'You are on the edge. Skipping now\'s risky';

    return Semantics(
      label: 'Attendance summary: $message',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Text(
          result.canBunk > 0
              ? 'You can safely bunk ${result.canBunk} ${result.canBunk == 1 ? 'class 🥳' : 'classes 🥳🥳'}'
              : result.requiredToAttend > 0
                  ? 'You need to attend ${result.requiredToAttend} more ${result.requiredToAttend == 1 ? 'class 💀' : 'classes 💀💀'}'
                  : 'You are on the edge. Skipping now\'s risky 💀💀',
          textAlign: TextAlign.center,
          style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w800, color: color),
        ),
      ),
    );
  }
}

class SafeBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  const SafeBunkPanel({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final blue = Theme.of(context).extension<GhostColors>()?.accentBlue ?? Colors.blue;
    final String message = result.canBunk > 0 
        ? 'Safely bunkable: ${result.canBunk} classes based on official data'
        : result.requiredToAttend > 0 
            ? 'Must attend: ${result.requiredToAttend} classes to reach target'
            : 'On the edge of official target';

    return Semantics(
      label: 'Official data: $message',
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: blue.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: blue.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.shieldCheck, size: 12, color: blue),
                const SizedBox(width: 6),
                Text(
                  'SAFE (OFFICIAL)',
                  style: GoogleFonts.manrope(fontSize: 9, fontWeight: FontWeight.w900, color: blue, letterSpacing: 0.5),
                ),
              ],
            ),
            const SizedBox(height: 6),
            RichText(
              text: TextSpan(
                style: GoogleFonts.manrope(fontSize: 12, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                children: [
                  TextSpan(text: result.canBunk > 0 ? 'Bunkable: ' : result.requiredToAttend > 0 ? 'Must Attend: ' : 'Edge '),
                  TextSpan(
                    text: result.canBunk > 0 ? '${result.canBunk}' : result.requiredToAttend > 0 ? '${result.requiredToAttend} 💀💀' : '💀',
                    style: TextStyle(
                      color: result.canBunk > 0 ? (Theme.of(context).extension<GhostColors>()?.successGreen ?? Colors.green) : (Theme.of(context).extension<GhostColors>()?.dangerRed ?? Colors.red),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TrackingBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  final bool isSolo;
  const TrackingBunkPanel({super.key, required this.result, this.isSolo = false});

  @override
  Widget build(BuildContext context) {
    final purple = Theme.of(context).extension<GhostColors>()?.brandPrimary ?? Colors.purple;
    final String message = result.canBunk > 0 
        ? 'Tracking bunkable: ${result.canBunk} classes including local data'
        : result.requiredToAttend > 0 
            ? 'Tracking must attend: ${result.requiredToAttend} classes'
            : 'On the edge of tracking target';

    return Semantics(
      label: 'Combined data: $message',
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: purple.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: purple.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.zap, size: 12, color: purple),
                const SizedBox(width: 6),
                Text(
                  isSolo ? 'TRACKING DATA' : '+ TRACKING DATA',
                  style: GoogleFonts.manrope(fontSize: 9, fontWeight: FontWeight.w900, color: purple, letterSpacing: 0.5),
                ),
              ],
            ),
            const SizedBox(height: 6),
            RichText(
              text: TextSpan(
                style: GoogleFonts.manrope(fontSize: 12, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                children: [
                  TextSpan(text: result.canBunk > 0 ? 'Bunkable: ' : result.requiredToAttend > 0 ? 'Must Attend: ' : 'Edge '),
                  TextSpan(
                    text: result.canBunk > 0 ? '${result.canBunk} 🥳' : result.requiredToAttend > 0 ? '${result.requiredToAttend} 💀💀' : '💀',
                    style: TextStyle(
                      color: result.canBunk > 0 ? (Theme.of(context).extension<GhostColors>()?.successGreen ?? Colors.green) : (Theme.of(context).extension<GhostColors>()?.dangerRed ?? Colors.red),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CourseToggleBadge extends StatelessWidget {
  final bool isEnabled;
  final bool noData;
  final bool isTracking;
  final VoidCallback? onTap;

  const CourseToggleBadge({
    super.key,
    required this.isEnabled,
    this.noData = false,
    this.isTracking = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>()!;
    final Color color;
    final String label;

    if (!isEnabled) {
      color = ghostColors.dangerRed ?? Colors.red;
      label = 'DISABLED';
    } else if (noData) {
      color = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4);
      label = 'NO DATA';
    } else if (isTracking) {
      color = ghostColors.brandPrimary ?? Theme.of(context).colorScheme.primary;
      label = 'TRACKING';
    } else {
      color = ghostColors.successGreen ?? Colors.green;
      label = 'ENABLED';
    }

    return Semantics(
      button: true,
      label: 'Course status: $label. Double tap to toggle visibility.',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(100),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(100),
            border: Border.all(color: color.withValues(alpha: 0.3)),
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.05), blurRadius: 4, spreadRadius: 1)],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.manrope(fontSize: 9, fontWeight: FontWeight.w900, color: color, letterSpacing: 0.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
