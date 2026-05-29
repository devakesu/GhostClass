import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/leave.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/services/api_service.dart';
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
  @override
  FutureOr<LeaveState> build() async {
    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    if (authState.isLoading || academicAsync.isLoading) {
      return Completer<LeaveState>().future;
    }

    final academic = academicAsync.value;

    if (authState.value == null || academic == null) return LeaveState.empty();

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    final res = await api.fetchLeaveData(storage);
    final data = res.data as Map<String, dynamic>? ?? {};
    final studentLeaves = data['studentLeaves'] as Map<String, dynamic>? ?? {};
    final rawLeaves = studentLeaves['student_leaves'] as List<dynamic>? ?? [];
    final rawSessions =
        studentLeaves['student_leave_sessions'] as List<dynamic>? ?? [];

    final leaves = rawLeaves
        .whereType<Map<dynamic, dynamic>>()
        .map((l) => Leave.fromJson(l.cast<String, dynamic>()))
        .where(
          (l) =>
              l.userSubgroup?.academicSemester == academic.semester &&
              l.userSubgroup?.academicYear == academic.year,
        )
        .toList();

    final sessions = <int, List<LeaveSession>>{};
    for (final raw in rawSessions.whereType<Map<dynamic, dynamic>>()) {
      final session = LeaveSession.fromJson(raw.cast<String, dynamic>());
      sessions.putIfAbsent(session.leaveId, () => []).add(session);
    }

    return LeaveState(leaves: leaves, sessions: sessions);
  }

  Future<void> refresh() async {
    ref.invalidate(notificationsProvider);
    state = const AsyncValue.loading();
    ref.invalidateSelf();
  }
}
