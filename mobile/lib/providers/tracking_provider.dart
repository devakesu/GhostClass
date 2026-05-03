import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

// ─── Tracking State ──────────────────────────────────────────────────────────

class TrackingState {
  final Map<String, List<TrackingRecord>> groupedByCourse;
  final AttendanceReportDetailed? officialReport;
  final int totalCount;
  final bool isSyncing;
  final bool syncCompleted;

  TrackingState({
    required this.groupedByCourse,
    required this.totalCount, required this.isSyncing, required this.syncCompleted, this.officialReport,
  });

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
  static bool _isSyncingExternal = false;

  String _canonicalTrackerCourseCode(String courseId) {
    return courseId.trim().replaceAll(RegExp(r'\s+'), '').toUpperCase();
  }

  @override
  FutureOr<TrackingState> build() async {
    // 1. Reactive Dependency: Clear data immediately on logout OR Semester Change
    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);
    final academic = academicAsync.value;

    if (authState.value == null || academic == null) {
      return TrackingState(
        groupedByCourse: {},
        totalCount: 0,
        isSyncing: false,
        syncCompleted: false,
      );
    }

    // Background Sync trigger moved to NavigationShell.

    // 2. Initial Load
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

    bool syncCompleted = false;
    if (forceSync) {
      if (_isSyncingExternal) {
        syncCompleted = true;
      } else {
        _isSyncingExternal = true;
        try {
          final supabaseToken = supabase.Supabase.instance.client.auth.currentSession?.accessToken;
          if (supabaseToken != null) {
            await api.triggerSync(supabaseToken);
          }
        } catch (e) {
          AppLogger.e('TrackingNotifier: Background sync failed during fetch.', e);
        } finally {
          _isSyncingExternal = false;
          syncCompleted = true;
        }
      }
    } else {
      syncCompleted = true;
    }

    AttendanceReportDetailed? officialReport;
    final res = await api.fetchAttendanceReportDetailed(storage);
    if (res.statusCode == 200 && res.data is Map) {
      officialReport = AttendanceReportDetailed.fromJson(
        res.data as Map<String, dynamic>,
      );
    } else {
      throw Exception(formatApiError(res.data, 'Tracking.OfficialReport'));
    }

    final records = <TrackingRecord>[];
    final response = await supabase.Supabase.instance.client
        .from('tracker')
        .select()
        .eq('auth_user_id', auth.supabaseUserId)
        .eq('semester', academic.semester)
        .eq('year', academic.year);
    final List<dynamic> data = response as List<dynamic>;
    records.addAll(
      data.map(
        (json) => TrackingRecord.fromJson(json as Map<String, dynamic>),
      ),
    );

    final Map<String, List<TrackingRecord>> grouped = {};
    for (final record in records) {
      final String safeId = _resolveToSafeId(
        record.course,
        officialReport,
        academic,
      );
      if (!grouped.containsKey(safeId)) grouped[safeId] = [];
      grouped[safeId]!.add(record);
    }

    for (final course in grouped.keys) {
      grouped[course]!.sort((a, b) {
        final cmp = b.date.compareTo(a.date);
        return cmp != 0 ? cmp : b.session.compareTo(a.session);
      });
    }

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
    final s = input.trim().toUpperCase();
    if (report.courses.containsKey(input)) return input;
    for (final c in report.courses.values) {
      if (c.code?.trim().toUpperCase() == s) return c.id.toString();
    }
    final n = int.tryParse(input);
    if (n != null) {
      for (final it in report.courses.entries) {
        if (it.value.id == n) return it.key;
      }
    }
    return input;
  }

  /// Manually trigger a refresh of the data.
  Future<void> refresh({bool forceSync = false}) async {
    final academicAsync = ref.read(academicProvider);
    final user = ref.read(authProvider).value;
    final supabaseToken = supabase.Supabase.instance.client.auth.currentSession?.accessToken;
    if (user != null && supabaseToken != null) {
      // Manual refresh IS blocking
      await ref.read(apiServiceProvider).triggerSync(supabaseToken);
    }

    final academic = academicAsync.value;
    if (academic == null) return;
    
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _fetchAndProcess(
        academic: academic,
        isInitial: false,
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

    final canonicalCourseId = _canonicalTrackerCourseCode(courseId);

    try {
      final response = await supabase.Supabase.instance.client
          .from('tracker')
          .insert({
            'auth_user_id': auth.supabaseUserId,
            'course': canonicalCourseId,
            'date': date,
            'status': status,
            'session': session,
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

        final list = List<TrackingRecord>.from(newGrouped[safeCourseId]!);
        list.add(newRecord);

        // Mantain Sort (Newest First)
        list.sort((a, b) {
          final cmp = b.date.compareTo(a.date);
          if (cmp != 0) return cmp;
          return b.session.compareTo(a.session);
        });

        newGrouped[safeCourseId] = list;

        state = AsyncValue.data(
          current.copyWith(
            groupedByCourse: newGrouped,
            totalCount: current.totalCount + 1,
          ),
        );
      }
    } catch (e) {
      AppLogger.e('TrackingNotifier: Failed to insert record', e);
      rethrow;
    }
  }

  /// Delete a single tracking record with instant local update.
  Future<void> deleteRecord(int recordId) async {
    try {
      await supabase.Supabase.instance.client
          .from('tracker')
          .delete()
          .eq('id', recordId);

      // LOCAL UPDATE WITHOUT REFRESH
      if (state.hasValue) {
        final current = state.value!;
        final newGrouped = Map<String, List<TrackingRecord>>.from(
          current.groupedByCourse,
        );

        bool removed = false;
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
        }
      }
    } catch (e) {
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
      var query = supabase.Supabase.instance.client
          .from('tracker')
          .delete()
          .eq('auth_user_id', auth.supabaseUserId)
          .eq('semester', academic.semester)
          .eq('year', academic.year);

      if (courseId != null) {
        // ID-CODE Mismatch Safety: 
        // We aggregate both the numeric ID and the Alphanumeric Code to ensure
        // all variants stored in the DB (via Web vs Mobile) are cleared.
        final Set<String> keys = {courseId};
        if (officialReport != null) {
          // Find the course in the report
          for (final c in officialReport.courses.values) {
            final String cId = c.id.toString();
            final String? cCode = c.code;
            if (cId == courseId || cCode?.toUpperCase() == courseId.toUpperCase()) {
              keys.add(cId);
              if (cCode != null) keys.add(cCode);
              break;
            }
          }
        }
        query = query.filter('course', 'in', keys.toList());
      }

      await query;
      await refresh();
    } catch (e) {
      AppLogger.e('TrackingNotifier: Failed to clear records', e);
      rethrow;
    }
  }
}
