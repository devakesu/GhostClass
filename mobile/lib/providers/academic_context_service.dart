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

  Future<void> updateAcademicContext(
    String? sem,
    String? year, {
    bool optimistic = false,
  }) async {
    final authNotifier = ref.read(authProvider.notifier);
    final user = ref.read(authProvider).value;
    if (user == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    if (!optimistic) {
      // Non-optimistic: show syncing loader while we also do a full profile refresh.
      authNotifier.updateState(user.copyWith(isSyncing: true));
    } else {
      // Optimistic: also show a brief syncing indicator while EzyGo server
      // settings are being updated (~500ms). This clears at line 88 when
      // authNotifier.updateState is called with isSyncing: false.
      authNotifier.updateState(user.copyWith(isSyncing: true));
    }

    try {
      final currentAcademic = await storage.getAcademicState();
      final nextSem =
          sem ??
          currentAcademic?.semester ??
          calculateCurrentAcademicInfo()['current_semester']!;
      final nextYear =
          year ??
          currentAcademic?.year ??
          calculateCurrentAcademicInfo()['current_year']!;
      final nextAcademic = AcademicState.canonical(nextSem, nextYear);

      // Sequentially update EzyGo server settings to prevent race conditions on EzyGo
      if (year != null) {
        final res = await api.updateAcademicYear(nextAcademic.year, storage);
        if (res.statusCode != 200 && res.statusCode != 201) {
          final resData = res.data as Map<String, dynamic>?;
          throw Exception(formatApiError(resData, 'Auth.AcademicUpdate'));
        }
      }
      if (sem != null) {
        final res = await api.updateSemester(nextAcademic.semester, storage);
        if (res.statusCode != 200 && res.statusCode != 201) {
          final resData = res.data as Map<String, dynamic>?;
          throw Exception(formatApiError(resData, 'Auth.AcademicUpdate'));
        }
      }

      final updatedSettings = user.settings.copyWith(
        semester: nextAcademic.semester,
        academicYear: nextAcademic.year,
      );
      final updatedProfile = user.profile?.copyWith(
        currentSemester: nextAcademic.semester,
        currentYear: nextAcademic.year,
      );

      await Future.wait([
        storage.saveAcademicState(nextAcademic),
        storage.saveSettings(updatedSettings),
        if (updatedProfile != null) storage.saveUserProfile(updatedProfile),
      ]);

      authNotifier.updateState(
        user.copyWith(
          settings: updatedSettings,
          profile: updatedProfile,
          isSyncing: false,
        ),
      );

      // Clear API caches BEFORE updating academic state so that when the
      // dashboardProvider/trackingProvider builds are released (they are
      // suspended waiting on academicProvider.future), they fetch from EzyGo
      // with a clean cache and the correct semester already set server-side.
      api.clearCaches();
      ref.read(academicProvider.notifier).updateState(nextAcademic);

      if (!optimistic) {
        final token = await authNotifier.getFreshSupabaseToken();
        if (token == null) {
          await authNotifier.logout();
          return;
        }

        try {
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

          final currentUser = ref.read(authProvider).value ?? user;
          await ref
              .read(profileHydrationServiceProvider.notifier)
              .applyProfileResponseData(
                currentUser: currentUser.copyWith(isSyncing: false),
                data: response.data as Map<String, dynamic>,
              );
        } on Object catch (profileErr) {
          AppLogger.e(
            'AcademicContextService: Profile refresh during academic update failed',
            profileErr,
          );
          if (profileErr is AppException && profileErr.isAuthError) {
            rethrow;
          }
        }

        // Re-assert persistence of chosen academic context and ensure the
        // notifier reflects the user's explicit choice (profile refresh may
        // have overwritten it with a server value).
        await storage.saveAcademicState(nextAcademic);
        ref.read(academicProvider.notifier).updateState(nextAcademic);

        // Invalidate all screen providers to reload data for the new context.
        // Do NOT call ref.invalidate(academicProvider) here — the state was
        // already set via updateState above, and a second invalidation would
        // trigger an extra dashboard rebuild that may apply stale tracking data.
        ref
            .read(profileHydrationServiceProvider.notifier)
            .invalidateAllScreenProviders();
      } else {
        // In optimistic mode, the academic state and dashboard data have already been updated.
        // Asynchronously refresh the profile in the background so that profile.classField and backend
        // user metadata are synchronized without delaying user interaction.
        AppLogger.safeUnawait(
          ref
              .read(profileHydrationServiceProvider.notifier)
              .refreshProfile(force: true)
              .catchError((Object e, StackTrace st) {
                AppLogger.e(
                  'AcademicContextService: Background profile refresh failed',
                  e,
                  st,
                );
              }),
          'AcademicContextService.backgroundProfileRefresh',
        );
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
    } finally {
      final finalUser = ref.read(authProvider).value;
      if (finalUser != null && finalUser.isSyncing) {
        authNotifier.updateState(finalUser.copyWith(isSyncing: false));
      }
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
