import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

final academicContextServiceProvider =
    NotifierProvider<AcademicContextService, void>(
      AcademicContextService.new,
    );

class AcademicContextService extends Notifier<void> {
  @override
  void build() {
    // No-op state
  }

  Future<void> updateAcademicContext(String? sem, String? year) async {
    final authNotifier = ref.read(authProvider.notifier);
    final user = ref.read(authProvider).value;
    if (user == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      if (year != null) {
        final yearResponse = await api.updateAcademicYear(year, storage);
        if (yearResponse.statusCode != 200 && yearResponse.statusCode != 201) {
          final resData = yearResponse.data as Map<String, dynamic>?;
          throw Exception(formatApiError(resData, 'Auth.AcademicUpdate'));
        }
      }

      if (sem != null) {
        final semesterResponse = await api.updateSemester(sem, storage);
        if (semesterResponse.statusCode != 200 &&
            semesterResponse.statusCode != 201) {
          final resData = semesterResponse.data as Map<String, dynamic>?;
          throw Exception(formatApiError(resData, 'Auth.AcademicUpdate'));
        }
      }

      AcademicState? nextAcademic;
      if (sem != null || year != null) {
        final currentAcademic = await storage.getAcademicState();
        nextAcademic = AcademicState(
          semester:
              sem ??
              currentAcademic?.semester ??
              calculateCurrentAcademicInfo()['current_semester']!,
          year:
              year ??
              currentAcademic?.year ??
              calculateCurrentAcademicInfo()['current_year']!,
        );
        await storage.saveAcademicState(nextAcademic);
      }

      final syncingUser = user.copyWith(isSyncing: true);
      authNotifier.updateState(syncingUser);

      final token = await authNotifier.getFreshSupabaseToken();
      if (token == null) {
        await authNotifier.logout();
        return;
      }

      try {
        api.clearCaches();

        final response = await api.refreshProfile(
          token,
          sync: true,
          force: true,
        );
        if (response.statusCode == 401) {
          final data = response.data as Map<String, dynamic>?;
          throw AppException(
            message: formatApiError(data, 'Security Verification'),
            type: AppExceptionType.unauthorized,
            statusCode: 401,
            details: data,
          );
        }

        if (response.statusCode != 200 || response.data == null) {
          if (response.statusCode != null && response.statusCode! >= 500) {
            throw const AppException(
              message: 'Ezygo issues (5xx)',
              type: AppExceptionType.server,
            );
          }
          throw const AppException(
            message: 'Profile sync failed',
            type: AppExceptionType.server,
          );
        }

        await ref
            .read(profileHydrationServiceProvider.notifier)
            .applyProfileResponseData(
              currentUser: syncingUser,
              data: response.data as Map<String, dynamic>,
            );
      } finally {
        final finalUser = ref.read(authProvider).value;
        if (finalUser != null) {
          authNotifier.updateState(finalUser.copyWith(isSyncing: false));
        }
      }

      AppLogger.i(
        'AuthNotifier: Academic context updated successfully ($sem, $year)',
      );
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Failed to update academic context', e);
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.e(
            'AuthNotifier: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e('AuthNotifier: CRITICAL SECURITY RISK. Logging out.');
          }
          await authNotifier.logout();
        }
      }
      rethrow;
    }
  }

  Future<void> updateDefaultInstitution(int institutionId) async {
    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      final res = await api.updateDefaultInstitution(institutionId, storage);
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw Exception(formatApiError(res.data, 'Auth.Institution'));
      }

      await ref
          .read(profileHydrationServiceProvider.notifier)
          .refreshProfile(force: true);
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Institution update failed', e);
      rethrow;
    }
  }

  Future<List<Institution>> fetchInstitutions() async {
    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);
    final response = await api.getInstitutions(storage);

    if (response.statusCode != 200) {
      throw Exception(formatApiError(response.data, 'Institution Fetch'));
    }

    final all = (response.data as List)
        .map((i) => Institution.fromJson(i as Map<String, dynamic>))
        .toList();

    return all.where((i) => i.role.toLowerCase() == 'student').toList();
  }
}
