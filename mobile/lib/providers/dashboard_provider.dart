import 'dart:async';

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
import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;


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

  List<CourseDetails>? _cachedCourses;
  AttendanceReportDetailed? _cachedAttendance;
  List<CourseInstructor>? _cachedInstructors;
  AcademicState? _lastAcademic;

  @override
  FutureOr<DashboardData> build() async {
    // 1. Reactive Dependency: Rebuild when auth user ID or academic status changes
    final userAsync = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    final user = userAsync.value;
    final academic = academicAsync.value;

    if (user == null || academic == null) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
      throw Exception('Not authenticated');
    }

    // BLOCKER: Do not fire queries until Cron Sync is finished
    if (user.isSyncing) {
      if (_cachedCourses != null && _cachedAttendance != null) {
         return _processData(_cachedCourses!, _cachedAttendance!, [], academic, _cachedInstructors ?? []);
      }
      // Return a future that will be replaced once isSyncing changes
      return Completer<DashboardData>().future;
    }

    // Invalidate caches when account switches.
    if (_lastUserId != null && _lastUserId != user.supabaseUserId) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
    }
    _lastUserId = user.supabaseUserId;

    // Invalidate cache if academic changed
    if (_lastAcademic != null && _lastAcademic != academic) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
    }
    _lastAcademic = academic;

    // 2. Wait for tracking data
    final tracking = await ref.watch(trackingProvider.future);
    
    // Proactively update official report cache if tracking has a fresher one (e.g. from a sync)
    if (tracking.officialReport != null) {
      _cachedAttendance = tracking.officialReport;
    }
    
    final trackingList = tracking.groupedByCourse.values.expand((e) => e).toList();

    // 2.5 Logic moved to NavigationShell for centralized app-startup sync.

    // 3. Fast Path: If we have cached official data AND the term hasn't changed
    if (_cachedCourses != null && _cachedAttendance != null && _lastAcademic == academic) {
      return _processData(_cachedCourses!, _cachedAttendance!, trackingList, academic, _cachedInstructors ?? []);
    }
    
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

      final coursesResponse = await api.fetchCourses(storage);
      final attendance = trackedAttendance ??
          await _fetchAttendanceOnce(api: api, storage: storage);

      // 2. Fetch Shared Resources (Class Courses & Instructors)
      var sharedCourses = <CourseDetails>[];
      var sharedInstructors = <CourseInstructor>[];

      final classId = ref.read(authProvider).value?.profile?.classField?.id;
      if (classId != null) {
        final client = supabase.Supabase.instance.client;
        
        // Fetch Class Courses
        final coursesRes = await client
            .from('class_courses')
            .select()
            .eq('class_id', classId)
            .eq('academic_year', academic.year)
            .eq('semester', academic.semester);
        
        if (coursesRes.isNotEmpty) {
           sharedCourses = (coursesRes as List).map((raw) {
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

        // Fetch Instructor Mappings
        final instructorsRes = await client
            .from('course_instructors')
            .select()
            .eq('class_id', classId)
            .eq('semester', academic.semester)
            .eq('academic_year', academic.year);
        
        if (instructorsRes.isNotEmpty) {
          sharedInstructors = (instructorsRes as List)
              .map((json) => CourseInstructor.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }

      if (coursesResponse.statusCode == 401 || attendance == null) {
        throw Exception('Not authenticated');
      }

      if (coursesResponse.statusCode != 200 || coursesResponse.data is! List) {
        throw Exception(formatApiError(coursesResponse.data, 'Dashboard.Courses'));
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

      return _processData(_cachedCourses!, _cachedAttendance!, tracking, academic, sharedInstructors);
    } catch (e) {
      AppLogger.e('DashboardNotifier: Server fetch failed', e);
      rethrow;
    }
  }

  AttendanceReportDetailed _mergeAttendanceCourses(
      AttendanceReportDetailed attendance, List<CourseDetails> shared) {
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
    final disabledCodes = (disabledMap[semKey] as Map?)
            ?.keys
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
    var finalClassName = (profileClassName != null && profileClassName.trim().isNotEmpty) ? profileClassName : null;

    if (finalClassName == null) {
      final groupCounts = <String, int>{};
      for (final c in courses) {
        if (c.userGroupName != null && c.userGroupName!.isNotEmpty) {
          groupCounts[c.userGroupName!] = (groupCounts[c.userGroupName!] ?? 0) + 1;
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
    
    int getTier(CourseStat? s, {required bool disabled}) {
      if (disabled) return 2; // Absolute bottom
      if (s == null || s.finalTotal == 0) return 1;
      return 0;
    }

    final metaMap = <String, ({int tier, int canBunk, int safeCanBunk, int requiredToAttend})>{
      for (final c in courses)
        c.safeId: (() {
          final s = stats.courseStats[c.safeId];
          final disabled = disabledCodes.contains(utils.standardizeCourseCode(c.code ?? ''));
          final tier = getTier(s, disabled: disabled);
          
          if (s == null) {
            return (tier: tier, canBunk: 0, safeCanBunk: 0, requiredToAttend: 0);
          }

          final bunkRes = utils.calculateAttendance(s.finalPresent, s.finalTotal, targetPercentage: target);
          final safeRes = utils.calculateAttendance(s.officialPresent, s.officialTotal, targetPercentage: target);

          return (
            tier: tier,
            canBunk: bunkRes.canBunk,
            safeCanBunk: safeRes.canBunk,
            requiredToAttend: bunkRes.requiredToAttend,
          );
        })()
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
  Future<void> refresh() async {
    ref.invalidate(notificationsProvider);
    final user = ref.read(authProvider).value;
    final api = ref.read(apiServiceProvider);
    final supabaseToken = supabase.Supabase.instance.client.auth.currentSession?.accessToken;
    
    // 0. Set local loading state
    state = const AsyncValue.loading();

    if (user != null && supabaseToken != null) {
      // 1. Trigger the server-side sync (this updates the database)
      // We await this to ensure the server has latest data before we fetch it back
      await api.triggerSync(supabaseToken, force: true);
      
      // 2. Fetch the fresh profile from the server
      await ref.read(authProvider.notifier).refreshProfile(force: true, sync: true);
    }

    // 3. Refresh Tracking (Official Report + Tracker Records)
    // We don't need forceSync: true here because we already triggered it above
    await ref.read(trackingProvider.notifier).refresh();

    // 4. Force a rebuild of the dashboard with fresh data
    // We clear local caches to ensure we don't return stale combined data
    _cachedCourses = null;
    _cachedAttendance = null;
    _cachedInstructors = null;
    _lastAcademic = null;
    
    state = await AsyncValue.guard(() async {
      final academicAsync = ref.read(academicProvider);
      final academic = academicAsync.value;
      if (academic == null) throw Exception('No academic context');
      
      final trackingState = await ref.read(trackingProvider.future);
      final tracking = trackingState.groupedByCourse.values.expand((e) => e).toList();
      return _fetchAndProcess(tracking, academic, trackingState.officialReport);
    });
  }

  Future<void> setSemester(String sem) async {
    await ref.read(academicProvider.notifier).setSemester(sem);
  }

  Future<void> setYear(String year) async {
    await ref.read(academicProvider.notifier).setYear(year);
  }
}

final dashboardProvider = AsyncNotifierProvider<DashboardNotifier, DashboardData>(DashboardNotifier.new);
