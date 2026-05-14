import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// AcademicState
/// -------------
/// Represents the current academic context (semester and year) for the user.
/// Provides utility methods to derive start and end dates for filtering logs.
@immutable
class AcademicState {
  const AcademicState({required this.semester, required this.year});
  final String semester;
  final String year;

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
    final semLower = semester.toLowerCase();
    if (semLower.contains('odd')) {
      return DateTime(parsed.$1, 7);
    }
    if (semLower.contains('even') || semLower.contains('spring')) {
      return DateTime(parsed.$2);
    }
    // Unrecognised semester name — default to even-semester dates and warn.
    AppLogger.w(
      'AcademicState.startDate: Unrecognised semester "$semester" for year "$year". '
      'Defaulting to even-semester start (Jan 1). Consider mapping this name.',
    );
    return DateTime(parsed.$2);
  }

  DateTime get endDate {
    final parsed = _parseAcademicYear(year);
    final semLower = semester.toLowerCase();
    if (semLower.contains('odd')) {
      return DateTime(parsed.$1, 12, 31, 23, 59, 59);
    }
    if (semLower.contains('even') || semLower.contains('spring')) {
      return DateTime(parsed.$2, 6, 30, 23, 59, 59);
    }
    // Unrecognised semester name — default to even-semester dates and warn.
    AppLogger.w(
      'AcademicState.endDate: Unrecognised semester "$semester" for year "$year". '
      'Defaulting to even-semester end (Jun 30). Consider mapping this name.',
    );
    return DateTime(parsed.$2, 6, 30, 23, 59, 59);
  }
}

final academicProvider =
    AsyncNotifierProvider<AcademicNotifier, AcademicState?>(
      AcademicNotifier.new,
    );

/// AcademicNotifier
/// ----------------
/// Manages the current academic context state, synchronizing with
/// secure storage, user settings, and the EzyGo portal.
class AcademicNotifier extends AsyncNotifier<AcademicState?> {
  @override
  FutureOr<AcademicState?> build() async {
    // Academic state is pre-populated by AuthNotifier during startup
    // (via _fetchAndSaveAcademicContext) before authProvider.future resolves.
    // We gate on auth being available to avoid building while logged out.
    final authAsync = ref.watch(authProvider);
    if (!authAsync.hasValue || authAsync.value == null) return null;

    final storage = ref.read(secureStorageProvider);

    // 1. Primary source: secure storage (written by auth startup flow)
    final cached = await storage.getAcademicState();
    if (cached != null) return cached;

    // 2. Fallback: User settings from profile sync
    final auth = authAsync.value!;
    final semester = auth.settings.semester;
    final year = auth.settings.academicYear;

    if (semester != null && year != null) {
      final state = AcademicState(semester: semester, year: year);
      unawaited(storage.saveAcademicState(state));
      return state;
    }

    // 3. Last resort: Calculate from current date
    final fallback = calculateCurrentAcademicInfo();
    return AcademicState(
      semester: fallback['current_semester']!,
      year: fallback['current_year']!,
    );
  }

  Future<void> refreshFromEzygo() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(apiServiceProvider);
      final storage = ref.read(secureStorageProvider);

      final results = await Future.wait<Response<dynamic>>([
        api.fetchSemester(storage),
        api.fetchAcademicYear(storage),
      ]);

      final semRes = results[0];
      final yearRes = results[1];

      String? extract(dynamic raw, String key) {
        if (raw == null) return null;
        if (raw is! Map) return raw.toString();

        final map = raw;
        if (map[key] != null) return map[key].toString();

        final keysToTry = ['data', 'value'];
        for (final k in keysToTry) {
          final val = map[k];
          if (val != null) {
            if (val is! Map) return val.toString();
            if (val[key] != null) return val[key].toString();
          }
        }
        return null;
      }

      final semester = extract(semRes.data, 'default_semester');
      final year = extract(yearRes.data, 'default_academic_year');

      if (semester != null && year != null) {
        final next = AcademicState(semester: semester, year: year);
        await storage.saveAcademicState(next);
        return next;
      }

      final cached = await storage.getAcademicState();
      return cached ?? state.value;
    });
  }

  Future<void> setSemester(String semester) async {
    final current = state.value;
    final nextYear =
        current?.year ?? calculateCurrentAcademicInfo()['current_year']!;

    // 1. Show loading immediately in the state
    state = const AsyncValue.loading();

    // 2. Perform the heavy lifting on the server
    await ref
        .read(authProvider.notifier)
        .updateAcademicContext(semester, nextYear);
  }

  Future<void> setYear(String year) async {
    final current = state.value;
    final nextSemester =
        current?.semester ??
        calculateCurrentAcademicInfo()['current_semester']!;

    // 1. Show loading immediately
    state = const AsyncValue.loading();

    // 2. Update server
    await ref
        .read(authProvider.notifier)
        .updateAcademicContext(nextSemester, year);
  }
}

(int, int) _parseAcademicYear(String year) {
  final parts = year.split('-');

  // Expand short-form start year: "25-26" → "2025-2026".
  var startPart = parts.isNotEmpty ? parts.first : '';
  if (startPart.length == 2) startPart = '20$startPart';
  final start = int.tryParse(startPart) ?? DateTime.now().year;

  int? end;
  if (parts.length > 1) {
    final endPart = parts[1];
    // Expand 1- or 2-digit suffixes: "5" → "2005", "26" → "2026".
    // A full 4-digit year is used as-is.
    if (endPart.length <= 2) {
      end = int.tryParse('20$endPart');
    } else {
      end = int.tryParse(endPart);
    }
  }

  return (start, end ?? start + 1);
}
