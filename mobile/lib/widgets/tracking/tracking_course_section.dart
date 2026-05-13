import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/tracking/tracking_record_card.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class TrackingCourseSection extends StatelessWidget {

  const TrackingCourseSection({
    required this.courseKey, required this.records, required this.onDelete, super.key,
    this.officialReport,
    this.allCourses,
  });
  final String courseKey;
  final List<TrackingRecord> records;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final void Function(int) onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final normKey = courseKey.trim().toUpperCase();
    final mergedCourse = (allCourses ?? []).firstWhere(
      (c) =>
          c.safeId.trim().toUpperCase() == normKey ||
          (c.code ?? '').trim().toUpperCase() == normKey,
      orElse: () => CourseDetails(id: 0, name: courseKey),
    );
    final courseName = utils.resolveCourseDisplayName(
      courseKey: courseKey,
      mergedCourse: mergedCourse,
      officialReport: officialReport,
    );
    final courseCode = utils.resolveCourseDisplayCode(
      courseKey: courseKey,
      mergedCourse: mergedCourse,
      officialReport: officialReport,
    );

    final statusGroups = <String, List<TrackingRecord>>{
      'Present': [],
      'Duty Leave': [],
      'Absent': [],
    };

    for (final record in records) {
      final status = AttendanceStatus.fromCode(record.attendance);
      if (status == AttendanceStatus.dutyLeave) {
        statusGroups['Duty Leave']!.add(record);
      } else if (status == AttendanceStatus.absent) {
        statusGroups['Absent']!.add(record);
      } else {
        statusGroups['Present']!.add(record);
      }
    }

    final activeStatuses = statusGroups.keys
        .where((k) => statusGroups[k]!.isNotEmpty)
        .toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: _StickyHeaderDelegate(
            height: 70,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary.withValues(
                        alpha: isDark ? 0.25 : 0.12,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      LucideIcons.bookOpen,
                      size: 16,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          courseName.toUpperCase(),
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.8),
                            letterSpacing: 0.2,
                            height: 1.1,
                          ),
                        ),
                        if (courseCode != null)
                          Text(
                            courseCode,
                            style: GoogleFonts.manrope(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.4),
                              height: 1.1,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${records.length}',
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        for (final status in activeStatuses) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
              child: _StatusSubHeader(
                status: status,
                count: statusGroups[status]!.length,
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate((context, index) {
                final record = statusGroups[status]![index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TrackingRecordCard(
                    record: record,
                    officialReport: officialReport,
                    onDelete: () => onDelete(record.id),
                  ),
                );
              }, childCount: statusGroups[status]!.length),
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusSubHeader extends StatelessWidget {

  const _StatusSubHeader({required this.status, required this.count});
  final String status;
  final int count;

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>()!;
    var color = ghostColors.successGreen ?? Colors.green;
    if (status == 'Duty Leave') {
      color = ghostColors.accentOrange ?? Colors.orange;
    }
    if (status == 'Absent') {
      color = ghostColors.dangerRed ?? Colors.red;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: Theme.of(context).brightness == Brightness.dark ? 0.05 : 0.08,
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.45)),
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
            status.toUpperCase(),
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$count',
            style: GoogleFonts.manrope(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: color.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {

  _StickyHeaderDelegate({required this.height, required this.child});
  final double height;
  final Widget child;

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: child,
    );
  }

  @override
  bool shouldRebuild(_StickyHeaderDelegate oldDelegate) {
    return oldDelegate.child != child || oldDelegate.height != height;
  }
}
