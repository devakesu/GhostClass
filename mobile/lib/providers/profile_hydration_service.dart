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
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
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
  bool _profileRefreshInFlightIsForced = false;
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
    _profileRefreshInFlightIsForced = false;
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
    final results = await Future.wait<dynamic>([
      storage.getNormalizedEzygoToken(),
      storage.getAcademicState(),
    ]);
    final ezygoToken = results[0] as String?;
    final localAcademic = results[1] as AcademicState?;

    final user = await buildStoredUserForIdentity(
      supabaseUserId: session.user.id,
      ezygoToken: ezygoToken ?? '',
    );

    final hasAcademic =
        localAcademic != null &&
        localAcademic.semester.trim().isNotEmpty &&
        localAcademic.year.trim().isNotEmpty;

    if (hasAcademic) {
      ref.read(academicProvider.notifier).updateState(localAcademic);
    }

    // Trigger profile sync in parallel without blocking startup/splash screen
    AppLogger.safeUnawait(
      runBackgroundStartupHydration(user),
      'AuthNotifier: background startup hydration',
    );

    return user.copyWith(isSyncing: !hasAcademic);
  }

  void invalidateAllScreenProviders({bool includeNotifications = true}) {
    if (includeNotifications) {
      ref.invalidate(notificationsProvider);
    }
    ref
      ..invalidate(dashboardProvider)
      ..invalidate(trackingProvider)
      ..invalidate(leaveProvider)
      ..invalidate(scoreProvider);
  }

  void handleCronSyncResult(CronSyncResult? result) {
    if (result == null) return;
    if (result.hasChanges) {
      AppLogger.i(
        'ProfileHydrationService: Cron sync reported changes ($result). '
        'Clearing caches and invalidating all screen providers.',
      );
      ref.read(apiServiceProvider).clearCaches();

      // Proactively evict disk caches for Supabase-backed tracking and dashboard
      // data so that if the app is killed before the background SWR finishes
      // writing fresh data, the next cold open doesn't serve stale cron-era data.
      AppLogger.safeUnawait(
        _evictTrackingAndDashboardDiskCache(),
        'ProfileHydrationService: evict disk cache on cron sync changes',
      );

      invalidateAllScreenProviders();
    } else {
      AppLogger.d(
        'ProfileHydrationService: Cron sync reported no changes ($result).',
      );
    }
  }

  Future<void> _evictTrackingAndDashboardDiskCache() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final user = ref.read(authProvider).value;
      final academic = ref.read(academicProvider).value;
      if (user == null || academic == null) return;

      final suffix =
          '${user.supabaseUserId}_${academic.semester}_${academic.year}';

      await Future.wait([
        storage.deleteCachedData('tracking_records_$suffix').catchError(
          (Object e, StackTrace st) {
            AppLogger.e(
              'ProfileHydrationService: Failed to delete tracking_records cache',
              e, st,
            );
          },
        ),
        storage.deleteCachedData('tracking_report_$suffix').catchError(
          (Object e, StackTrace st) {
            AppLogger.e(
              'ProfileHydrationService: Failed to delete tracking_report cache',
              e, st,
            );
          },
        ),
        storage.deleteCachedData('dashboard_attendance_$suffix').catchError(
          (Object e, StackTrace st) {
            AppLogger.e(
              'ProfileHydrationService: Failed to delete dashboard_attendance cache',
              e, st,
            );
          },
        ),
      ]);

      AppLogger.d(
        'ProfileHydrationService: Disk cache evicted for $suffix after cron sync.',
      );
    } on Object catch (e, st) {
      AppLogger.e(
        'ProfileHydrationService: Unexpected error during disk cache eviction',
        e, st,
      );
    }
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
    // Only coalesce if the in-flight request has equal-or-greater priority.
    // A force=true caller should NOT be coalesced into a non-forced in-flight
    // because the non-forced request may skip the full EzyGo sync.
    if (inFlight != null && (!force || _profileRefreshInFlightIsForced)) {
      return inFlight;
    }

    // If a non-forced request is in-flight and we need a forced one, wait for
    // the current one to complete then fire the forced refresh.
    if (inFlight != null && force && !_profileRefreshInFlightIsForced) {
      AppLogger.i(
        'ProfileHydrationService: Forced refresh requested while non-forced is '
        'in-flight. Will chain a forced refresh after current completes.',
      );
      final future = inFlight.then((_) => _fetchAndApplyServerProfile(
            user,
            supabaseToken: supabaseToken,
            updateState: updateState,
            sync: true,
            force: true,
          ));
      _profileRefreshInFlight = future;
      _profileRefreshInFlightIsForced = true;
      return future.whenComplete(() {
        if (identical(_profileRefreshInFlight, future)) {
          _profileRefreshInFlight = null;
          _profileRefreshInFlightIsForced = false;
        }
      });
    }

    final future = _fetchAndApplyServerProfile(
      user,
      supabaseToken: supabaseToken,
      updateState: updateState,
      sync: sync,
      force: force,
    );
    _profileRefreshInFlight = future;
    _profileRefreshInFlightIsForced = force;

    return future.whenComplete(() {
      if (identical(_profileRefreshInFlight, future)) {
        _profileRefreshInFlight = null;
        _profileRefreshInFlightIsForced = false;
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
        data['current_semester'] ??
        rawProfile['current_semester'] ??
        currentUser.profile?.currentSemester;
    rawProfile['current_year'] =
        data['current_year'] ??
        rawProfile['current_year'] ??
        currentUser.profile?.currentYear;

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

    final localAcademic = await storage.getAcademicState();
    final oldSem =
        currentUser.profile?.currentSemester ?? localAcademic?.semester;
    final oldYear = currentUser.profile?.currentYear ?? localAcademic?.year;
    final oldClassLabel = currentUser.profile?.classField?.name;

    final classChanged =
        oldClassLabel != null && oldClassLabel != newClassLabel;
    final academicChanged =
        semestersDiffer(oldSem, newSem) || yearsDiffer(oldYear, newYear);

    if (academicChanged || classChanged) {
      AppLogger.i(
        'AuthNotifier: Academic context or class changed (sem: $oldSem->$newSem, year: $oldYear->$newYear, class: $oldClassLabel->$newClassLabel). '
        'Purging caches and invalidating page providers.',
      );
      ref.read(apiServiceProvider).clearCaches();
      await storage.clearAllCachedData();

      if (nextAcademic != null) {
        await storage.saveAcademicState(nextAcademic);
        ref.read(academicProvider.notifier).updateState(nextAcademic);
      }

      ref.invalidate(academicProvider);
      invalidateAllScreenProviders();
    } else {
      if (nextAcademic != null) {
        try {
          ref.read(academicProvider.notifier).updateState(nextAcademic);
        } on Object catch (e) {
          AppLogger.d('AuthNotifier: Direct academic set skipped: $e');
        }
      }
    }

    if (updateState) authNotifier.updateState(mergedUser);
    _lastRefresh = DateTime.now();
    return mergedUser;
  }

  static bool yearsDiffer(String? y1, String? y2) {
    if (y1 == null || y2 == null) return false;
    final s1 = y1.trim();
    final s2 = y2.trim();
    if (s1 == s2) return false;

    final nums1 = RegExp(
      r'\d+',
    ).allMatches(s1).map((m) => m.group(0)!).toList();
    final nums2 = RegExp(
      r'\d+',
    ).allMatches(s2).map((m) => m.group(0)!).toList();
    if (nums1.isEmpty || nums2.isEmpty) return s1 != s2;

    final norm1 = nums1
        .map(
          (n) => n.length > 2 ? n.substring(n.length - 2) : n.padLeft(2, '0'),
        )
        .toList();
    final norm2 = nums2
        .map(
          (n) => n.length > 2 ? n.substring(n.length - 2) : n.padLeft(2, '0'),
        )
        .toList();
    if (norm1.length == norm2.length) {
      for (var i = 0; i < norm1.length; i++) {
        if (norm1[i] != norm2[i]) return true;
      }
      return false;
    }
    return s1 != s2;
  }

  static String normalizeSem(String s) {
    final lower = s.trim().toLowerCase();
    if (lower == '1' || lower == 'odd' || lower == 'i') return 'odd';
    if (lower == '2' || lower == 'even' || lower == 'ii') return 'even';
    return lower;
  }

  static bool semestersDiffer(String? s1, String? s2) {
    if (s1 == null || s2 == null) return false;
    return normalizeSem(s1) != normalizeSem(s2);
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
