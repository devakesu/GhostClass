import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

final profileHydrationServiceProvider =
    NotifierProvider<ProfileHydrationService, void>(
      ProfileHydrationService.new,
    );

class ProfileHydrationService extends Notifier<void> {
  Future<void>? _refreshProfileInFlight;
  Future<AuthenticatedUser>? _profileRefreshInFlight;
  int _profileRefreshGeneration = 0;
  DateTime? _lastRefresh;

  @override
  void build() {
    // No-op state
  }

  void reset() {
    _profileRefreshGeneration++;
    _refreshProfileInFlight = null;
    _profileRefreshInFlight = null;
    _lastRefresh = null;
  }

  Future<void> refreshProfile({
    bool force = false,
  }) async {
    final inFlight = _refreshProfileInFlight;
    if (inFlight != null) return inFlight;

    final future = _refreshProfileInternal(
      force: force,
    );
    _refreshProfileInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshProfileInFlight, future)) {
        _refreshProfileInFlight = null;
      }
    });
  }

  Future<void> syncProfile() => refreshProfile(force: true);

  Future<void> _refreshProfileInternal({
    bool force = false,
  }) async {
    final authNotifier = ref.read(authProvider.notifier);
    final currentUser = ref.read(authProvider).value;
    if (currentUser == null) return;

    if (!force &&
        _lastRefresh != null &&
        DateTime.now().difference(_lastRefresh!) < const Duration(minutes: 5)) {
      return;
    }

    if (force &&
        _lastRefresh != null &&
        DateTime.now().difference(_lastRefresh!) < const Duration(seconds: 5)) {
      return;
    }

    try {
      final token = await authNotifier.getFreshSupabaseToken();
      if (token == null) {
        await authNotifier.logout();
        return;
      }

      await _fetchAndApplyServerProfile(
        currentUser,
        supabaseToken: token,
        sync: force,
        force: force,
      );
    } on Object catch (e) {
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
    }
  }

  Future<void> acceptTerms() async {
    final authNotifier = ref.read(authProvider.notifier);
    final user = ref.read(authProvider).value;
    if (user == null) return;

    final token = await authNotifier.getFreshSupabaseToken();
    if (token == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);
    final version = AppConfig.termsVersion;

    try {
      await api.acceptTerms(token, version);
      await storage.saveTermsVersion(version);
      authNotifier.updateState(user.copyWith(termsVersion: version));
      try {
        await AnalyticsService.instance.logAcceptTerms(version);
      } on Object catch (_) {}
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Terms acceptance failed', e);
      rethrow;
    }
  }

  Future<AuthenticatedUser?> buildFromCurrentSession() async {
    final session = ref.read(supabaseClientProvider).auth.currentSession;
    if (session == null) return null;

    final storage = ref.read(secureStorageProvider);
    final ezygoToken = await storage.getNormalizedEzygoToken();

    final user = await buildStoredUserForIdentity(
      supabaseUserId: session.user.id,
      ezygoToken: ezygoToken ?? '',
    );

    // Trigger profile sync in parallel without blocking startup/splash screen
    AppLogger.safeUnawait(
      runBackgroundStartupHydration(user),
      'AuthNotifier: background startup hydration',
    );

    return user.copyWith(isSyncing: true);
  }

  Future<void> runBackgroundStartupHydration(
    AuthenticatedUser cachedUser, {
    bool silent = false,
  }) async {
    final api = ref.read(apiServiceProvider)..suppress401 = true;
    final authNotifier = ref.read(authProvider.notifier);
    try {
      final token = await authNotifier.getFreshSupabaseToken();
      if (token == null) {
        throw const AppException(
          message: 'Auth session dead',
          type: AppExceptionType.unauthorized,
        );
      }

      // 1. Fetch Profile and trigger backend full EzyGo sync synchronously
      await runProfileRefresh(
        cachedUser,
        supabaseToken: token,
        sync: true,
        force: true,
      );
      _lastRefresh = DateTime.now();

      // Pre-fetch institutions so they are ready in settings
      AppLogger.safeUnawait(
        ref.read(institutionsProvider.future).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e('AuthNotifier: prefetch institutions failed', e, st);
          return <Institution>[];
        }),
        'AuthNotifier: prefetch institutions',
      );

      // If we are not running silently, clear the syncing status to unlock the UI
      if (!silent) {
        final finalUser = ref.read(authProvider).value;
        if (finalUser != null &&
            finalUser.supabaseUserId == cachedUser.supabaseUserId) {
          authNotifier.updateState(finalUser.copyWith(isSyncing: false));
        }
      }
    } on Object catch (e) {
      if (e is AppException && e.isAuthError) {
        AppLogger.e('AuthNotifier: Background auth error, logging out', e);
        await authNotifier.logout();
        return;
      }

      AppLogger.e(
        'AuthNotifier: Background startup hydration failed. Using cached data.',
        e,
      );
      if (!silent) {
        final currentUser = ref.read(authProvider).value;
        if (currentUser != null &&
            currentUser.supabaseUserId == cachedUser.supabaseUserId) {
          authNotifier.updateState(currentUser.copyWith(isSyncing: false));
        }
      }
    } finally {
      api.suppress401 = false;
    }
  }

  Future<void> updateAvatar(String publicUrl) async {
    final authNotifier = ref.read(authProvider.notifier);
    final user = ref.read(authProvider).value;
    if (user == null) return;
    await ref
        .read(profileServiceProvider)
        .updateAvatar(user.supabaseUserId, publicUrl);
    final updatedProfile = user.profile?.copyWith(avatarUrl: () => publicUrl);
    if (updatedProfile != null) {
      await ref.read(secureStorageProvider).saveUserProfile(updatedProfile);
    }
    authNotifier.updateState(user.copyWith(profile: updatedProfile));
  }

  Future<void> deleteAccount() async {
    final authNotifier = ref.read(authProvider.notifier);
    final user = ref.read(authProvider).value;
    if (user == null) return;
    try {
      await ref.read(profileServiceProvider).deleteAccount(user.supabaseUserId);
      await authNotifier.logout();
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Account deletion failed', e);
      rethrow;
    }
  }

  Future<AuthenticatedUser> buildStoredUserForIdentity({
    required String supabaseUserId,
    required String ezygoToken,
    String? usernameOverride,
    String? ezygoIdOverride,
    String? termsVersionOverride,
    UserSettings? settingsFallback,
  }) async {
    final storage = ref.read(secureStorageProvider);

    final identityReads = await Future.wait<String?>([
      storage.getSupabaseUserId(),
      storage.getEzygoUserId(),
    ]);
    final storedSupabaseUserId = identityReads[0];
    final storedEzygoUserId = identityReads[1];

    final matchesIdentity =
        storedSupabaseUserId == null ||
        storedSupabaseUserId == supabaseUserId ||
        (ezygoIdOverride != null && storedEzygoUserId == ezygoIdOverride);

    Future<String?> usernameFuture() async =>
        matchesIdentity ? storage.getUsername() : null;

    Future<String?> termsVersionFuture() async =>
        matchesIdentity ? storage.getTermsVersion() : null;

    Future<UserSettings> settingsFuture() async {
      if (!matchesIdentity) {
        return settingsFallback ?? UserSettings.defaults();
      }
      return await storage.getSettings() ??
          settingsFallback ??
          UserSettings.defaults();
    }

    Future<UserProfile?> profileFuture() async =>
        matchesIdentity ? storage.getUserProfile() : null;

    final hydrationReads = await Future.wait<dynamic>([
      usernameFuture(),
      termsVersionFuture(),
      settingsFuture(),
      profileFuture(),
    ]);
    final storedUsername = hydrationReads[0] as String?;
    final storedTermsVersion = hydrationReads[1] as String?;
    final hydratedSettings = hydrationReads[2] as UserSettings;
    final hydratedProfile = hydrationReads[3] as UserProfile?;

    return AuthenticatedUser(
      supabaseUserId: supabaseUserId,
      ezygoToken: EncryptedValue.fromPlaintext(ezygoToken),
      ezygoId: ezygoIdOverride ?? (matchesIdentity ? storedEzygoUserId : null),
      username: usernameOverride ?? storedUsername,
      termsVersion: termsVersionOverride ?? storedTermsVersion,
      settings: hydratedSettings,
      profile: hydratedProfile,
    );
  }

  Future<AuthenticatedUser> _fetchAndApplyServerProfile(
    AuthenticatedUser user, {
    String? supabaseToken,
    bool updateState = true,
    bool sync = false,
    bool force = false,
  }) async {
    final authNotifier = ref.read(authProvider.notifier);
    final refreshGeneration = _profileRefreshGeneration;
    final token = supabaseToken ?? await authNotifier.getFreshSupabaseToken();
    if (token == null) {
      throw const AppException(
        message: 'Session dead',
        type: AppExceptionType.unauthorized,
      );
    }

    final api = ref.read(apiServiceProvider);
    final response = await api.refreshProfile(
      token,
      sync: sync,
      force: force,
    );

    if (response.statusCode == 401) {
      final data = response.data as Map<String, dynamic>?;
      final isTransientSecurity = isTransientSecurityPayload(data);
      throw AppException(
        message: isTransientSecurity
            ? 'Device verification is temporarily unavailable. Please retry in a few moments.'
            : formatApiError(data, 'Security Verification'),
        type: isTransientSecurity
            ? AppExceptionType.network
            : AppExceptionType.unauthorized,
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

    final updatedUser = await applyProfileResponseData(
      currentUser: user,
      data: response.data as Map<String, dynamic>,
      updateState: false,
    );

    if (updateState && refreshGeneration == _profileRefreshGeneration) {
      final currentState = ref.read(authProvider).value;
      if (currentState == null ||
          currentState.supabaseUserId == user.supabaseUserId) {
        authNotifier.updateState(updatedUser);
      }
    }

    return updatedUser;
  }

  Future<AuthenticatedUser> runProfileRefresh(
    AuthenticatedUser user, {
    String? supabaseToken,
    bool updateState = true,
    bool sync = false,
    bool force = false,
  }) {
    final inFlight = _profileRefreshInFlight;
    if (inFlight != null) return inFlight;

    final future = _fetchAndApplyServerProfile(
      user,
      supabaseToken: supabaseToken,
      updateState: updateState,
      sync: sync,
      force: force,
    );
    _profileRefreshInFlight = future;

    return future.whenComplete(() {
      if (identical(_profileRefreshInFlight, future)) {
        _profileRefreshInFlight = null;
      }
    });
  }

  Future<AuthenticatedUser> applyProfileResponseData({
    required AuthenticatedUser currentUser,
    required Map<String, dynamic> data,
    bool updateState = true,
  }) async {
    final authNotifier = ref.read(authProvider.notifier);
    final storage = ref.read(secureStorageProvider);
    final rawSettings = data['settings'] as Map<String, dynamic>?;
    final baseSettings = rawSettings != null
        ? UserSettings.fromJson(rawSettings)
        : currentUser.settings;

    final settings = baseSettings;

    final rawProfile = data.containsKey('profile')
        ? Map<String, dynamic>.from(data['profile'] as Map<dynamic, dynamic>)
        : Map<String, dynamic>.from(data);

    rawProfile['current_semester'] =
        data['current_semester'] ?? rawProfile['current_semester'];
    rawProfile['current_year'] =
        data['current_year'] ?? rawProfile['current_year'];

    final profile = UserProfile.fromJson(rawProfile);

    final mergedUser = currentUser.copyWith(
      settings: settings,
      profile: profile,
      ezygoToken: EncryptedValue.fromPlaintext(
        (data['ezygo_token'] as String?) ?? currentUser.ezygoToken.value,
      ),
      ezygoId:
          (data['id'] ??
                  data['user_id'] ??
                  data['ezygo_user_id'] ??
                  data['ezygo_id'])
              ?.toString() ??
          currentUser.ezygoId,
      termsVersion: _extractTermsVersion(data) ?? currentUser.termsVersion,
      username: data['username'] as String? ?? currentUser.username,
    );

    final nextAcademic =
        (data['current_semester'] != null && data['current_year'] != null)
        ? AcademicState(
            semester: data['current_semester']! as String,
            year: data['current_year']! as String,
          )
        : null;

    final currentSession = ref.read(supabaseClientProvider).auth.currentSession;
    if ((ref.read(authProvider).value == null &&
            !ref.read(authProvider).isLoading) ||
        currentSession == null) {
      AppLogger.i(
        'AuthNotifier: Skipping profile apply because user logged out during refresh',
      );
      _lastRefresh = DateTime.now();
      return mergedUser;
    }

    final saves = <Future<void>>[
      storage.saveEzygoToken(mergedUser.ezygoToken.value).catchError((
        Object e,
        StackTrace st,
      ) {
        AppLogger.e(
          'AuthNotifier: Failed to persist ezygo token (profile apply)',
          e,
          st,
        );
      }),
      storage.saveSupabaseUserId(mergedUser.supabaseUserId).catchError((
        Object e,
        StackTrace st,
      ) {
        AppLogger.e(
          'AuthNotifier: Failed to persist supabase id (profile apply)',
          e,
          st,
        );
      }),
      storage.saveSettings(settings).catchError((Object e, StackTrace st) {
        AppLogger.e(
          'AuthNotifier: Failed to persist settings (profile apply)',
          e,
          st,
        );
      }),
      storage.saveUserProfile(profile).catchError((Object e, StackTrace st) {
        AppLogger.e(
          'AuthNotifier: Failed to persist profile (profile apply)',
          e,
          st,
        );
      }),
      if (mergedUser.ezygoId != null)
        storage.saveEzygoUserId(mergedUser.ezygoId!).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist ezygo id (profile apply)',
            e,
            st,
          );
        }),
      if (mergedUser.username != null)
        storage.saveUsername(mergedUser.username!).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist username (profile apply)',
            e,
            st,
          );
        }),
      if (mergedUser.termsVersion != null)
        storage.saveTermsVersion(mergedUser.termsVersion!).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist terms version (profile apply)',
            e,
            st,
          );
        }),
      if (nextAcademic != null)
        storage.saveAcademicState(nextAcademic).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist academic state (profile apply)',
            e,
            st,
          );
        }),
    ];
    await Future.wait(saves);

    final newSem = profile.currentSemester;
    final newYear = profile.currentYear;
    final newClassLabel = profile.classField?.name;

    final oldSem = currentUser.profile?.currentSemester;
    final oldYear = currentUser.profile?.currentYear;
    final oldClassLabel = currentUser.profile?.classField?.name;

    final classChanged =
        oldClassLabel != null && oldClassLabel != newClassLabel;
    final academicChanged =
        (oldSem != null && oldSem != newSem) ||
        (oldYear != null && oldYear != newYear);

    if (academicChanged || classChanged) {
      AppLogger.i(
        'AuthNotifier: Academic context or class changed (sem: $oldSem->$newSem, year: $oldYear->$newYear, class: $oldClassLabel->$newClassLabel). '
        'Purging caches and invalidating page providers.',
      );
      ref.read(apiServiceProvider).clearCaches();
      await storage.clearAllCachedData();

      ref.invalidate(academicProvider);
    } else {
      if (nextAcademic != null) {
        AppLogger.safeUnawait(
          Future.delayed(Duration.zero, () {
            ref
                .read(academicProvider.notifier)
                .updateState(
                  nextAcademic,
                );
          }).catchError((Object e, StackTrace st) {
            AppLogger.e('AuthNotifier: Deferred academic set failed', e, st);
          }),
          'AuthNotifier: deferred academic set',
        );
      }
    }

    if (updateState) authNotifier.updateState(mergedUser);
    _lastRefresh = DateTime.now();
    return mergedUser;
  }

  String? _extractTermsVersion(Map<String, dynamic> data) {
    if (data['terms_version'] != null) return data['terms_version'].toString();
    final profile = data['profile'] as Map<dynamic, dynamic>?;
    if (profile != null && profile['terms_version'] != null) {
      return profile['terms_version'].toString();
    }
    return null;
  }
}
