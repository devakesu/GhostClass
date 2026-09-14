import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/models/leave.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

class LeaveState {
  LeaveState({required this.leaves, required this.sessions});

  factory LeaveState.empty() => LeaveState(leaves: [], sessions: {});
  final List<Leave> leaves;
  final Map<int, List<LeaveSession>> sessions;
}

final leaveProvider = AsyncNotifierProvider<LeaveNotifier, LeaveState>(
  LeaveNotifier.new,
);

class LeaveNotifier extends AsyncNotifier<LeaveState> {
  bool _isDisposed = false;

  @override
  FutureOr<LeaveState> build() async {
    _isDisposed = false;
    ref.onDispose(() => _isDisposed = true);

    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    if (authState.isLoading || academicAsync.isLoading) {
      await Future.wait([
        if (authState.isLoading) ref.watch(authProvider.future),
        if (academicAsync.isLoading) ref.watch(academicProvider.future),
      ]);
    }

    final user = authState.value;
    final academic = academicAsync.value;

    if (user == null || academic == null) return LeaveState.empty();

    final storage = ref.read(secureStorageProvider);
    final cacheKey =
        'leaves_raw_${user.supabaseUserId}_${academic.semester}_${academic.year}';
    final fallbackCacheKey = 'leaves_raw_${user.supabaseUserId}';

    // 1. Try disk cache first for instant boot (<15ms)
    try {
      var cachedRaw = await storage.getCachedData(cacheKey);
      cachedRaw ??= await storage.getCachedData(fallbackCacheKey);

      if (cachedRaw is Map) {
        final cachedState = _parseLeaveData(
          cachedRaw.cast<String, dynamic>(),
          academic,
        );

        // Revalidate in background quietly
        AppLogger.safeUnawait(
          _fetchAndProcess(
                user: user,
                storage: storage,
                cacheKey: cacheKey,
                academic: academic,
              )
              .then((fresh) {
                if (!_isDisposed) {
                  state = AsyncValue.data(fresh);
                }
              })
              .catchError((Object e, StackTrace st) {
                if (!_isDisposed) {
                  AppLogger.e(
                    'LeaveNotifier: Background revalidation failed',
                    e,
                    st,
                  );
                }
              }),
          'LeaveNotifier: background revalidate',
        );

        return cachedState;
      }
    } on Object catch (e) {
      AppLogger.e('LeaveNotifier: Error loading disk cache', e);
    }

    return _fetchAndProcess(
      user: user,
      storage: storage,
      cacheKey: cacheKey,
      academic: academic,
    );
  }

  Future<LeaveState> _fetchAndProcess({
    required AuthenticatedUser user,
    required SecureStorageService storage,
    required String cacheKey,
    required AcademicState academic,
  }) async {
    final api = ref.read(apiServiceProvider);
    final res = await api.fetchLeaveData(storage);
    final data = res.data as Map<String, dynamic>? ?? {};

    if (res.statusCode == 200 && data.isNotEmpty) {
      AppLogger.safeUnawait(
        Future.wait([
          storage.saveCachedData(cacheKey, data),
          storage.saveCachedData('leaves_raw_${user.supabaseUserId}', data),
        ]).catchError((Object e, StackTrace st) {
          AppLogger.e('LeaveNotifier: Failed to cache leaves data', e, st);
          return <void>[];
        }),
        'LeaveNotifier: saveCachedData',
      );
    }

    return _parseLeaveData(data, academic);
  }

  LeaveState _parseLeaveData(
    Map<String, dynamic> data,
    AcademicState academic,
  ) {
    final studentLeaves = data['studentLeaves'] as Map<String, dynamic>? ?? {};
    final rawLeaves = studentLeaves['student_leaves'] as List<dynamic>? ?? [];

    final rawSessionsRaw = studentLeaves['student_leave_sessions'];
    final sessions = <int, List<LeaveSession>>{};
    if (rawSessionsRaw is Map) {
      for (final entry in rawSessionsRaw.entries) {
        final keyStr = entry.key.toString();
        final leaveId = int.tryParse(keyStr);
        if (leaveId == null) continue;

        final value = entry.value;
        if (value is List) {
          for (final raw in value.whereType<Map<dynamic, dynamic>>()) {
            final session = LeaveSession.fromJson(raw.cast<String, dynamic>());
            sessions.putIfAbsent(leaveId, () => []).add(session);
          }
        } else if (value is Map) {
          final session = LeaveSession.fromJson(value.cast<String, dynamic>());
          sessions.putIfAbsent(leaveId, () => []).add(session);
        }
      }
    } else if (rawSessionsRaw is List) {
      for (final raw in rawSessionsRaw.whereType<Map<dynamic, dynamic>>()) {
        final session = LeaveSession.fromJson(raw.cast<String, dynamic>());
        sessions.putIfAbsent(session.leaveId, () => []).add(session);
      }
    }

    final leaves = rawLeaves
        .whereType<Map<dynamic, dynamic>>()
        .map((l) => Leave.fromJson(l.cast<String, dynamic>()))
        .where((l) => _matchesLeaveAcademic(l, academic))
        .toList();

    return LeaveState(leaves: leaves, sessions: sessions);
  }

  bool _matchesLeaveAcademic(Leave l, AcademicState academic) {
    final subSem = l.userSubgroup?.academicSemester.trim();
    final subYear = l.userSubgroup?.academicYear.trim();

    final hasSem = subSem != null && subSem.isNotEmpty;
    final hasYear = subYear != null && subYear.isNotEmpty;

    final windowStart = academic.startDate.subtract(const Duration(days: 30));
    final windowEnd = academic.endDate.add(const Duration(days: 30));

    if (hasSem || hasYear) {
      if (hasSem && semestersDiffer(subSem, academic.semester)) {
        return false;
      }
      if (hasYear && yearsDiffer(subYear, academic.year)) {
        return false;
      }
      if (!hasYear) {
        final created = DateTime.tryParse(l.createdAt);
        if (created != null) {
          if (!created.isAfter(windowStart) || !created.isBefore(windowEnd)) {
            return false;
          }
        }
      }
      return true;
    }

    // Fallback: Check leave's createdAt against academic window
    final created = DateTime.tryParse(l.createdAt);
    if (created != null) {
      return created.isAfter(windowStart) && created.isBefore(windowEnd);
    }

    return true;
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}
