import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/leave.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';

class LeaveState {
  final List<Leave> leaves;
  final Map<int, List<LeaveSession>> sessions;

  LeaveState({required this.leaves, required this.sessions});

  factory LeaveState.empty() => LeaveState(leaves: [], sessions: {});
}

final leaveProvider = AsyncNotifierProvider<LeaveNotifier, LeaveState>(
  LeaveNotifier.new,
);

class LeaveNotifier extends AsyncNotifier<LeaveState> {
  @override
  FutureOr<LeaveState> build() async {
    final academic = ref.watch(academicProvider).value;
    if (academic == null) return LeaveState.empty();

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      final data = await api.fetchLeaveData(storage);
      final rawLeaves = data['studentLeaves']?['student_leaves'] as List? ?? [];
      final rawSessions = data['studentLeaves']?['student_leave_sessions'] as Map? ?? {};

      final leaves = rawLeaves
          .map((l) => Leave.fromJson(l as Map<String, dynamic>))
          .where((l) =>
              l.userSubgroup?.academicSemester == academic.semester &&
              l.userSubgroup?.academicYear == academic.year)
          .toList();

      final sessions = rawSessions.map((key, value) => MapEntry(
            int.parse(key.toString()),
            (value as List)
                .map((s) => LeaveSession.fromJson(s as Map<String, dynamic>))
                .toList(),
          ));

      return LeaveState(leaves: leaves, sessions: sessions);
    } catch (e) {
      return LeaveState.empty();
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    ref.invalidateSelf();
  }
}
