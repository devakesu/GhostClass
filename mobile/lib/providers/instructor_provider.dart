import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';

/// Provider for a specific course's instructor information.
final instructorProvider = Provider.family<CourseInstructor?, String>((ref, courseId) {
  final dashboardAsync = ref.watch(dashboardProvider);
  return dashboardAsync.when(
    data: (data) {
      for (final i in data.instructors) {
        if (i.courseCode.toString() == courseId) return i;
      }
      return null;
    },
    loading: () => null,
    error: (e, st) => null,
  );
});
