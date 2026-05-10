import 'package:flutter/material.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class AttendanceCalendarWidget extends StatelessWidget {
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onDaySelected;
  final DashboardData dashboard;
  final TrackingState tracking;
  final Set<String> disabledCodes;

  const AttendanceCalendarWidget({
    super.key,
    required this.focusedDay,
    required this.selectedDay,
    required this.onDaySelected,
    required this.dashboard,
    required this.tracking,
    required this.disabledCodes,
  });

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(focusedDay.year, focusedDay.month, 1);
    final daysInMonth = DateTime(focusedDay.year, focusedDay.month + 1, 0).day;
    final paddingDays = (firstDay.weekday % 7);

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

              return GestureDetector(
                onTap: () => onDaySelected(date),
                child: Center(
                  child: Semantics(
                    label: '${DateFormat('MMMM d').format(date)}${status != null ? ", $status" : ""}',
                    selected: isSelected,
                    button: true,
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
                                          ).extension<GhostColors>()?.brandPrimary ??
                                          Theme.of(context).colorScheme.primary)
                                      .withValues(alpha: 0.2)
                                : _getStatusBg(status, context),
                        shape: BoxShape.circle,
                        border: isToday && !isSelected
                            ? Border.all(
                                color: (Theme.of(
                                          context,
                                        ).extension<GhostColors>()?.brandPrimary ??
                                        Theme.of(context).colorScheme.primary)
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
                              fontWeight:
                                  isSelected || isToday ? FontWeight.w900 : FontWeight.w700,
                              color: isSelected
                                  ? Colors.white
                                  : isToday
                                      ? (Theme.of(
                                                  context,
                                                ).extension<GhostColors>()?.brandPrimary ??
                                            Theme.of(context).colorScheme.primary)
                                      : status != null
                                          ? _getStatusColor(status, context)
                                          : Theme.of(context)
                                              .colorScheme
                                              .onSurface
                                              .withValues(alpha: 0.85)),
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
    final sessions = dashboard.attendance.studentAttendanceData[dateStr];
    final extraTracking = tracking.groupedByCourse.values
        .expand((e) => e)
        .where((t) => t.date == dbDate && t.status == 'extra')
        .toList();

    if (sessions == null && extraTracking.isEmpty) return null;

    bool hasAbsent = false;
    bool hasDutyLeave = false;
    bool hasOtherLeave = false;
    bool hasPresent = false;

    if (sessions != null) {
      sessions.forEach((_, s) {
        final status = AttendanceStatus.fromCode(s.attendance);
        if (status == AttendanceStatus.absent) hasAbsent = true;
        if (status == AttendanceStatus.dutyLeave) hasDutyLeave = true;
        if (status == AttendanceStatus.otherLeave) hasOtherLeave = true;
        if (status == AttendanceStatus.present) hasPresent = true;
      });
    }

    for (final t in extraTracking) {
      final status = AttendanceStatus.fromCode(t.attendance);
      if (status == AttendanceStatus.absent) hasAbsent = true;
      if (status == AttendanceStatus.dutyLeave) hasDutyLeave = true;
      if (status == AttendanceStatus.otherLeave) hasOtherLeave = true;
      if (status == AttendanceStatus.present) hasPresent = true;
    }

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
    if (status == 'absent') return ghostColors?.dangerRed ?? const Color(0xFFEF4444);
    if (status == 'dutyLeave') return ghostColors?.accentOrange ?? const Color(0xFFF59E0B);
    if (status == 'otherLeave') return ghostColors?.accentBlue ?? const Color(0xFF3B82F6);
    if (status == 'present') return ghostColors?.successGreen ?? const Color(0xFF10B981);
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
  final String label;
  final Color color;
  final bool isRing;

  const _LegendItem({
    required this.label,
    required this.color,
    this.isRing = false,
  });

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
