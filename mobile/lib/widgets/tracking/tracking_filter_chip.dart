import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class TrackingFilterChip extends StatelessWidget {

  const TrackingFilterChip({
    required this.selectedCourse, required this.onTap, required this.onClear, super.key,
    this.officialReport,
    this.allCourses,
  });
  final String selectedCourse;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final isFiltered = selectedCourse != 'all';
    var label = 'All Subjects';

    if (isFiltered) {
      final normKey = selectedCourse.trim().toUpperCase();
      final mergedCourse = (allCourses ?? []).firstWhere(
        (c) => c.safeId.trim().toUpperCase() == normKey,
        orElse: () => CourseDetails(id: 0, name: selectedCourse),
      );
      label = utils.resolveCourseDisplayName(
        courseKey: selectedCourse,
        mergedCourse: mergedCourse,
        officialReport: officialReport,
      );
    }

    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return Semantics(
      button: true,
      label: 'Filter by $label ${isFiltered ? "active filter" : "unfiltered"}',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: isFiltered
                ? primary.withValues(alpha: 0.1)
                : Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isFiltered
                  ? primary.withValues(alpha: 0.45)
                  : Theme.of(
                      context,
                    ).colorScheme.outlineVariant.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isFiltered ? LucideIcons.filter : LucideIcons.slidersHorizontal,
                size: 14,
                color: isFiltered
                    ? primary
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: isFiltered
                        ? Theme.of(context).colorScheme.onSurface
                        : Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              if (isFiltered) ...[
                const SizedBox(width: 8),
                Semantics(
                  button: true,
                  label: 'Clear filter $label',
                  child: GestureDetector(
                    onTap: onClear,
                    child: Icon(
                      LucideIcons.x,
                      size: 14,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.2),
                    ),
                  ),
                ),
              ] else ...[
                const SizedBox(width: 4),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.2),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
