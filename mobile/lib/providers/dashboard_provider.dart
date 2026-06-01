import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/refresh_coordinator.dart';
import 'package:ghostclass/services/secure_storage.dart';

class DashboardData {
  DashboardData({
    required this.courses,
    required this.attendance,
    required this.tracking,
    required this.stats,
    required this.selectedSemester,
    required this.selectedYear,
    this.instructors = const [],
    this.className,
    this.disabledCodes = const {},
  });
  final List<CourseDetails> courses;
  final AttendanceReportDetailed attendance;
  final List<TrackingRecord> tracking;
  final DashboardStats stats;
  final String selectedSemester;
  final String selectedYear;
  final List<CourseInstructor> instructors;
  final String? className;
  final Set<String> disabledCodes;
}

class DashboardNotifier extends AsyncNotifier<DashboardData> {
  // Cached per signed-in user to avoid leaking across accounts.
  String? _lastUserId;
  String? _lastClassId;

  List<CourseDetails>? _cachedCourses;
  AttendanceReportDetailed? _cachedAttendance;
  List<CourseInstructor>? _cachedInstructors;
  AcademicState? _lastAcademic;
  AttendanceReportDetailed? _pendingTrackedAttendance;

  bool _needsRevalidate = true;

  @override
  FutureOr<DashboardData> build() async {
    // 1. Reactive Dependency: Rebuild when auth user ID or academic status changes
    final userAsync = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);
    final trackingFuture = ref.watch(trackingProvider.future);

    // If either core dependency is actively reloading (e.g. changing semester),
    // suspend the dashboard build to prevent showing a split-second stale UI.
    if (userAsync.isLoading || academicAsync.isLoading) {
      await Future.wait([
        if (userAsync.isLoading) ref.watch(authProvider.future),
        if (academicAsync.isLoading) ref.watch(academicProvider.future),
      ]);
    }

    final user = userAsync.value;
    final academic = academicAsync.value;

