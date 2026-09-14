import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

// ─── Tracking State ──────────────────────────────────────────────────────────

class TrackingState {
  TrackingState({
    required this.groupedByCourse,
    required this.totalCount,
    required this.isSyncing,
    required this.syncCompleted,
    this.officialReport,
  });
  final Map<String, List<TrackingRecord>> groupedByCourse;
  final AttendanceReportDetailed? officialReport;
  final int totalCount;
  final bool isSyncing;
  final bool syncCompleted;

  TrackingState copyWith({
    Map<String, List<TrackingRecord>>? groupedByCourse,
    AttendanceReportDetailed? officialReport,
    int? totalCount,
    bool? isSyncing,
    bool? syncCompleted,
  }) {
    return TrackingState(
      groupedByCourse: groupedByCourse ?? this.groupedByCourse,
      officialReport: officialReport ?? this.officialReport,
      totalCount: totalCount ?? this.totalCount,
      isSyncing: isSyncing ?? this.isSyncing,
      syncCompleted: syncCompleted ?? this.syncCompleted,
    );
  }
}

// ─── Tracking Notifier ───────────────────────────────────────────────────────

final trackingProvider = AsyncNotifierProvider<TrackingNotifier, TrackingState>(
  TrackingNotifier.new,
);

class TrackingNotifier extends AsyncNotifier<TrackingState> {
  bool _isDisposed = false;

  @override
  FutureOr<TrackingState> build() async {
    _isDisposed = false;
    ref.onDispose(() => _isDisposed = true);

    // 1. Reactive Dependency: Clear data immediately on logout OR Semester Change
    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    if (authState.isLoading || academicAsync.isLoading) {
      await Future.wait([
        if (authState.isLoading) ref.watch(authProvider.future),
        if (academicAsync.isLoading) ref.watch(academicProvider.future),
      ]);
    }

    final academic = academicAsync.value;

    if (authState.value == null || academic == null) {
      return TrackingState(
        groupedByCourse: {},
        totalCount: 0,
        isSyncing: false,
        syncCompleted: false,
      );
    }

    final storage = ref.read(secureStorageProvider);
    final user = authState.value!;
    final cacheKeySuffix =
        '${user.supabaseUserId}_${academic.semester}_${academic.year}';

    // 1. Try disk cache first for instant boot (<15ms)
    try {
      final cacheResults = await Future.wait([
        storage.getCachedData('tracking_report_$cacheKeySuffix'),
        storage.getCachedData('tracking_records_$cacheKeySuffix'),
      ]);
      final cachedReportRaw = cacheResults[0];
      final cachedRecordsRaw = cacheResults[1];

      if (cachedReportRaw is Map && cachedRecordsRaw is List) {
        final officialReport = AttendanceReportDetailed.fromJson(
          Map<String, dynamic>.from(cachedReportRaw),
        );
        final records = cachedRecordsRaw
            .map(
              (json) => TrackingRecord.fromJson(
                Map<String, dynamic>.from(json as Map),
              ),
            )
            .toList();

        final grouped = <String, List<TrackingRecord>>{};
        for (final record in records) {
          final safeId = _resolveToSafeId(
            record.course,
            officialReport,
            academic,
          );
          if (!grouped.containsKey(safeId)) grouped[safeId] = [];
          grouped[safeId]!.add(record);
        }

        for (final course in grouped.keys) {
          grouped[course]!.sort(utils.compareTrackingRecords);
        }

        // Revalidate in background quietly
        AppLogger.safeUnawait(
          _fetchAndProcess(academic: academic)
              .then((fresh) {
                if (!_isDisposed) {
                  state = AsyncValue.data(fresh);
                }
              })
              .catchError((Object e, StackTrace st) {
                if (!_isDisposed) {
                  AppLogger.e(
                    'TrackingNotifier: Background revalidation failed',
                    e,
                    st,
                  );
                }
              }),
          'TrackingNotifier: background revalidate',
        );

        return TrackingState(
          groupedByCourse: grouped,
          officialReport: officialReport,
          totalCount: records.length,
          isSyncing: false,
          syncCompleted: true,
        );
      }
    } on Object catch (e) {
      AppLogger.e('TrackingNotifier: Error loading disk cache', e);
    }

    // 2. Initial Load from network
    return _fetchAndProcess(academic: academic, isInitial: true);
  }

  Future<TrackingState> _fetchAndProcess({
    required AcademicState academic,
    bool isInitial = false,
    bool forceSync = false,
  }) async {
    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);
    final auth = ref.read(authProvider).value;

    if (auth == null) {
      return TrackingState(
        groupedByCourse: {},
        totalCount: 0,
        isSyncing: false,
        syncCompleted: false,
      );
    }

