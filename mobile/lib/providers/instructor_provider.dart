import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';

/// Provider for a specific course's instructor information.
// ignore: specify_nonobvious_property_types
final instructorProvider = Provider.family<CourseInstructor?, String>((
  ref,
  courseId,
) {
  final dashboardAsync = ref.watch(dashboardProvider);
  return dashboardAsync.when(
    data: (data) {
      final stdTarget = utils.standardizeCourseCode(courseId);
      for (final i in data.instructors) {
        if (utils.standardizeCourseCode(i.courseCode) == stdTarget) return i;
      }
      return null;
    },
    loading: () {
      return null;
    },
    error: (e, st) {
      return null;
    },
  );
});
