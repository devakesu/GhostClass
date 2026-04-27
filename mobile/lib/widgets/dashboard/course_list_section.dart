import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/widgets/attendance/add_course_dialog.dart';
import 'package:ghostclass/widgets/dashboard/disable_aware_course_card.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class CourseLineupHeader extends StatelessWidget {
  const CourseLineupHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Your Courses Lineup',
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    fontStyle: FontStyle.italic,
                  ),
                ),
                const SizedBox(width: 8),
                const Text('⬇️📚', style: TextStyle(fontSize: 16)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Your current courses — organized for easy access.',
              style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                fontStyle: FontStyle.italic,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
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
  final double targetPercentage;

  final List<CourseInstructor> instructors;

  const CourseListSection({
    super.key,
    required this.courses,
    required this.stats,
    required this.selectedSemester,
    required this.selectedYear,
    required this.bunkEnabled,
    required this.targetPercentage,
    required this.instructors,
  });

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            // Add Course Card at the end
            if (index == courses.length) {
              return _AddCourseCard(
                semester: selectedSemester,
                academicYear: selectedYear,
              );
            }

            final course = courses[index];
            final stat = stats.courseStats[course.safeId] ??
                CourseStat(id: course.safeId, code: course.code ?? course.safeId);
            return Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: DisableAwareCourseCard(
                course: course,
                stat: stat,
                bunkResult: utils.calculateAttendance(
                  stat.finalPresent,
                  stat.finalTotal,
                  targetPercentage: targetPercentage,
                ),
                bunkEnabled: bunkEnabled,
                selectedSemester: selectedSemester,
                selectedYear: selectedYear,
                instructors: instructors,
              ),
            );
          },
          childCount: courses.length + 1,
        ),
      ),
    );
  }
}

class _AddCourseCard extends StatelessWidget {
  final String semester;
  final String academicYear;

  const _AddCourseCard({
    required this.semester,
    required this.academicYear,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => _showAddCourseDialog(context),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.4),
            width: 2,
            style: BorderStyle.solid, // Flutter doesn't have native dashed border easily
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                LucideIcons.plus,
                color: Theme.of(context).colorScheme.primary,
                size: 28,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Can\'t find a course?',
              style: GoogleFonts.manrope(
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Add it manually to start tracking your attendance immediately.',
              style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _showAddCourseDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AddCourseDialog(
        semester: semester,
        academicYear: academicYear,
      ),
    );
  }
}
