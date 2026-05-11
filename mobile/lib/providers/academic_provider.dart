import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:dio/dio.dart';

/// AcademicState
/// -------------
/// Represents the current academic context (semester and year) for the user.
/// Provides utility methods to derive start and end dates for filtering logs.
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
  
  // Handle cases like "2025" -> (2025, 2026)
  // This ensures reasonable defaults for single-year inputs.
  String startPart = parts.isNotEmpty ? parts.first : '';
  if (startPart.length == 2) startPart = '20$startPart';
  final start = int.tryParse(startPart) ?? DateTime.now().year;
  
  final end = parts.length > 1
      ? int.tryParse(parts[1].length == 2 ? '20${parts[1]}' : parts[1])
      : start + 1;
      
  return (start, end ?? start + 1);
}
