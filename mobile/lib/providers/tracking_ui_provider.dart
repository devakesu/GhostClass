import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';

/// Provider that handles complex sorting and filtering of tracking course keys.
/// This prevents expensive build-time sorting in TrackingScreen.
final trackingSortedKeysProvider = Provider<List<String>>((ref) {
  final trackingState = ref.watch(trackingProvider).value;
  final dashboard = ref.watch(dashboardProvider).value;
  final auth = ref.watch(authProvider).value;

  if (trackingState == null) return const [];

  final uniqueKeys = <String>{
    ...trackingState.groupedByCourse.keys.where(
      (k) => trackingState.groupedByCourse[k]?.isNotEmpty ?? false,
    ),
  };

  final courseKeys = uniqueKeys.toList();
  final disabledMap = auth?.settings.disabledCourses ?? {};
  final semKey = '${dashboard?.selectedYear}-${dashboard?.selectedSemester}';
  final disabledCodes =
      (disabledMap[semKey] as Map?)?.keys
          .map((c) => c.toString().toUpperCase())
          .toSet() ??
      <String>{};

  courseKeys.sort((a, b) {
    final mergedA = (dashboard?.courses ?? [])
        .cast<CourseDetails?>()
        .firstWhere((c) => c?.safeId == a, orElse: () => null);
    final mergedB = (dashboard?.courses ?? [])
        .cast<CourseDetails?>()
        .firstWhere((c) => c?.safeId == b, orElse: () => null);

    final codeA = utils.resolveCourseDisplayCode(
      courseKey: a,
      mergedCourse: mergedA,
      officialReport: trackingState.officialReport,
    );
    final codeB = utils.resolveCourseDisplayCode(
      courseKey: b,
      mergedCourse: mergedB,
      officialReport: trackingState.officialReport,
    );

    final aDisabled = disabledCodes.contains((codeA ?? '').toUpperCase());
    final bDisabled = disabledCodes.contains((codeB ?? '').toUpperCase());

    // Tier 1: Disabled at the bottom
    if (aDisabled != bDisabled) return aDisabled ? 1 : -1;

    // Tier 2: Alpha sort
    final nameA = utils.resolveCourseDisplayName(
      courseKey: a,
      mergedCourse: mergedA,
      officialReport: trackingState.officialReport,
    );
    final nameB = utils.resolveCourseDisplayName(
      courseKey: b,
      mergedCourse: mergedB,
      officialReport: trackingState.officialReport,
    );
    return nameA.toLowerCase().compareTo(nameB.toLowerCase());
  });

  return courseKeys;
});