    const syncCompleted = true;

    late final AttendanceReportDetailed officialReport;
    final records = <TrackingRecord>[];

    await Future.wait([
      api.fetchAttendanceReportDetailed(storage).then((res) {
        if (res.statusCode == 200 && res.data is Map) {
          officialReport = AttendanceReportDetailed.fromJson(
            res.data as Map<String, dynamic>,
          );
        } else {
          final message = formatApiError(res.data, 'Tracking.OfficialReport');
          throw AppException(
            message: message,
            type: res.statusCode == 401
                ? AppExceptionType.unauthorized
                : AppExceptionType.server,
            statusCode: res.statusCode,
          );
        }
      }),
      ref
          .read(supabaseClientProvider)
          .from('tracker')
          .select()
          .eq('auth_user_id', auth.supabaseUserId)
          .eq('semester', academic.semester)
          .eq('year', academic.year)
          .then((response) {
            final data = response as List<dynamic>;
            records.addAll(
              data.map(
                (json) => TrackingRecord.fromJson(json as Map<String, dynamic>),
              ),
            );
          }),
    ]);

    final grouped = <String, List<TrackingRecord>>{};
    for (final record in records) {
      final safeId = _resolveToSafeId(
        record.course,
        officialReport,
        academic,
      );
      if (!grouped.containsKey(safeId)) grouped[safeId] = [];
      grouped[safeId]!.add(record);
    }

    for (final course in grouped.keys) {
      grouped[course]!.sort(utils.compareTrackingRecords);
    }

    final cacheKeySuffix =
        '${auth.supabaseUserId}_${academic.semester}_${academic.year}';
    AppLogger.safeUnawait(
      storage.saveCachedData(
        'tracking_report_$cacheKeySuffix',
        officialReport.toJson(),
      ),
      'TrackingNotifier: save report cache',
    );
    AppLogger.safeUnawait(
      storage.saveCachedData(
        'tracking_records_$cacheKeySuffix',
        records.map((r) => r.toJson()).toList(),
      ),
      'TrackingNotifier: save records cache',
    );

