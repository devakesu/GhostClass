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
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;


class DashboardData {
  final List<CourseDetails> courses;
  final AttendanceReportDetailed attendance;
  final List<TrackingRecord> tracking;
  final DashboardStats stats;
  final String selectedSemester;
  final String selectedYear;
  final List<CourseInstructor> instructors;
  final String? className;
  final Set<String> disabledCodes;

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
    // Using select to prevent rebuilding the dashboard on irrelevant auth updates (e.g. avatar change)
    ref.watch(authProvider.select((state) => state.value?.ezygoToken));
    final isAuthLoading = ref.watch(authProvider.select((state) => state.isLoading));
    final academicAsync = ref.watch(academicProvider);

    // 2. Wait for dependencies to resolve before proceeding.
    if (isAuthLoading || academicAsync.isLoading) {
      final u = await ref.watch(authProvider.future);
      final acad = await ref.watch(academicProvider.future);
      if (u == null || acad == null) throw Exception('Not authenticated');
    }

    final user = await ref.read(authProvider.future);
    final academic = academicAsync.value;

    if (user == null || academic == null) {
      _cachedCourses = null;
      _cachedAttendance = null;
      _cachedInstructors = null;
      _lastAcademic = null;
      throw Exception('Not authenticated');
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
      final AttendanceReportDetailed? attendance = trackedAttendance ??
          await _fetchAttendanceOnce(api: api, storage: storage);

      // 2. Fetch Shared Resources (Class Courses & Instructors)
      List<CourseDetails> sharedCourses = [];
      List<CourseInstructor> sharedInstructors = [];

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
           sharedCourses = (coursesRes as List).map((c) => CourseDetails(
             id: 0, // Mark as shared/custom
             name: c['course_name'] as String? ?? 'Unnamed Course',
             code: c['course_code'] as String?,
             academicYear: academic.year,
             academicSemester: academic.semester,
           )).toList();
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

      final List<CourseDetails> officialCourses = (coursesResponse.data as List)
          .map((c) => CourseDetails.fromJson(c as Map<String, dynamic>))
          .toList();

      // Merge Shared Courses (Priority to Official if code matches, but we add non-existent ones)
      final Map<String, CourseDetails> merged = {};
      for (var c in officialCourses) {
        final code = (c.code ?? '').toUpperCase();
        if (code.isNotEmpty) merged[code] = c;
      }
      for (var c in sharedCourses) {
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
    final Map<String, AttendanceCourse> mergedMap = Map.from(attendance.courses);
    for (var c in shared) {
      final code = (c.code ?? '').toUpperCase();
      if (code.isNotEmpty && !mergedMap.containsKey(code)) {
        mergedMap[code] = AttendanceCourse(
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
    final Set<String> disabledCodes = (disabledMap[semKey] as Map?)
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
    // Extract the most frequent non-null userGroupName from official courses
    String? derivedClassName;
    final Map<String, int> groupCounts = {};
    for (var c in courses) {
      if (c.userGroupName != null && c.userGroupName!.isNotEmpty) {
        groupCounts[c.userGroupName!] = (groupCounts[c.userGroupName!] ?? 0) + 1;
      }
    }
    if (groupCounts.isNotEmpty) {
      derivedClassName = groupCounts.entries
          .reduce((a, b) => a.value > b.value ? a : b)
          .key;
    }

    // --- SORTING LOGIC (WEBSITE PARITY) ---
    final sortedCourses = List<CourseDetails>.from(courses);
    sortedCourses.sort((a, b) {
      final String cidA = a.safeId;
      final String cidB = b.safeId;
      
      final statA = stats.courseStats[cidA];
      final statB = stats.courseStats[cidB];

      // Sorting Tiers:
      // 0: Active (finalTotal > 0, Not Disabled)
      // 1: No Data (finalTotal == 0, Not Disabled)
      // 2: Disabled (Always bottom)
      
      final bool isDisabledA = disabledCodes.contains((a.code ?? '').toUpperCase());
      final bool isDisabledB = disabledCodes.contains((b.code ?? '').toUpperCase());
      
      int getTier(CourseStat? s, bool disabled) {
        if (disabled) return 2; // Absolute bottom
        if (s == null || s.finalTotal == 0) return 1;
        return 0;
      }

      final int tierA = getTier(statA, isDisabledA);
      final int tierB = getTier(statB, isDisabledB);

      if (tierA != tierB) return tierA.compareTo(tierB);

      if (tierA == 0 && statA != null && statB != null) {
        final target = (auth?.settings.targetPercentage ?? 75).toDouble();
        
        final resA = utils.calculateAttendance(
          statA.finalPresent,
          statA.finalTotal,
          targetPercentage: target,
        );
        final resB = utils.calculateAttendance(
          statB.finalPresent,
          statB.finalTotal,
          targetPercentage: target,
        );
        
        // 1. Safety Sort: Bunkable (Descending)
        int cmp = resB.canBunk.compareTo(resA.canBunk);
        if (cmp != 0) return cmp;

        // 2. Tie-breaker: Safe Bunkable (Official Only)
        final safeResA = utils.calculateAttendance(
          statA.officialPresent,
          statA.officialTotal,
          targetPercentage: target,
        );
        final safeResB = utils.calculateAttendance(
          statB.officialPresent,
          statB.officialTotal,
          targetPercentage: target,
        );
        cmp = safeResB.canBunk.compareTo(safeResA.canBunk);
        if (cmp != 0) return cmp;
        
        // 3. Safety Sort: Required to Attend (Ascending)
        cmp = resA.requiredToAttend.compareTo(resB.requiredToAttend);
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
      className: derivedClassName,
      disabledCodes: disabledCodes,
    );
  }
  Future<void> refresh() async {
    final user = ref.read(authProvider).value;
    final api = ref.read(apiServiceProvider);
    final supabaseToken = supabase.Supabase.instance.client.auth.currentSession?.accessToken;
    
    // 0. HARD CLEAR: Ensure no stale data survives the refresh request
    api.clearCaches();
    ref.invalidate(institutionsProvider);
    state = const AsyncValue.loading();
    _cachedCourses = null;
    _cachedAttendance = null;
    _cachedInstructors = null;
    _lastAcademic = null;

    if (user != null && supabaseToken != null) {
      // 1. Trigger the server-side sync (this updates the database)
      // Manual refresh IS blocking to ensure the UI waits for fresh data
      await api.triggerSync(supabaseToken);
      
      // 2. Fetch the fresh profile from the server (this updates class_id, label etc)
      // We MUST await this so that the subsequent _fetchAndProcess uses the updated classId!
      await ref.read(authProvider.notifier).refreshProfile(force: true, sync: true);
    }
    
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
