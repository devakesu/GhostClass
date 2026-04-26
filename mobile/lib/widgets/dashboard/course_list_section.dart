import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/widgets/dashboard/disable_aware_course_card.dart';

class CourseLineupHeader extends StatelessWidget {
  const CourseLineupHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return const SliverToBoxAdapter(
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, 20, 24, 8),
        child: Text('Courses'),
      ),
    );
  }
}

class CourseListSection extends StatelessWidget {
  final List<CourseDetails> courses;
  final DashboardStats stats;
  final String selectedSemester;
  final String selectedYear;
  final bool bunkEnabled;

  final List<CourseInstructor> instructors;

  const CourseListSection({
    super.key,
    required this.courses,
    required this.stats,
    required this.selectedSemester,
    required this.selectedYear,
    required this.bunkEnabled,
    required this.instructors,
  });

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate((context, index) {
          final course = courses[index];
          final stat =
              stats.courseStats[course.safeId] ??
              CourseStat(id: course.safeId, code: course.code ?? course.safeId);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DisableAwareCourseCard(
              course: course,
              stat: stat,
              bunkResult: const utils.AttendanceResult(
                canBunk: 0,
                requiredToAttend: 0,
                targetPercentage: 75,
                isExact: false,
                isBorderline: false,
              ),
              bunkEnabled: bunkEnabled,
              selectedSemester: selectedSemester,
              selectedYear: selectedYear,
              instructors: instructors,
            ),
          );
        }, childCount: courses.length),
      ),
    );
  }
}