    return TrackingState(
      groupedByCourse: grouped,
      officialReport: officialReport,
      totalCount: records.length,
      isSyncing: false,
      syncCompleted: syncCompleted,
    );
  }

  String _resolveToSafeId(
    String input,
    AttendanceReportDetailed? report,
    AcademicState academic,
  ) {
    if (report == null) return input;
    final stdInput = utils.standardizeCourseCode(input);
    if (report.courses.containsKey(input)) return input;

    // Search courses by standardized code
    for (final c in report.courses.values) {
      if (c.code != null && utils.standardizeCourseCode(c.code!) == stdInput) {
        return c.id.toString();
      }
    }

    // Fallback: Check if input is a numeric ID
    final n = int.tryParse(input);
    if (n != null) {
      for (final it in report.courses.entries) {
        if (it.value.id == n) return it.key;
      }
    }
    return input;
  }

  /// Manually trigger a refresh of the data.
  /// [forceSync] — if true, triggers a server-side data sync before fetching.
  /// DashboardNotifier.refresh() already handles the primary sync, so pass
  /// forceSync: false when calling from that context to avoid redundant requests.
  Future<void> refresh({bool forceSync = false}) async {
    final academicAsync = ref.read(academicProvider);
    final user = ref.read(authProvider).value;
    final supabaseToken = ref
        .read(supabaseClientProvider)
        .auth
        .currentSession
        ?.accessToken;
    // Only trigger a sync when the caller explicitly requests it.
    // DashboardNotifier.refresh() already fires triggerSync before calling us.
    if (forceSync && user != null && supabaseToken != null) {
      await ref.read(apiServiceProvider).triggerSync(supabaseToken);
    }

    final academic = academicAsync.value;
    if (academic == null) return;

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _fetchAndProcess(
        academic: academic,
        forceSync: forceSync,
      ),
    );
  }

  /// Insert a new tracking record with instant local update.
  Future<void> insertRecord({
    required String date,
    required String session,
    required String status,
    required dynamic attendance,
    required String courseId,
    String? remarks,
  }) async {
    final auth = ref.read(authProvider).value;
    final academicAsync = ref.read(academicProvider);
    final academic = academicAsync.value;
    if (auth == null || academic == null) return;

    final canonicalCourseId = utils.standardizeCourseCode(courseId);
    final normSession = utils.normalizeSession(session);
    final sNum = int.tryParse(normSession);
    final canonicalSession = (sNum != null && sNum > 0)
        ? utils.toRoman(sNum)
        : session;

    try {
      final response = await ref
          .read(supabaseClientProvider)
          .from('tracker')
          .insert({
            'auth_user_id': auth.supabaseUserId,
            'course': canonicalCourseId,
            'date': date,
            'status': status,
            'session': canonicalSession,
            'semester': academic.semester,
            'year': academic.year,
            'attendance': attendance,
            'remarks': remarks,
          })
          .select()
          .single();

      final newRecord = TrackingRecord.fromJson(response);

      // LOCAL UPDATE WITHOUT REFRESH
      if (state.hasValue) {
        final current = state.value!;
        final safeCourseId = _resolveToSafeId(
          canonicalCourseId,
          current.officialReport,
          academic,
        );
        final newGrouped = Map<String, List<TrackingRecord>>.from(
          current.groupedByCourse,
        );

        if (!newGrouped.containsKey(safeCourseId)) {
          newGrouped[safeCourseId] = [];
        }

        final list = List<TrackingRecord>.from(newGrouped[safeCourseId]!)
          ..add(newRecord)
          ..sort(utils.compareTrackingRecords);

        newGrouped[safeCourseId] = list;

        state = AsyncValue.data(
          current.copyWith(
            groupedByCourse: newGrouped,
            totalCount: current.totalCount + 1,
          ),
        );
        // Analytics: attendance added
        try {
          await AnalyticsService.instance.logAttendanceMarked(
            courseId: canonicalCourseId,
            count: 1,
          );
        } on Object catch (_) {}
      }
    } on Object catch (e) {
      AppLogger.e('TrackingNotifier: Failed to insert record', e);
      rethrow;
    }
  }

  /// Delete a single tracking record with instant local update.
  Future<void> deleteRecord(int recordId) async {
    try {
      await ref
          .read(supabaseClientProvider)
          .from('tracker')
          .delete()
          .eq('id', recordId);

      // LOCAL UPDATE WITHOUT REFRESH
      if (state.hasValue) {
        final current = state.value!;
        final newGrouped = Map<String, List<TrackingRecord>>.from(
          current.groupedByCourse,
        );

        var removed = false;
        String? removedCid;
        for (final cid in newGrouped.keys.toList()) {
          final list = List<TrackingRecord>.from(newGrouped[cid]!);
          final idx = list.indexWhere((r) => r.id == recordId);
          if (idx != -1) {
            list.removeAt(idx);
            if (list.isEmpty) {
              newGrouped.remove(cid);
            } else {
              newGrouped[cid] = list;
            }
            removed = true;
            removedCid = cid;
            break;
          }
        }

        if (removed) {
          state = AsyncValue.data(
            current.copyWith(
              groupedByCourse: newGrouped,
              totalCount: current.totalCount - 1,
            ),
          );
          // Analytics: attendance deleted
          try {
            await AnalyticsService.instance.logAttendanceDeleted(
              courseId: removedCid ?? '',
              count: 1,
            );
          } on Object catch (_) {}
        }
      }
    } on Object catch (e) {
      AppLogger.e('TrackingNotifier: Failed to delete record', e);
      rethrow;
    }
  }

  /// Clear tracking records. If courseId is provided, clears only that course.
  /// Otherwise, clears all records for the current semester/year.
  Future<void> clearRecords({String? courseId}) async {
    final auth = ref.read(authProvider).value;
    final academic = ref.read(academicProvider).value;
    final officialReport = state.value?.officialReport;
    if (auth == null || academic == null) return;

    try {
      var query = ref
          .read(supabaseClientProvider)
          .from('tracker')
          .delete()
          .eq('auth_user_id', auth.supabaseUserId)
          .eq('semester', academic.semester)
          .eq('year', academic.year);

      if (courseId != null) {
        // ID-CODE Mismatch Safety:
        // We aggregate both the numeric ID and the Alphanumeric Code to ensure
        // all variants stored in the DB (via Web vs Mobile) are cleared.
        final keys = <String>{courseId, utils.standardizeCourseCode(courseId)};
        if (officialReport != null) {
          // Find the course in the report
          for (final c in officialReport.courses.values) {
            final cId = c.id.toString();
            final cCode = c.code;
            if (cId == courseId ||
                (cCode != null &&
                    utils.standardizeCourseCode(cCode) ==
                        utils.standardizeCourseCode(courseId))) {
              keys.add(cId);
              if (cCode != null) keys.add(utils.standardizeCourseCode(cCode));
              break;
            }
          }
        }
        query = query.filter('course', 'in', keys.toList());
      }

      await query;
      await refresh();
    } on Object catch (e) {
      AppLogger.e('TrackingNotifier: Failed to clear records', e);
      rethrow;
    }
  }
}
