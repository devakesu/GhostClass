import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/attendance/edit_instructor_dialog.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class CourseCard extends StatelessWidget {
  final CourseDetails course;
  final CourseStat stat;
  final utils.AttendanceResult bunkResult;
  final bool bunkEnabled;
  final bool isEnabled;
  final VoidCallback? onToggleTap;
  final List<CourseInstructor> instructors;

  const CourseCard({
    required this.course, required this.stat, required this.bunkResult, required this.bunkEnabled, required this.instructors, super.key,
    this.isEnabled = true,
    this.onToggleTap,
  });

  List<Color> _getCourseColors(BuildContext context, Color statusColor) {
    final bool noData = stat.finalTotal == 0;
    if (!isEnabled || noData) {
      return [
        Theme.of(context).colorScheme.surfaceContainer.withValues(alpha: 0.6),
        Theme.of(context).colorScheme.surfaceContainer.withValues(alpha: 0.4),
      ];
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return [
      statusColor.withValues(alpha: isDark ? 0.12 : 0.08),
      statusColor.withValues(alpha: isDark ? 0.06 : 0.04),
    ];
  }

  Color _getPrimaryColor(BuildContext context) {
    final bool noData = stat.finalTotal == 0;
    if (!isEnabled || noData) {
      return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3);
    }
    final ghostColors = Theme.of(context).extension<GhostColors>()!;
    return ghostColors.brandPrimary ?? Theme.of(context).colorScheme.primary;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ghostColors = Theme.of(context).extension<GhostColors>()!;
    final primary =
        ghostColors.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final primaryGreen = ghostColors.successGreen ?? Colors.green;
    final primaryRed = ghostColors.dangerRed ?? Colors.red;

    final isGain = stat.percentage >= stat.officialPercentage;
    final hasModifications = stat.corrPresent > 0 || stat.manualTotalGain > 0;

    // Calculate safe metrics (official only)
    final safeMetrics = utils.calculateAttendance(
      stat.officialPresent,
      stat.officialTotal,
      targetPercentage: bunkResult.targetPercentage,
    );

    final bool trackingIsBetter =
        bunkResult.canBunk > safeMetrics.canBunk ||
        (bunkResult.canBunk == 0 &&
            safeMetrics.canBunk == 0 &&
            bunkResult.requiredToAttend < safeMetrics.requiredToAttend);

    final bool noOfficialData = stat.officialTotal == 0;
    final bool noDataAtAll = stat.finalTotal == 0;
    final bool isTrackingOnly = noOfficialData && stat.finalTotal > 0;
    final bool isDormant = noDataAtAll;
    final bool isCardInactive = !isEnabled || isDormant;

    // Status Color for the tag
    final Color statusColor;
    if (isCardInactive) {
      statusColor = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3);
    } else {
      if (bunkResult.requiredToAttend > 0) {
        statusColor = ghostColors.dangerRed ?? Colors.red;
      } else {
        statusColor = ghostColors.successGreen ?? Colors.green;
      }
    }

    final colors = _getCourseColors(context, statusColor);
    final accent = _getPrimaryColor(context);

    Widget card = Semantics(
      button: true,
      label: 'View details for ${course.name}',
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        child: InkWell(
          borderRadius: BorderRadius.circular(28),
          onTap: () {
            GoRouter.of(context).push('/course/${course.code}');
          },
          child: Container(
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: isDark
            ? Border.all(
                color: isEnabled && !noDataAtAll
                    ? statusColor.withValues(alpha: 0.3)
                    : Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.05),
                width: 1,
              )
            : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Container with Solid Tint
          Container(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
            decoration: BoxDecoration(
              color: isEnabled && !noDataAtAll
                  ? colors.first.withValues(alpha: isDark ? 0.35 : 0.08)
                  : Theme.of(context).colorScheme.surfaceContainerHighest
                        .withValues(alpha: isDark ? 0.7 : 0.3),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
              border: isDark
                  ? Border(
                      bottom: BorderSide(
                        color: isEnabled && !noDataAtAll
                            ? statusColor.withValues(alpha: 0.3)
                            : Theme.of(context).colorScheme.outlineVariant
                                  .withValues(alpha: 0.1),
                        width: 1.0,
                      ),
                    )
                  : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Semantics(
                        label: 'Course: ${course.name}',
                        child: Text(
                          course.name,
                          style: GoogleFonts.manrope(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface,
                            height: 1.2,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (course.id == 0) ...[
                                Icon(
                                  LucideIcons.user2,
                                  size: 10,
                                  color: statusColor,
                                ),
                                const SizedBox(width: 4),
                              ],
                              Text(
                                course.code ?? 'COURSE',
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  color: isEnabled
                                      ? statusColor
                                      : Theme.of(context).colorScheme.onSurface
                                            .withValues(alpha: 0.6),
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Semantics(
                          button: true,
                          label: 'Toggle tracking for ${course.name}',
                          child: CourseToggleBadge(
                            isEnabled: isEnabled,
                            noData: noDataAtAll,
                            isTracking: isTrackingOnly,
                            onTap: onToggleTap,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Builder(
                  builder: (context) {
                    final instructor = instructors
                        .where(
                          (i) =>
                              i.courseCode.toUpperCase().replaceAll(' ', '') ==
                              (course.code ?? '').toUpperCase().replaceAll(
                                ' ',
                                '',
                              ),
                        )
                        .lastOrNull;

                    final String displayName;
                    if (instructor != null) {
                      displayName = instructor.instructorName;
                    } else {
                      final official = course.institutionUsers
                          .where((u) => u.pivot.courseroleId == 1)
                          .firstOrNull;
                      if (official != null) {
                        displayName =
                            '${official.firstName} ${official.lastName}';
                      } else {
                        displayName = 'No instructor assigned';
                      }
                    }

                    return Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Opacity(
                            opacity: 0.6,
                            child: Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    displayName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.manrope(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: Theme.of(
                                        context,
                                      ).colorScheme.onSurface,
                                    ),
                                  ),
                                ),
                                if (instructor != null) ...[
                                  const SizedBox(width: 4),
                                  Icon(
                                    LucideIcons.userCog,
                                    size: 12,
                                    color: accent,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        Semantics(
                          button: true,
                          label: 'Edit instructor for ${course.name}',
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: () => showDialog(
                                context: context,
                                builder: (context) => EditInstructorDialog(
                                  courseCode: course.code ?? '',
                                  courseName: course.name,
                                  initialName: instructor?.instructorName,
                                ),
                              ),
                              borderRadius: BorderRadius.circular(8),
                              child: Padding(
                                padding: const EdgeInsets.all(4),
                                child: Icon(
                                  LucideIcons.edit3,
                                  size: 14,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurface.withValues(alpha: 0.4),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),

          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(28),
            ),
            padding: EdgeInsets.fromLTRB(20, 16, 20, noDataAtAll ? 16 : 28),
            child: noDataAtAll
                ? Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              LucideIcons.alertCircle,
                              size: 14,
                              color:
                                  Theme.of(context).brightness == Brightness.dark
                                      ? Colors.amber.shade400
                                      : Colors.amber.shade700,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'No attendance data',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color:
                                    Theme.of(context).brightness == Brightness.dark
                                        ? Colors.amber.shade400
                                        : Colors.amber.shade700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'No attendance records yet',
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Theme.of(context).colorScheme.onSurface
                                .withValues(alpha: 0.4),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Stats Grid (3 Columns)
                    Row(
                      children: [
                        StatBox(
                          label: 'Present',
                          base: stat.officialPresent,
                          correction: stat.corrPresent,
                          extra: stat.extraPresent,
                          color: primaryGreen,
                        ),
                        const SizedBox(width: 10),
                        StatBox(
                          label: 'Absent',
                          base: stat.officialAbsent,
                          correction: -stat.corrPresent,
                          extra: stat.extraAbsent,
                          color: primaryRed,
                        ),
                        const SizedBox(width: 10),
                        StatBox(
                          label: 'Total',
                          base: stat.officialTotal,
                          extra: stat.manualTotalGain,
                          color: primary,
                        ),
                      ],
                    ),

                    const SizedBox(height: 32),

                    // Dual Progress Bar
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Stack(
                        children: [
                          Container(
                            height: 10,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          if (isGain) ...[
                            // Striped Extra Gain Bar
                            FractionallySizedBox(
                              widthFactor: (stat.percentage / 100).clamp(
                                0.0,
                                1.0,
                              ),
                              child: CustomPaint(
                                painter: StripedBarPainter(
                                  color: primary.withValues(alpha: 0.5),
                                ),
                                child: Container(height: 10),
                              ),
                            ),
                            // Solid Official Bar
                            FractionallySizedBox(
                              widthFactor: (stat.officialPercentage / 100).clamp(
                                0.0,
                                1.0,
                              ),
                              child: Container(
                                height: 10,
                                decoration: BoxDecoration(
                                  color: primary,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ] else ...[
                            // Striped Official Loss Bar
                            FractionallySizedBox(
                              widthFactor: (stat.officialPercentage / 100).clamp(
                                0.0,
                                1.0,
                              ),
                              child: CustomPaint(
                                painter: StripedBarPainter(
                                  color: primaryRed.withValues(alpha: 0.8),
                                ),
                                child: Container(height: 10),
                              ),
                            ),
                            // Solid Final Bar
                            FractionallySizedBox(
                              widthFactor: (stat.percentage / 100).clamp(
                                0.0,
                                1.0,
                              ),
                              child: Container(
                                height: 10,
                                decoration: BoxDecoration(
                                  color: primary,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Attendance Text Row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Attendance',
                              style: GoogleFonts.manrope(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(context).colorScheme.onSurface
                                    .withValues(alpha: 0.4),
                              ),
                            ),
                          ],
                        ),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            if (hasModifications &&
                                stat.officialPercentage != stat.percentage) ...[
                              Text(
                                '${stat.officialPercentage.toStringAsFixed(2)}%',
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.3),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                                child: Icon(
                                  LucideIcons.arrowRight,
                                  size: 10,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.1),
                                ),
                              ),
                            ],
                            Semantics(
                              label:
                                  'Attendance percentage: ${stat.percentage.toStringAsFixed(2)}%',
                              child: Text(
                                '${stat.percentage.toStringAsFixed(2)}%',
                                style: GoogleFonts.manrope(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                  color: hasModifications
                                      ? (isGain
                                          ? primary
                                          : primaryRed.withValues(alpha: 0.8))
                                      : Theme.of(context).colorScheme.onSurface,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Bottom Bunk Panels
                    if (bunkEnabled && stat.finalTotal > 0)
                      if (!hasModifications)
                        SimpleBunkPanel(result: safeMetrics)
                      else if (noOfficialData)
                        SimpleBunkPanel(result: bunkResult)
                      else if (!trackingIsBetter)
                        SimpleBunkPanel(result: bunkResult)
                      else
                        Row(
                          children: [
                            Expanded(child: SafeBunkPanel(result: safeMetrics)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: TrackingBunkPanel(result: bunkResult),
                            ),
                          ],
                        ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
              ],
            ),
          ),
        ),
      ),
    );

    if (isCardInactive) {
      card = ColorFiltered(
        colorFilter: const ColorFilter.matrix(<double>[
          0.2126,
          0.7152,
          0.0722,
          0,
          0,
          0.2126,
          0.7152,
          0.0722,
          0,
          0,
          0.2126,
          0.7152,
          0.0722,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
        ]),
        child: card,
      );
    }

    return Opacity(
      opacity: isEnabled ? (isDormant ? 0.7 : 1.0) : 0.5,
      child: card,
    );
  }
}

class StatBox extends StatelessWidget {
  final String label;
  final int base;
  final int? correction;
  final int? extra;
  final Color color;

  const StatBox({
    required this.label, required this.base, required this.color, super.key,
    this.correction,
    this.extra,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(
            alpha: Theme.of(context).brightness == Brightness.dark
                ? 0.12
                : 0.18,
          ),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: color.withValues(
              alpha: Theme.of(context).brightness == Brightness.dark
                  ? 0.35
                  : 0.6,
            ),
          ),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: Theme.of(context).brightness == Brightness.dark
                    ? color
                    : Color.lerp(color, Colors.black, 0.4),
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
                        color: color == Theme.of(context).colorScheme.onSurface
                            ? Theme.of(context).colorScheme.onSurface
                            : color,
                      ),
                    ),
                    if (correction != null && correction != 0) ...[
                      const SizedBox(width: 4),
                      Text(
                        '${correction! > 0 ? "+" : ""}$correction',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color:
                              Theme.of(
                                context,
                              ).extension<GhostColors>()?.accentOrange ??
                              Colors.orange,
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
                          color:
                              Theme.of(
                                context,
                              ).extension<GhostColors>()?.accentBlue ??
                              Colors.blue,
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
    );
  }
}

class SimpleBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  const SimpleBunkPanel({required this.result, super.key});

  @override
  Widget build(BuildContext context) {
    final color = result.requiredToAttend > 0
        ? (Theme.of(context).extension<GhostColors>()?.dangerRed ??
              Colors.red)
        : (Theme.of(context).extension<GhostColors>()?.successGreen ??
              Colors.green);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            result.requiredToAttend == 0
                ? 'You can safely bunk ${result.canBunk} ${result.canBunk == 1 ? 'class 🥳' : 'classes 🥳🥳'}'
                : result.requiredToAttend > 0
                ? 'You need to attend ${result.requiredToAttend} more ${result.requiredToAttend == 1 ? 'class 💀' : 'classes 💀💀'}'
                : 'You are on the edge. Skipping now\'s risky 💀💀',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class SafeBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  const SafeBunkPanel({required this.result, super.key});

  @override
  Widget build(BuildContext context) {
    final blue =
        Theme.of(context).extension<GhostColors>()?.accentBlue ?? Colors.blue;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: blue.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: blue.withValues(alpha: 0.15)),
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
                style: GoogleFonts.manrope(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: blue,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          RichText(
            text: TextSpan(
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
              children: [
                const TextSpan(text: 'Bunkable: '),
                TextSpan(
                  text: result.canBunk.toString(),
                  style: TextStyle(
                    color:
                        Theme.of(
                          context,
                        ).extension<GhostColors>()?.successGreen ??
                        Colors.green,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TrackingBunkPanel extends StatelessWidget {
  final utils.AttendanceResult result;
  final bool isSolo;
  const TrackingBunkPanel({required this.result, super.key, this.isSolo = false});

  @override
  Widget build(BuildContext context) {
    final purple =
        Theme.of(context).extension<GhostColors>()?.brandPrimary ??
        Colors.purple;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: purple.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: purple.withValues(alpha: 0.15)),
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
                style: GoogleFonts.manrope(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: purple,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          RichText(
            text: TextSpan(
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
              children: [
                TextSpan(
                  text: result.canBunk > 0
                      ? 'Bunkable: '
                      : result.requiredToAttend > 0
                      ? 'Must Attend: '
                      : 'Edge ',
                ),
                TextSpan(
                  text: result.canBunk > 0
                      ? '${result.canBunk} 🥳'
                      : result.requiredToAttend > 0
                      ? '${result.requiredToAttend} 💀💀'
                      : '💀',
                  style: TextStyle(
                    color: result.requiredToAttend > 0
                        ? (Theme.of(
                                context,
                              ).extension<GhostColors>()?.dangerRed ??
                              Colors.red)
                        : (Theme.of(
                                context,
                              ).extension<GhostColors>()?.successGreen ??
                              Colors.green),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StripedBarPainter extends CustomPainter {
  final Color color;
  StripedBarPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);
    final rRect = RRect.fromRectAndRadius(rect, const Radius.circular(10));

    // Clip to rounded rect shape
    canvas.save();
    canvas.clipRRect(rRect);

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    // Background color
    canvas.drawRect(rect, paint);

    // Overlay Stripes
    final stripePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.15)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    const stripeSpacing = 10.0;
    for (double i = -size.height; i < size.width; i += stripeSpacing) {
      canvas.drawLine(
        Offset(i, size.height),
        Offset(i + size.height, 0),
        stripePaint,
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class CourseToggleBadge extends StatelessWidget {
  final bool isEnabled;
  final bool noData;
  final bool isTracking;
  final VoidCallback? onTap;

  const CourseToggleBadge({
    required this.isEnabled, super.key,
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
      color = (Theme.of(context).colorScheme.onSurface).withValues(alpha: 0.4);
      label = 'NO DATA';
    } else if (isTracking) {
      color = ghostColors.brandPrimary ?? Theme.of(context).colorScheme.primary;
      label = 'TRACKING';
    } else {
      color = ghostColors.successGreen ?? Colors.green;
      label = 'ENABLED';
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: color.withValues(alpha: 0.3)),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.05),
              blurRadius: 4,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                color: color,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
