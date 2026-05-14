import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:google_fonts/google_fonts.dart';

class TrackingSubjectPicker extends ConsumerWidget {
  const TrackingSubjectPicker({
    required this.selectedCourse,
    required this.courseKeys,
    required this.groupedByCourse,
    required this.onSelected,
    super.key,
    this.officialReport,
    this.allCourses,
  });
  final String selectedCourse;
  final List<String> courseKeys;
  final Map<String, List<TrackingRecord>> groupedByCourse;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final void Function(String) onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final primary = Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;

    return Container(
      padding: const EdgeInsets.all(24),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Select Subject',
            style: GoogleFonts.manrope(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 20),
          Flexible(
            child: Scrollbar(
              thumbVisibility: true,
              thickness: 4,
              radius: const Radius.circular(2),
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(right: 8),
                physics: const BouncingScrollPhysics(),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _PickerChip(
                      label: 'All Subjects',
                      count: groupedByCourse.values.fold(
                        0,
                        (p, c) => p + c.length,
                      ),
                      isSelected: selectedCourse == 'all',
                      onTap: () => onSelected('all'),
                      primary: primary,
                      surface: surface,
                    ),
                    ...courseKeys.map((key) {
                      final isSelected = selectedCourse == key;
                      final normKey = key.trim().toUpperCase();
                      final mergedCourse = (allCourses ?? []).firstWhere(
                        (c) =>
                            c.safeId.trim().toUpperCase() == normKey ||
                            (c.code ?? '').trim().toUpperCase() == normKey,
                        orElse: () => CourseDetails(id: 0, name: key),
                      );
                      final isDisabled =
                          ref
                              .watch(authProvider)
                              .value
                              ?.settings
                              .disabledCourses['${ref.watch(dashboardProvider).value?.selectedYear}-${ref.watch(dashboardProvider).value?.selectedSemester}']
                              ?.containsKey(
                                utils
                                    .resolveCourseDisplayCode(
                                      courseKey: key,
                                      mergedCourse: mergedCourse,
                                      officialReport: officialReport,
                                    )
                                    ?.toUpperCase(),
                              ) ??
                          false;

                      final label = utils.resolveCourseDisplayName(
                        courseKey: key,
                        mergedCourse: mergedCourse,
                        officialReport: officialReport,
                      );
                      final count = groupedByCourse[key]?.length ?? 0;
                      return _PickerChip(
                        label: isDisabled ? '$label (Disabled)' : label,
                        count: count,
                        isSelected: isSelected,
                        isDisabled: isDisabled,
                        onTap: () => onSelected(key),
                        primary: primary,
                        surface: surface,
                      );
                    }),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _PickerChip extends StatelessWidget {
  const _PickerChip({
    required this.label,
    required this.count,
    required this.isSelected,
    required this.onTap,
    required this.primary,
    required this.surface,
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
      onTap: onTap,
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
