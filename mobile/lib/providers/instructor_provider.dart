import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/services/logger.dart';

/// Provider for a specific course's instructor information.
final instructorProvider = Provider.family<CourseInstructor?, String>((ref, courseId) {
  final dashboardAsync = ref.watch(dashboardProvider);
  return dashboardAsync.when(
    data: (data) {
      try {
        return data.instructors.firstWhere((i) => i.courseCode.toString() == courseId);
      } catch (e, st) {
        AppLogger.e('InstructorProvider: Failed to resolve instructor', e, st);
        return null;
      }
    },
    loading: () => null,
    error: (e, st) => null,
  );
});
