import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/providers/auth_provider.dart';

class AcademicState {
  final String semester;
  final String year;

  const AcademicState({required this.semester, required this.year});

  AcademicState copyWith({String? semester, String? year}) {
    return AcademicState(
      semester: semester ?? this.semester,
      year: year ?? this.year,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AcademicState &&
          runtimeType == other.runtimeType &&
          semester == other.semester &&
          year == other.year;

  @override
  int get hashCode => semester.hashCode ^ year.hashCode;

  DateTime get startDate {
    final parsed = _parseAcademicYear(year);
    if (semester.toLowerCase().contains('odd')) {
      return DateTime(parsed.$1, 7, 1);
    }
    return DateTime(parsed.$2, 1, 1);
  }

  DateTime get endDate {
    final parsed = _parseAcademicYear(year);
    if (semester.toLowerCase().contains('odd')) {
      return DateTime(parsed.$1, 12, 31, 23, 59, 59);
    }
    return DateTime(parsed.$2, 6, 30, 23, 59, 59);
  }
}

final academicProvider =
    AsyncNotifierProvider<AcademicNotifier, AcademicState?>(
      AcademicNotifier.new,
    );

class AcademicNotifier extends AsyncNotifier<AcademicState?> {
  @override
  FutureOr<AcademicState?> build() async {
    final auth = ref.watch(authProvider).value;
    if (auth == null) return null;

    final semester = auth.settings.semester ?? auth.profile?.currentSemester;
    final year = auth.settings.academicYear ?? auth.profile?.currentYear;

    if (semester != null && year != null) {
      return AcademicState(semester: semester, year: year);
    }

    final fallback = calculateCurrentAcademicInfo(
      semester: semester,
      year: year,
    );
    return AcademicState(
      semester: fallback['current_semester']!,
      year: fallback['current_year']!,
    );
  }

  Future<void> setSemester(String semester) async {
    final current = state.value;
    final nextYear =
        current?.year ?? calculateCurrentAcademicInfo()['current_year']!;
    final nextState = AcademicState(semester: semester, year: nextYear);
    state = AsyncValue.data(nextState);
    await ref
        .read(authProvider.notifier)
        .updateAcademicContext(nextState.semester, nextState.year);
  }

  Future<void> setYear(String year) async {
    final current = state.value;
    final nextSemester =
        current?.semester ??
        calculateCurrentAcademicInfo()['current_semester']!;
    final nextState = AcademicState(semester: nextSemester, year: year);
    state = AsyncValue.data(nextState);
    await ref
        .read(authProvider.notifier)
        .updateAcademicContext(nextState.semester, nextState.year);
  }
}

(int, int) _parseAcademicYear(String year) {
  final parts = year.split('-');
  final start =
      int.tryParse(parts.isNotEmpty ? parts.first : '') ?? DateTime.now().year;
  final end = parts.length > 1
      ? int.tryParse(parts[1].length == 2 ? '20${parts[1]}' : parts[1])
      : start + 1;
  return (start, end ?? start + 1);
}
