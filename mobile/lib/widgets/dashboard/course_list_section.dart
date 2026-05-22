import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/widgets/attendance/add_course_dialog.dart';
import 'package:ghostclass/widgets/dashboard/disable_aware_course_card.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

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
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white
                        : Theme.of(context).colorScheme.onSurface,
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
                fontWeight: FontWeight.w600,
                fontStyle: FontStyle.italic,
                color: Theme.of(context).colorScheme.onSurface,
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
  const CourseListSection({
    required this.courses,
    required this.stats,
    required this.selectedSemester,
    required this.selectedYear,
    required this.bunkEnabled,
    required this.targetPercentage,
    required this.instructors,
    super.key,
    this.className,
  });
  final List<CourseDetails> courses;
  final DashboardStats stats;
  final String selectedSemester;
  final String selectedYear;
  final bool bunkEnabled;
  final double targetPercentage;
  final List<CourseInstructor> instructors;
  final String? className;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            // Add Course Card at the end
            if (index == courses.length) {
              return _AddCourseCard(
                semester: selectedSemester,
                academicYear: selectedYear,
                className: className,
              );
            }

            final course = courses[index];
            final stat =
                stats.courseStats[course.safeId] ??
                CourseStat(
                  id: course.safeId,
                  code: course.code ?? course.safeId,
                );
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
                className: className,
              ),
            );
          },
          childCount: courses.length + 1,
        ),
      ),
    );
  }
}

class _AddCourseCard extends ConsumerWidget {
  const _AddCourseCard({
    required this.semester,
    required this.academicYear,
    this.className,
  });
  final String semester;
  final String academicYear;
  final String? className;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(authProvider).value?.profile;
    final hasNoClass = profile?.classField?.id == null || profile!.classField!.id.isEmpty;

    return Semantics(
      button: true,
      label: 'Add a manual course to your lineup',
      child: Opacity(
        opacity: hasNoClass ? 0.5 : 1.0,
        child: Container(
          margin: const EdgeInsets.only(top: 8),
          child: InkWell(
            onTap: () {
              if (hasNoClass) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: const Text('You have not assigned a class yet.'),
                    backgroundColor: Theme.of(context).colorScheme.error,
                  ),
                );
                return;
              }
              _showAddCourseDialog(context);
            },
            borderRadius: BorderRadius.circular(24),
            child: Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
                    Theme.of(context).colorScheme.primary.withValues(alpha: 0.03),
                  ],
                ),
                border: Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.primary.withValues(alpha: 0.15),
                  width: 1.5,
                ),
              ),
              child: Stack(
                children: [
                  // Decorative Background Circle
                  Positioned(
                    right: -20,
                    top: -20,
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0.08),
                            Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Row(
                      children: [
                        // Icon Container
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Theme.of(
                                  context,
                                ).colorScheme.primary.withValues(alpha: 0.3),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Icon(
                            LucideIcons.plusCircle,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                        const SizedBox(width: 20),
                        // Text Content
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                "Can't find a course?",
                                style: GoogleFonts.manrope(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                  color: Theme.of(context).colorScheme.onSurface,
                                  letterSpacing: -0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Add it manually to your lineup\nand start tracking.',
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurface.withValues(alpha: 0.5),
                                  height: 1.3,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          LucideIcons.chevronRight,
                          size: 20,
                          color: Theme.of(
                            context,
                          ).colorScheme.primary.withValues(alpha: 0.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showAddCourseDialog(BuildContext context) {
    final _ = showDialog<void>(
      context: context,
      builder: (context) => AddCourseDialog(
        semester: semester,
        academicYear: academicYear,
        className: className,
      ),
    );
  }
}