    if (user == null || academic == null) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
      _lastClassId = null;
      _needsRevalidate = true;
      throw Exception('Not authenticated');
    }

    // Invalidate caches when account switches.
    if (_lastUserId != null && _lastUserId != user.supabaseUserId) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
      _lastClassId = null;
      _needsRevalidate = true;
    }
    _lastUserId = user.supabaseUserId;

    // Invalidate caches when class changes.
    final classId = user.profile?.classField?.id;
    if (_lastClassId != null && _lastClassId != classId) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
      _needsRevalidate = true;
    }
    _lastClassId = classId;

    // Invalidate cache if academic changed
    if (_lastAcademic != null && _lastAcademic != academic) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _needsRevalidate = true;
    }
    _lastAcademic = academic;

    // Load Disk Cache (Secure Storage) if in-memory cache is empty
    final storage = ref.read(secureStorageProvider);
    final cacheKeySuffix =
        '${user.supabaseUserId}_${academic.semester}_${academic.year}';
    if (_cachedCourses == null || _cachedAttendance == null) {
      try {
        final results = await Future.wait([
          storage.getCachedData('dashboard_courses_$cacheKeySuffix'),
          storage.getCachedData('dashboard_attendance_$cacheKeySuffix'),
          storage.getCachedData('dashboard_instructors_$cacheKeySuffix'),
        ]);
        final cachedCoursesRaw = results[0];
        final cachedAttendanceRaw = results[1];
        final cachedInstructorsRaw = results[2];

        if (cachedCoursesRaw != null && cachedAttendanceRaw != null) {
          _cachedCourses = (cachedCoursesRaw as List)
              .map((c) => CourseDetails.fromJson(c as Map<String, dynamic>))
              .toList();
          _cachedAttendance = AttendanceReportDetailed.fromJson(
            cachedAttendanceRaw as Map<String, dynamic>,
          );
          if (cachedInstructorsRaw != null) {
            _cachedInstructors = (cachedInstructorsRaw as List)
                .map(
                  (i) => CourseInstructor.fromJson(i as Map<String, dynamic>),
                )
                .toList();
          } else {
            _cachedInstructors = [];
          }
        }
      } on Object catch (e) {
        AppLogger.e('DashboardNotifier: Error loading disk cache', e);
      }
    }

    // 2. Wait for tracking data
    final tracking = await trackingFuture;

    // Proactively update official report cache if tracking has a fresher one (e.g. from a sync)
    if (tracking.officialReport != null) {
      _cachedAttendance = tracking.officialReport;
    }

    final trackingList = tracking.groupedByCourse.values
        .expand((e) => e)
        .toList();

    // 3. Fast Path: If we have cached official data AND the term hasn't changed
    if (_cachedCourses != null &&
        _cachedAttendance != null &&
        _lastAcademic == academic) {
      if (_needsRevalidate) {
        _needsRevalidate = false;
        AppLogger.safeUnawait(
          Future.microtask(
            () => _silentRevalidate(trackingList, academic),
          ).catchError(
            (Object e, StackTrace st) {
              AppLogger.e(
                'DashboardNotifier: Silent revalidate failed',
                e,
                st,
              );
            },
          ),
          'DashboardNotifier: silent revalidate',
        );
      }

      return _processData(
        _cachedCourses!,
        _cachedAttendance!,
        trackingList,
        academic,
        _cachedInstructors ?? [],
      );
    }

    _needsRevalidate = false;
    return _fetchAndProcess(trackingList, academic, tracking.officialReport);
  }

  Future<DashboardData> _fetchAndProcess(
    List<TrackingRecord> tracking,
    AcademicState academic,
    AttendanceReportDetailed? trackedAttendance,
  ) async {
    try {
      final api = ref.read(apiServiceProvider);
      final storage = ref.read(secureStorageProvider);

      final classId = ref.read(authProvider).value?.profile?.classField?.id;
      final attendanceToUse = trackedAttendance ?? _pendingTrackedAttendance;
      _pendingTrackedAttendance = null;

      late final Response<dynamic> coursesResponse;
      late final AttendanceReportDetailed attendance;
      var sharedCourses = <CourseDetails>[];
      var sharedInstructors = <CourseInstructor>[];

      await Future.wait([
        api.fetchCourses(storage).then((res) => coursesResponse = res),
        (attendanceToUse != null
                ? Future.value(attendanceToUse)
                : _fetchAttendanceOnce(api: api, storage: storage))
            .then((res) {
              if (res == null) throw Exception('No attendance data');
              attendance = res;
            }),
        if (classId != null) ...[
          // Fetch Class Courses
          api.fetchClassCourses(classId).then((coursesRes) {
            if (coursesRes.isNotEmpty) {
              sharedCourses = coursesRes.map((raw) {
                final c = raw as Map<String, dynamic>;
                return CourseDetails(
                  id: 0, // Mark as shared/custom
                  name: c['course_name'] as String? ?? 'Unnamed Course',
                  code: c['course_code'] as String?,
                  academicYear: academic.year,
                  academicSemester: academic.semester,
                );
              }).toList();
            }
          }),
          // Fetch Instructor Mappings
          api.fetchCourseInstructors(classId).then((instructorsRes) {
            if (instructorsRes.isNotEmpty) {
              sharedInstructors = instructorsRes
                  .map(
                    (json) => CourseInstructor.fromJson(
                      json as Map<String, dynamic>,
                    ),
                  )
                  .toList();
            }
          }),
        ],
      ]);

      if (coursesResponse.statusCode == 401) {
        throw Exception('Not authenticated');
      }

      if (coursesResponse.statusCode != 200 || coursesResponse.data is! List) {
        throw Exception(
          formatApiError(coursesResponse.data, 'Dashboard.Courses'),
        );
      }

      final officialCourses = (coursesResponse.data as List)
          .map((c) => CourseDetails.fromJson(c as Map<String, dynamic>))
          .toList();

      // Merge Shared Courses (Priority to Official if code matches, but we add non-existent ones)
      final merged = <String, CourseDetails>{};
      for (final c in officialCourses) {
        final code = (c.code ?? '').toUpperCase();
        if (code.isNotEmpty) merged[code] = c;
      }
      for (final c in sharedCourses) {
        final code = (c.code ?? '').toUpperCase();
        if (code.isNotEmpty && !merged.containsKey(code)) {
          merged[code] = c;
        }
      }

      _cachedCourses = merged.values.toList();
      _cachedAttendance = _mergeAttendanceCourses(attendance, sharedCourses);
      _cachedInstructors = sharedInstructors;

      final user = ref.read(authProvider).value;
      if (user != null) {
        final cacheKeySuffix =
            '${user.supabaseUserId}_${academic.semester}_${academic.year}';
        AppLogger.safeUnawait(
          storage.saveCachedData(
            'dashboard_courses_$cacheKeySuffix',
            _cachedCourses!.map((c) => c.toJson()).toList(),
          ),
          'Dashboard: save courses cache',
        );
        AppLogger.safeUnawait(
          storage.saveCachedData(
            'dashboard_attendance_$cacheKeySuffix',
            _cachedAttendance!.toJson(),
          ),
          'Dashboard: save attendance cache',
        );
        AppLogger.safeUnawait(
          storage.saveCachedData(
            'dashboard_instructors_$cacheKeySuffix',
            _cachedInstructors!.map((i) => i.toJson()).toList(),
          ),
          'Dashboard: save instructors cache',
        );
      }

      return _processData(
        _cachedCourses!,
        _cachedAttendance!,
        tracking,
        academic,
        sharedInstructors,
      );
    } on Object catch (e) {
      AppLogger.e('DashboardNotifier: Server fetch failed', e);
      rethrow;
    }
  }

  AttendanceReportDetailed _mergeAttendanceCourses(
    AttendanceReportDetailed attendance,
    List<CourseDetails> shared,
  ) {
    final mergedMap = Map<String, AttendanceCourse>.from(attendance.courses);
    for (final c in shared) {
      final stdCode = utils.standardizeCourseCode(c.code ?? '');
      if (stdCode.isNotEmpty && !mergedMap.containsKey(stdCode)) {
        mergedMap[stdCode] = AttendanceCourse(
          id: 0,
          name: c.name,
          code: c.code,
        );
      }
    }
    return AttendanceReportDetailed(
      studentAttendanceData: attendance.studentAttendanceData,
      courses: mergedMap,
      attendanceDates: attendance.attendanceDates,
      sessions: attendance.sessions,
    );
  }

  Future<AttendanceReportDetailed?> _fetchAttendanceOnce({
    required ApiService api,
    required SecureStorageService storage,
  }) async {
    // Avoid double-fetch when tracking already provided one.
    final res = await api.fetchAttendanceReportDetailed(storage);
    if (res.statusCode != 200 || res.data is! Map) {
      throw Exception(formatApiError(res.data, 'Dashboard.Attendance'));
    }
    return AttendanceReportDetailed.fromJson(res.data as Map<String, dynamic>);
  }

  DashboardData _processData(
    List<CourseDetails> courses,
    AttendanceReportDetailed attendance,
    List<TrackingRecord> tracking,
    AcademicState academic,
    List<CourseInstructor> instructors,
  ) {
    final auth = ref.read(authProvider).value;
    final disabledMap = auth?.settings.disabledCourses ?? {};
    final semKey = '${academic.year}-${academic.semester}';
    final disabledCodes =
        (disabledMap[semKey] as Map?)?.keys
            .map((c) => DashboardStats.standardize(c.toString()))
            .toSet() ??
        <String>{};

    final stats = DashboardStats.calculate(
      attendanceData: attendance,
      trackingRecords: tracking,
      selectedSemester: academic.semester,
      selectedYear: academic.year,
      disabledCourseCodes: disabledCodes,
      allCourses: courses, // Pass full list
    );

    // --- CLASS NAME EXTRACTION ---
    // We prioritize the explicit class name from the user's profile.
    // If not available, we fall back to deriving it from the courses' userGroupName.
    final profileClassName = auth?.profile?.classField?.name;
    var finalClassName =
        (profileClassName != null && profileClassName.trim().isNotEmpty)
        ? profileClassName
        : null;

    if (finalClassName == null) {
      final groupCounts = <String, int>{};
      for (final c in courses) {
        if (c.userGroupName != null && c.userGroupName!.isNotEmpty) {
          groupCounts[c.userGroupName!] =
              (groupCounts[c.userGroupName!] ?? 0) + 1;
        }
      }
      if (groupCounts.isNotEmpty) {
        finalClassName = groupCounts.entries
            .reduce((a, b) => a.value > b.value ? a : b)
            .key;
      }
    }

    // --- SORTING LOGIC (WEBSITE PARITY) ---
    // Pre-calculate sorting criteria to avoid redundant math during sort
    final target = (auth?.settings.targetPercentage ?? 75).toDouble();

    final metaMap =
        <
          String,
          ({int tier, int canBunk, int safeCanBunk, int requiredToAttend})
        >{
          for (final c in courses)
            c.safeId: _computeCourseMeta(
              course: c,
              stats: stats,
              disabledCodes: disabledCodes,
              targetPercentage: target,
            ),
        };

    final sortedCourses = List<CourseDetails>.from(courses)
      ..sort((a, b) {
        final metaA = metaMap[a.safeId]!;
        final metaB = metaMap[b.safeId]!;

        if (metaA.tier != metaB.tier) return metaA.tier.compareTo(metaB.tier);

        if (metaA.tier == 0) {
          // 1. Safety Sort: Bunkable (Descending)
          var cmp = metaB.canBunk.compareTo(metaA.canBunk);
          if (cmp != 0) return cmp;

          // 2. Tie-breaker: Safe Bunkable (Official Only)
          cmp = metaB.safeCanBunk.compareTo(metaA.safeCanBunk);
          if (cmp != 0) return cmp;

          // 3. Safety Sort: Required to Attend (Ascending)
          cmp = metaA.requiredToAttend.compareTo(metaB.requiredToAttend);
          if (cmp != 0) return cmp;
        }

        // Fallback: Alpha Sort by Name
        return a.name.compareTo(b.name);
      });

    return DashboardData(
      courses: sortedCourses,
      attendance: attendance,
      tracking: tracking,
      stats: stats,
      selectedSemester: academic.semester,
      selectedYear: academic.year,
      instructors: instructors,
      className: finalClassName,
      disabledCodes: disabledCodes,
    );
  }

  ({int tier, int canBunk, int safeCanBunk, int requiredToAttend})
  _computeCourseMeta({
    required CourseDetails course,
    required DashboardStats stats,
    required Set<String> disabledCodes,
    required double targetPercentage,
  }) {
    final s = stats.courseStats[course.safeId];
    final disabled = disabledCodes.contains(
      utils.standardizeCourseCode(course.code ?? ''),
    );

    final int tier;
    if (disabled) {
      tier = 2; // Absolute bottom
    } else if (s == null || s.finalTotal == 0) {
      tier = 1;
    } else {
      tier = 0;
    }

    if (s == null) {
      return (
        tier: tier,
        canBunk: 0,
        safeCanBunk: 0,
        requiredToAttend: 0,
      );
    }

    final bunkRes = utils.calculateAttendance(
      s.finalPresent,
      s.finalTotal,
      targetPercentage: targetPercentage,
    );
    final safeRes = utils.calculateAttendance(
      s.officialPresent,
      s.officialTotal,
      targetPercentage: targetPercentage,
    );

    return (
      tier: tier,
      canBunk: bunkRes.canBunk,
      safeCanBunk: safeRes.canBunk,
      requiredToAttend: bunkRes.requiredToAttend,
    );
  }

  Future<void> _silentRevalidate(
    List<TrackingRecord> tracking,
    AcademicState academic,
  ) async {
    try {
      final trackingState = ref.read(trackingProvider).value;
      final freshData = await _fetchAndProcess(
        tracking,
        academic,
        trackingState?.officialReport,
      );
      final currentAcademic = ref.read(academicProvider).value;
      if (academic.semester == currentAcademic?.semester &&
          academic.year == currentAcademic?.year) {
        state = AsyncValue.data(freshData);
      } else {
        AppLogger.i(
          'DashboardNotifier: Discarded stale silent revalidation for '
          '${academic.semester} ${academic.year} (current: ${currentAcademic?.semester} ${currentAcademic?.year})',
        );
      }
    } on Object catch (e) {
      AppLogger.e(
        'DashboardNotifier: Silent background revalidation failed',
        e,
      );
    }
  }

  Future<void> refresh() async {
    final user = ref.read(authProvider).value;

    // 0. Set local loading state
    state = const AsyncValue.loading();

    Object? refreshError;
    StackTrace? refreshStackTrace;

    if (user != null) {
      try {
        await runUnifiedPullToRefresh(
          invalidateNotifications: () => ref.invalidate(notificationsProvider),
          logLabel: 'DashboardNotifier',
          refreshProfile: () =>
              ref.read(authProvider.notifier).refreshProfile(force: true),
          syncCron: () async {
            final supabaseToken = ref
                .read(supabaseClientProvider)
                .auth
                .currentSession
                ?.accessToken;
            if (supabaseToken == null) return;
            await ref
                .read(apiServiceProvider)
                .triggerSync(supabaseToken, force: true);
          },
          refreshData: () => ref.read(trackingProvider.notifier).refresh(),
        );
        _pendingTrackedAttendance = ref
            .read(trackingProvider)
            .value
            ?.officialReport;
      } on Object catch (e, st) {
        AppLogger.e('DashboardNotifier: refresh coordinator failed', e, st);
        refreshError = e;
        refreshStackTrace = st;
      } finally {
        // Clear disk cache only when refresh succeeds to avoid leaving the app
        // with no fallback data during connectivity issues.
        if (refreshError == null) {
          final storage = ref.read(secureStorageProvider);
          final academicAsync = ref.read(academicProvider);
          final academic = academicAsync.value;
          if (academic != null) {
            final suffix =
                '${user.supabaseUserId}_${academic.semester}_${academic.year}';
            await Future.wait([
              storage.deleteCachedData('dashboard_courses_$suffix'),
              storage.deleteCachedData('dashboard_attendance_$suffix'),
              storage.deleteCachedData('dashboard_instructors_$suffix'),
            ]);
          }
        }
      }
    }

    // 4. Force a rebuild of the dashboard with fresh data
    // We clear local caches to ensure we don't return stale combined data
    _cachedCourses = null;
    _cachedAttendance = null;
    _cachedInstructors = null;
    _lastAcademic = null;
    _needsRevalidate = true;

    ref.invalidateSelf();
    await future;

    if (refreshError != null) {
      Error.throwWithStackTrace(
        refreshError,
        refreshStackTrace ?? StackTrace.current,
      );
    }
  }

  Future<void> refreshAfterCourseAdded() async {
    final user = ref.read(authProvider).value;
    final academic = ref.read(academicProvider).value;
    if (user != null && academic != null) {
      final storage = ref.read(secureStorageProvider);
      final suffix =
          '${user.supabaseUserId}_${academic.semester}_${academic.year}';
      await storage.deleteCachedData('dashboard_courses_$suffix');
    }
    _cachedCourses = null;
    _needsRevalidate = true;
    ref.invalidateSelf();
    await future;
  }

  Future<void> updateLocalInstructor(
    String courseCode,
    String instructorName,
  ) async {
    final user = ref.read(authProvider).value;
    final academic = ref.read(academicProvider).value;
    if (user == null || academic == null) return;

    final stdCode = courseCode.toUpperCase().replaceAll(' ', '');

    // 1. Update in-memory cache
    final updatedList = List<CourseInstructor>.from(_cachedInstructors ?? []);
    final index = updatedList.indexWhere(
      (i) => i.courseCode.toUpperCase().replaceAll(' ', '') == stdCode,
    );

    final updatedInstructor = CourseInstructor(
      courseCode: courseCode,
      instructorName: instructorName,
    );

    if (index >= 0) {
      updatedList[index] = updatedInstructor;
    } else {
      updatedList.add(updatedInstructor);
    }
    _cachedInstructors = updatedList;

    // 2. Persist to disk cache
    final storage = ref.read(secureStorageProvider);
    final cacheKeySuffix =
        '${user.supabaseUserId}_${academic.semester}_${academic.year}';
    await storage.saveCachedData(
      'dashboard_instructors_$cacheKeySuffix',
      updatedList.map((i) => i.toJson()).toList(),
    );

    // 3. Update active Riverpod state if it has data
    if (state.hasValue) {
      final currentData = state.value!;
      state = AsyncValue.data(
        DashboardData(
          courses: currentData.courses,
          attendance: currentData.attendance,
          tracking: currentData.tracking,
          stats: currentData.stats,
          selectedSemester: currentData.selectedSemester,
          selectedYear: currentData.selectedYear,
          instructors: updatedList,
          className: currentData.className,
          disabledCodes: currentData.disabledCodes,
        ),
      );
    }
  }

  Future<void> setSemester(String sem) async {
    await ref.read(academicProvider.notifier).setSemester(sem);
  }

  Future<void> setYear(String year) async {
    await ref.read(academicProvider.notifier).setYear(year);
  }
}

final dashboardProvider =
    AsyncNotifierProvider<DashboardNotifier, DashboardData>(
      DashboardNotifier.new,
    );
