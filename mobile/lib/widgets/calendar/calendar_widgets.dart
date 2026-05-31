import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class AttendanceCalendarWidget extends StatelessWidget {
  const AttendanceCalendarWidget({
    required this.focusedDay,
    required this.selectedDay,
    required this.onDaySelected,
    required this.dashboard,
    required this.tracking,
    required this.disabledCodes,
    super.key,
  });
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onDaySelected;
  final DashboardData dashboard;
  final TrackingState tracking;
  final Set<String> disabledCodes;

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(focusedDay.year, focusedDay.month);
    final daysInMonth = DateTime(focusedDay.year, focusedDay.month + 1, 0).day;
    final paddingDays = firstDay.weekday % 7;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                .map(
                  (d) => SizedBox(
                    width: 40,
                    child: Text(
                      d,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          GridView.builder(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: daysInMonth + paddingDays,
            itemBuilder: (context, index) {
              if (index < paddingDays) return const SizedBox();
              final day = index - paddingDays + 1;
              final date = DateTime(focusedDay.year, focusedDay.month, day);
              final isSelected =
                  date.year == selectedDay.year &&
                  date.month == selectedDay.month &&
                  date.day == selectedDay.day;
              final now = DateTime.now();
              final isToday =
                  date.year == now.year &&
                  date.month == now.month &&
                  date.day == now.day;

              final status = _getDayStatus(date, context);

              return Center(
                child: Semantics(
                  label:
                      '${DateFormat('MMMM d').format(date)}${status != null ? ", $status" : ""}',
                  selected: isSelected,
                  button: true,
                  child: InkWell(
                    onTap: () => onDaySelected(date),
                    borderRadius: BorderRadius.circular(20),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? (Theme.of(
                                    context,
                                  ).extension<GhostColors>()?.brandPrimary ??
                                  Theme.of(context).colorScheme.primary)
                            : isToday
                            ? (Theme.of(
                                        context,
                                      ).extension<GhostColors>()?.brandPurple ??
                                      const Color(0xFF7C3AED))
                                  .withValues(alpha: 0.2)
                            : _getStatusBg(status, context),
                        shape: BoxShape.circle,
                        border: isToday && !isSelected
                            ? Border.all(
                                color:
                                    (Theme.of(
                                                  context,
                                                )
                                                .extension<GhostColors>()
                                                ?.brandPurple ??
                                            const Color(0xFF7C3AED))
                                        .withValues(alpha: 0.4),
                                width: 1.5,
                              )
                            : status != null && !isSelected
                            ? Border.all(
                                color: _getStatusBorder(status, context),
                                width: 1.2,
                              )
                            : null,
                      ),
                      child: Center(
                        child: Text(
                          day.toString(),
                          style: GoogleFonts.manrope(
                            fontSize: 14,
                            fontWeight: isSelected || isToday
                                ? FontWeight.w900
                                : FontWeight.w700,
                            color: isSelected
                                ? Colors.white
                                : isToday
                                ? (Theme.of(
                                        context,
                                      ).extension<GhostColors>()?.brandPurple ??
                                      const Color(0xFF7C3AED))
                                : status != null
                                ? _getStatusColor(status, context)
                                : Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  String? _getDayStatus(DateTime date, BuildContext context) {
    final dateStr = DateFormat('yyyyMMdd').format(date);
    final dbDate = DateFormat('yyyy-MM-dd').format(date);

    String resolveSafeId(String rawId) {
      final normRaw = rawId.trim().toUpperCase();
      for (final c in dashboard.courses) {
        if (c.safeId.trim().toUpperCase() == normRaw ||
            (c.code ?? '').trim().toUpperCase() == normRaw) {
          return c.safeId;
        }
      }
      final numericId = int.tryParse(rawId);
      if (numericId != null) {
        for (final c in dashboard.courses) {
          if (c.id == numericId) return c.safeId;
        }
      }
      return rawId;
    }

    var hasAbsent = false;
    var hasDutyLeave = false;
    var hasOtherLeave = false;
    var hasPresent = false;

    final sessions = dashboard.attendance.studentAttendanceData[dateStr];
    if (sessions != null) {
      var idx = 0;
      sessions.forEach((key, sData) {
        final rawId = sData.course.toString();
        final safeId = resolveSafeId(rawId);
        final normSafeId = safeId.trim().toUpperCase();

        final courseDetails = dashboard.courses.firstWhere(
          (c) =>
              c.safeId.trim().toUpperCase() == normSafeId ||
              (c.code ?? '').trim().toUpperCase() == normSafeId,
          orElse: () => CourseDetails(id: 0, name: safeId),
        );

        final officialCourse = dashboard.attendance.courses[rawId];
        if (officialCourse == null &&
            courseDetails.id == 0 &&
            courseDetails.name == safeId) {
          idx++;
          return;
        }

        var displaySessionName = sData.session?.toString() ?? key;
        final sNumKey = int.tryParse(key);
        if ((sData.session == null || sData.session.toString() == 'null') &&
            sNumKey != null &&
            sNumKey > 20) {
          displaySessionName = (idx + 1).toString();
        }

        final resolvedCode = utils.resolveCourseDisplayCode(
          courseKey: rawId,
          mergedCourse: courseDetails,
          officialReport: dashboard.attendance,
        );

        final isDisabled = disabledCodes.contains(
          (resolvedCode ?? '').toUpperCase(),
        );
        final status = AttendanceStatus.fromCode(sData.attendance);

        final trackerCourseCode =
            (resolvedCode != null && resolvedCode.trim().isNotEmpty)
            ? resolvedCode.replaceAll(RegExp(r'\s+'), '').toUpperCase()
            : safeId.replaceAll(RegExp(r'\s+'), '').toUpperCase();

        final trackingKeys = {
          rawId.trim().toUpperCase(),
          safeId.trim().toUpperCase(),
          trackerCourseCode.trim().toUpperCase(),
        };
        final trackingRecords = tracking.groupedByCourse.entries
            .where(
              (entry) => trackingKeys.contains(entry.key.trim().toUpperCase()),
            )
            .expand((entry) => entry.value)
            .toList();

        TrackingRecord? override;
        final normDisplaySession = utils.normalizeSession(displaySessionName);
        final normRawSession = utils.normalizeSession(key);
        for (final t in trackingRecords) {
          if (t.date != dbDate) continue;
          final tNorm = utils.normalizeSession(t.session);
          if (tNorm == normDisplaySession || tNorm == normRawSession) {
            override = t;
            break;
          }
        }

        final isCorrection =
            override != null && override.status == 'correction';

        final currentStatus = isCorrection
            ? AttendanceStatus.fromCode(override.attendance)
            : status;

        if (isDisabled) {
          if (currentStatus == AttendanceStatus.present) {
            hasPresent = true;
          }
          idx++;
          return;
        }

        if (currentStatus == AttendanceStatus.absent) hasAbsent = true;
        if (currentStatus == AttendanceStatus.dutyLeave) hasDutyLeave = true;
        if (currentStatus == AttendanceStatus.otherLeave) hasOtherLeave = true;
        if (currentStatus == AttendanceStatus.present) hasPresent = true;

        idx++;
      });
    }

    tracking.groupedByCourse.forEach((courseKey, list) {
      final normKey = courseKey.trim().toUpperCase();
      final courseDetails = dashboard.courses.firstWhere(
        (c) =>
            c.safeId.trim().toUpperCase() == normKey ||
            (c.code ?? '').trim().toUpperCase() == normKey,
        orElse: () => CourseDetails(id: 0, name: courseKey),
      );

      final displayCode = utils.resolveCourseDisplayCode(
        courseKey: courseKey,
        mergedCourse: courseDetails,
        officialReport: dashboard.attendance,
      );
      final isDisabled = disabledCodes.contains(
        (displayCode ?? '').toUpperCase(),
      );

      for (final tr in list) {
        if (tr.date == dbDate && tr.status == 'extra') {
          final trStatus = AttendanceStatus.fromCode(tr.attendance);
          if (isDisabled) {
            if (trStatus == AttendanceStatus.present) {
              hasPresent = true;
            }
            continue;
          }
          if (trStatus == AttendanceStatus.absent) hasAbsent = true;
          if (trStatus == AttendanceStatus.dutyLeave) hasDutyLeave = true;
          if (trStatus == AttendanceStatus.otherLeave) hasOtherLeave = true;
          if (trStatus == AttendanceStatus.present) hasPresent = true;
        }
      }
    });

    if (hasAbsent) return 'absent';
    if (hasDutyLeave) return 'dutyLeave';
    if (hasOtherLeave) return 'otherLeave';
    if (hasPresent) return 'present';
    return null;
  }

  Color _getStatusBg(String? status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return (ghostColors?.dangerRed ?? const Color(0xFFEF4444)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'dutyLeave') {
      return (ghostColors?.accentOrange ?? const Color(0xFFF59E0B)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'otherLeave') {
      return (ghostColors?.accentBlue ?? const Color(0xFF3B82F6)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'present') {
      return (ghostColors?.successGreen ?? const Color(0xFF10B981)).withValues(
        alpha: 0.2,
      );
    }
    return Colors.transparent;
  }

  Color _getStatusBorder(String? status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return (ghostColors?.dangerRed ?? const Color(0xFFEF4444)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'dutyLeave') {
      return (ghostColors?.accentOrange ?? const Color(0xFFF59E0B)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'otherLeave') {
      return (ghostColors?.accentBlue ?? const Color(0xFF3B82F6)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'present') {
      return (ghostColors?.successGreen ?? const Color(0xFF10B981)).withValues(
        alpha: 0.45,
      );
    }
    return Colors.transparent;
  }

  Color _getStatusColor(String? status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return ghostColors?.dangerRed ?? const Color(0xFFEF4444);
    }
    if (status == 'dutyLeave') {
      return ghostColors?.accentOrange ?? const Color(0xFFF59E0B);
    }
    if (status == 'otherLeave') {
      return ghostColors?.accentBlue ?? const Color(0xFF3B82F6);
    }
    if (status == 'present') {
      return ghostColors?.successGreen ?? const Color(0xFF10B981);
    }
    return Theme.of(context).colorScheme.onSurface;
  }
}

class CalendarLegend extends StatelessWidget {
  const CalendarLegend({super.key});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Wrap(
        spacing: 16,
        runSpacing: 12,
        alignment: WrapAlignment.center,
        children: [
          _LegendItem(
            label: 'Today',
            color: ghostColors?.brandPurple ?? const Color(0xFF7C3AED),
          ),
          _LegendItem(
            label: 'Present',
            color: ghostColors?.successGreen ?? const Color(0xFF10B981),
          ),
          _LegendItem(
            label: 'Absent',
            color: ghostColors?.dangerRed ?? const Color(0xFFEF4444),
          ),
          _LegendItem(
            label: 'Duty Leave',
            color: ghostColors?.accentOrange ?? const Color(0xFFF59E0B),
          ),
          _LegendItem(
            label: 'Other Leave',
            color: ghostColors?.accentBlue ?? const Color(0xFF3B82F6),
            isRing: true,
          ),
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({
    required this.label,
    required this.color,
    this.isRing = false,
  });
  final String label;
  final Color color;
  final bool isRing;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: isRing ? Colors.transparent : color.withValues(alpha: 0.2),
            shape: BoxShape.circle,
            border: Border.all(
              color: color.withValues(alpha: isRing ? 1.0 : 0.45),
              width: 1.2,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}
