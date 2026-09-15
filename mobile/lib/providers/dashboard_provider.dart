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
import 'package:ghostclass/providers/profile_hydration_service.dart';
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
    this.trackingLoaded = true,
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

  /// False when the fast-path returned before tracking disk-cache resolved.
  /// The loading overlay should stay visible until this flips to true.
  final bool trackingLoaded;
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
  bool _isDisposed = false;
  // Buffers a tracking update that arrived while the dashboard was in a
  // loading state (e.g. during pull-to-refresh). Applied immediately after
  // the build/refresh completes to avoid the "tracking appears then goes" bug.
  TrackingState? _pendingTrackingFromListener;
  // The academic context at the time _pendingTrackingFromListener was captured.
  // Used to discard stale cross-academic-boundary buffered updates.
  AcademicState? _pendingTrackingAcademic;

  @override
  FutureOr<DashboardData> build() async {
    _isDisposed = false;
    ref.onDispose(() => _isDisposed = true);

    // 1. Reactive Dependency: Rebuild when auth user ID or academic status changes
    final userAsync = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    // If either core dependency is actively reloading (e.g. changing semester),
    // suspend the dashboard build to prevent showing a split-second stale UI.
    if (userAsync.isLoading || academicAsync.isLoading) {
      await Future.wait([
        if (userAsync.isLoading) ref.watch(authProvider.future),
        if (academicAsync.isLoading) ref.watch(academicProvider.future),
      ]);
    }

    // Re-read resolved values after any suspension — the captured AsyncValue
    // snapshots above reflect the loading-era state and may have null .value.
    final user = ref.read(authProvider).value ?? userAsync.value;
    final academic = ref.read(academicProvider).value ?? academicAsync.value;

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

    // Invalidate in-memory caches when academic term changes
    if (_lastAcademic != null && _lastAcademic != academic) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _needsRevalidate = true;
      // Discard any buffered tracking update from the previous academic period
      // so it is never mistakenly applied to the incoming (new) semester's data.
      _pendingTrackingFromListener = null;
    }
    _lastAcademic = academic;

    // Load Disk Cache (Secure Storage) if in-memory cache is empty
    final storage = ref.read(secureStorageProvider);
    final cacheKeySuffix = '${user.supabaseUserId}_${academic.cacheKeySuffix}';
    List<TrackingRecord>? cachedTrackingRecords;
    if (_cachedCourses == null || _cachedAttendance == null) {
      try {
        Future<dynamic> readWithFallback(String prefix) async {
          final canonicalData = await storage.getCachedData(
            '${prefix}_$cacheKeySuffix',
          );
          if (canonicalData != null) return canonicalData;
          final legacyKey =
              '${prefix}_${user.supabaseUserId}_${academic.semester}_${academic.year}';
          if (legacyKey != '${prefix}_$cacheKeySuffix') {
            return storage.getCachedData(legacyKey);
          }
          return null;
        }

        final results = await Future.wait([
          readWithFallback('dashboard_courses'),
          readWithFallback('dashboard_attendance'),
          readWithFallback('dashboard_instructors'),
          readWithFallback('tracking_records'),
          readWithFallback('tracking_report'),
        ]);
        final cachedCoursesRaw = results[0];
        var cachedAttendanceRaw = results[1];
        final cachedInstructorsRaw = results[2];
        final cachedRecordsRaw = results[3];
        final cachedTrackingReportRaw = results[4];

        if (cachedAttendanceRaw == null && cachedTrackingReportRaw is Map) {
          cachedAttendanceRaw = cachedTrackingReportRaw;
        }

        if (cachedCoursesRaw != null && cachedAttendanceRaw != null) {
          _cachedCourses = (cachedCoursesRaw as List)
              .map((c) => CourseDetails.fromJson(c as Map<String, dynamic>))
              .toList();
          _cachedAttendance = AttendanceReportDetailed.fromJson(
            Map<String, dynamic>.from(cachedAttendanceRaw as Map),
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
        if (cachedRecordsRaw is List) {
          cachedTrackingRecords = cachedRecordsRaw
              .map(
                (json) => TrackingRecord.fromJson(
                  Map<String, dynamic>.from(json as Map),
                ),
              )
              .toList();
        }
      } on Object catch (e) {
        AppLogger.e('DashboardNotifier: Error loading disk cache', e);
      }
    }

    // Seamlessly update dashboard state when tracking changes.
    // If dashboard is currently loading or courses are not yet resolved, buffer
    // the update and apply it immediately once the build completes.
    ref.listen<AsyncValue<TrackingState>>(trackingProvider, (previous, next) {
      final nextTracking = next.value;
      if (nextTracking == null) return;
      final currentAcademic = ref.read(academicProvider).value;
      // Guard: only apply tracking updates for the current academic period.
      // If the academic context has changed (e.g. mid-semester-switch), discard.
      if (currentAcademic == null || currentAcademic != _lastAcademic) return;

      final courses = _cachedCourses;
      final attendance = _cachedAttendance;

      if (courses == null || attendance == null || !state.hasValue) {
        // Buffer the update so build() applies it once courses and attendance exist.
        // Tag with the current academic so we can validate it on application.
        _pendingTrackingFromListener = nextTracking;
        _pendingTrackingAcademic = currentAcademic;
        return;
      }

      if (nextTracking.officialReport != null) {
        _cachedAttendance = nextTracking.officialReport;
      }
      final trackingList = nextTracking.groupedByCourse.values
          .expand((e) => e)
          .toList();

      state = AsyncValue.data(
        _processData(
          courses,
          _cachedAttendance!,
          trackingList,
          _lastAcademic!,
          _cachedInstructors ?? [],
        ),
      );

      final user = ref.read(authProvider).value;
      if (user != null) {
        final trackingKeySuffix =
            '${user.supabaseUserId}_${currentAcademic.cacheKeySuffix}';
        AppLogger.safeUnawait(
          storage.saveCachedData(
            'tracking_records_$trackingKeySuffix',
            trackingList.map((r) => r.toJson()).toList(),
          ),
          'DashboardNotifier: persist tracking records from listener',
        );
      }
    });

    // 2. Fast Path: If we have cached official data AND the term matches
    if (_cachedCourses != null &&
        _cachedAttendance != null &&
        _lastAcademic == academic) {
      final trackingAsync = ref.read(trackingProvider);
      final activeTracking = !trackingAsync.isLoading
          ? trackingAsync.value
          : null;
      if (activeTracking?.officialReport != null) {
        _cachedAttendance = activeTracking!.officialReport;
      }

      // Determine if we have tracking data from any source
      List<TrackingRecord> trackingList;
      bool trackingLoaded;
      if (activeTracking != null && activeTracking.groupedByCourse.isNotEmpty) {
        // Live tracking state is ready — use it
        trackingList = activeTracking.groupedByCourse.values
            .expand((e) => e)
            .toList();
        trackingLoaded = true;
      } else if (cachedTrackingRecords != null) {
        // Disk cache was available — use it
        trackingList = cachedTrackingRecords;
        trackingLoaded = true;
      } else {
        // No tracking data yet (disk cache miss, live not ready)
        // Return with trackingLoaded=false so the overlay stays up.
        trackingList = <TrackingRecord>[];
        trackingLoaded = false;
      }

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
        trackingLoaded: trackingLoaded,
      );
    }

    _needsRevalidate = false;
    _pendingTrackingFromListener = null;
    _pendingTrackingAcademic = null;

    // Cold-start slow path: no disk cache for dashboard.
    // Truly parallelize: fetch courses (EzyGo) AND wait for tracking to resolve.
    // EzygoBatchFetcher deduplicates the shared attendance request, so only ONE
    // network hit is made for attendance regardless of parallel execution.
    // This eliminates the serial dependency while preserving attendance reuse.
    final trackingFuture = ref.read(trackingProvider.future);
    final result = await _fetchAndProcess(
      <TrackingRecord>[],
      academic,
      null,
      parallelTrackingFuture: trackingFuture,
    );

    // Apply any tracking update that arrived during _fetchAndProcess, but ONLY
    // if it belongs to the same academic period as this build. Cross-academic
    // updates must be discarded to prevent zeros on semester/year switches.
    if (!_isDisposed && _cachedCourses != null && _cachedAttendance != null) {
      final pendingTracking = _pendingTrackingFromListener;
      final pendingAcademic = _pendingTrackingAcademic;
      final liveTracking = ref.read(trackingProvider).value;

      // Prefer the buffered update if it's for the current academic; otherwise
      // fall back to live tracking state if it also matches.
      TrackingState? toApply;
      if (pendingTracking != null && pendingAcademic == academic) {
        toApply = pendingTracking;
      } else if (liveTracking != null &&
          ref.read(academicProvider).value == academic) {
        toApply = liveTracking;
      }

      _pendingTrackingFromListener = null;
      _pendingTrackingAcademic = null;

      if (toApply != null) {
        if (toApply.officialReport != null) {
          _cachedAttendance = toApply.officialReport;
        }
        final trackingList = toApply.groupedByCourse.values
            .expand((e) => e)
            .toList();
        return _processData(
          _cachedCourses!,
          _cachedAttendance!,
          trackingList,
          academic,
          _cachedInstructors ?? [],
        );
      }
    }

    return result;
  }

  Future<DashboardData> _fetchAndProcess(
    List<TrackingRecord> tracking,
    AcademicState academic,
    AttendanceReportDetailed? trackedAttendance, {
    bool forceFreshAttendance = false,
    Future<TrackingState>? parallelTrackingFuture,
  }) async {
    try {
      if (_isDisposed) throw StateError('DashboardNotifier disposed');
      final api = ref.read(apiServiceProvider);
      final storage = ref.read(secureStorageProvider);

      final classId = ref.read(authProvider).value?.profile?.classField?.id;
      final attendanceToUse = trackedAttendance ?? _pendingTrackedAttendance;
      _pendingTrackedAttendance = null;

      late final Response<dynamic> coursesResponse;
      late final AttendanceReportDetailed attendance;
      var sharedCourses = <CourseDetails>[];
      var sharedInstructors = <CourseInstructor>[];

      Future<AttendanceReportDetailed?> resolveAttendance() async {
        if (!forceFreshAttendance) {
          final existing = attendanceToUse ?? _cachedAttendance;
          if (existing != null) return existing;
        }
        // If we have a parallel tracking future, await it to reuse its
        // officialReport — this avoids a duplicate EzyGo attendance fetch
        // since EzygoBatchFetcher deduplicates the request.
        if (parallelTrackingFuture != null) {
          try {
            final resolved = await parallelTrackingFuture;
            if (resolved.officialReport != null) return resolved.officialReport;
          } on Object catch (e) {
            AppLogger.e(
              'DashboardNotifier: parallelTrackingFuture failed, falling back to own attendance fetch',
              e,
            );
          }
        }
        return _fetchAttendanceOnce(api: api, storage: storage);
      }

      // Fetch courses (EzyGo) in parallel with attendance resolution.
      // When parallelTrackingFuture is set, resolveAttendance() awaits tracking,
      // so the true network calls (courses + attendance via tracking) run in parallel.
      await Future.wait<dynamic>([
        api.fetchCourses(storage).then((res) => coursesResponse = res),
        resolveAttendance().then((res) {
          if (res == null) throw Exception('No attendance data');
          attendance = res;
        }),
        if (classId != null) ...[
          // Fetch Class Courses
          Future.sync(() => api.fetchClassCourses(classId))
              .then((coursesRes) {
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
              })
              .catchError((Object e, StackTrace st) {
                AppLogger.e(
                  'DashboardNotifier: fetchClassCourses failed (graceful fallback)',
                  e,
                  st,
                );
              }),
          // Fetch Instructor Mappings
          Future.sync(() => api.fetchCourseInstructors(classId))
              .then((instructorsRes) {
                if (instructorsRes.isNotEmpty) {
                  sharedInstructors = instructorsRes
                      .map(
                        (json) => CourseInstructor.fromJson(
                          json as Map<String, dynamic>,
                        ),
                      )
                      .toList();
                }
              })
              .catchError((Object e, StackTrace st) {
                AppLogger.e(
                  'DashboardNotifier: fetchCourseInstructors failed (graceful fallback)',
                  e,
                  st,
                );
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
            '${user.supabaseUserId}_${academic.cacheKeySuffix}';
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

      var resolvedTracking = List<TrackingRecord>.from(tracking);
      if (resolvedTracking.isEmpty && parallelTrackingFuture != null) {
        try {
          final resolvedState = await parallelTrackingFuture;
          final records = resolvedState.groupedByCourse.values
              .expand((e) => e)
              .toList();
          if (records.isNotEmpty) {
            resolvedTracking = records;
          }
        } on Object catch (_) {}
      }
      if (resolvedTracking.isEmpty) {
        final activeTracking = ref.read(trackingProvider).value;
        if (activeTracking != null &&
            activeTracking.groupedByCourse.isNotEmpty) {
          resolvedTracking = activeTracking.groupedByCourse.values
              .expand((e) => e)
              .toList();
        }
      }

      return _processData(
        _cachedCourses!,
        _cachedAttendance!,
        resolvedTracking,
        academic,
        sharedInstructors,
      );
    } on Object catch (e) {
      if (!_isDisposed) {
        AppLogger.e('DashboardNotifier: Server fetch failed', e);
      }
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
    List<CourseInstructor> instructors, {
    bool trackingLoaded = true,
  }) {
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
    // Extract the class name from the active term's courses' userGroupName.
    // If unavailable (e.g. no courses yet or empty group name), fall back to profile class.
    String? finalClassName;
    final groupCounts = <String, int>{};
    for (final c in courses) {
      if (c.userGroupName != null && c.userGroupName!.trim().isNotEmpty) {
        final gName = c.userGroupName!.trim();
        groupCounts[gName] = (groupCounts[gName] ?? 0) + 1;
      }
    }
    if (groupCounts.isNotEmpty) {
      finalClassName = groupCounts.entries
          .reduce((a, b) => a.value > b.value ? a : b)
          .key;
    }

    final profileClassName = auth?.profile?.classField?.name;
    if ((finalClassName == null || finalClassName.isEmpty) &&
        profileClassName != null &&
        profileClassName.trim().isNotEmpty) {
      finalClassName = profileClassName.trim();
    }

    // --- SORTING LOGIC (WEBSITE PARITY) ---
    // Pre-calculate sorting criteria to avoid redundant math during sort
    final defaultTarget = (auth?.settings.targetPercentage ?? 75).toDouble();
    final courseTargets = auth?.settings.courseTargets ?? const <String, int>{};

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
              targetPercentage: () {
                final stdCode = utils.standardizeCourseCode(c.code ?? c.safeId);
                final val =
                    courseTargets[stdCode] ??
                    courseTargets[c.code] ??
                    courseTargets[c.safeId];
                return (val ?? defaultTarget).toDouble();
              }(),
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
      trackingLoaded: trackingLoaded,
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
      if (_isDisposed) return;
      final trackingState = ref.read(trackingProvider).value;
      final trackingToUse = tracking.isNotEmpty
          ? tracking
          : (trackingState?.groupedByCourse.values.expand((e) => e).toList() ??
                <TrackingRecord>[]);
      final freshData = await _fetchAndProcess(
        trackingToUse,
        academic,
        trackingState?.officialReport,
        forceFreshAttendance: true,
      );
      if (_isDisposed) return;
      final currentAcademic = ref.read(academicProvider).value;
      if (academic == currentAcademic) {
        state = AsyncValue.data(freshData);
      } else {
        AppLogger.i(
          'DashboardNotifier: Discarded stale silent revalidation for '
          '${academic.semester} ${academic.year} (current: ${currentAcademic?.semester} ${currentAcademic?.year})',
        );
      }
    } on Object catch (e) {
      if (_isDisposed) return;
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
            if (supabaseToken == null) return null;
            return ref
                .read(apiServiceProvider)
                .runCronSync(supabaseToken, force: true);
          },
          onSyncResult: (result) {
            if (result is CronSyncResult && result.hasChanges) {
              ref
                  .read(profileHydrationServiceProvider.notifier)
                  .handleCronSyncResult(result);
            }
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
      // Use canonical cache key suffix — matches what all cache writes use.
      final suffix = '${user.supabaseUserId}_${academic.cacheKeySuffix}';
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
    // Use canonical cache key suffix — matches what all cache reads/writes use.
    final cacheKeySuffix = '${user.supabaseUserId}_${academic.cacheKeySuffix}';
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
