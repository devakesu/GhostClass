import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginException implements Exception {
  LoginException(this.message);
  final String message;
  @override
  String toString() => 'LoginException: $message';
}

// ─── Providers ────────────────────────────────────────────────────────────────

final Provider<StealthHeadersService> stealthHeadersServiceProvider = Provider(
  (ref) => StealthHeadersService(ref.watch(secureStorageProvider)),
);
final Provider<ProfileService> profileServiceProvider = Provider(
  (ref) => ProfileService(),
);
final Provider<SettingsService> settingsServiceProvider = Provider(
  (ref) => SettingsService(ref.watch(secureStorageProvider)),
);

final supabaseClientProvider = Provider<SupabaseClient>(
  (ref) => Supabase.instance.client,
);

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthenticatedUser?>(
  AuthNotifier.new,
);

final institutionsProvider = FutureProvider<List<Institution>>((ref) async {
  final userId = ref.read(authProvider).value?.supabaseUserId;
  if (userId == null) return [];
  return ref.read(authProvider.notifier).fetchInstitutions();
});

// ─── Authenticated User Model ─────────────────────────────────────────────────

@immutable
class AuthenticatedUser {
  const AuthenticatedUser({
    required this.supabaseUserId,
    required this.ezygoToken,
    required this.settings,
    this.ezygoId,
    this.username,
    this.termsVersion,
    this.profile,
    this.isSyncing = false,
    this.isUpdatingSettings = false,
  });
  final String supabaseUserId;
  final EncryptedValue ezygoToken;
  final String? ezygoId;
  final String? username;
  final String? termsVersion;
  final UserSettings settings;
  final UserProfile? profile;
  final bool isSyncing;
  final bool isUpdatingSettings;

  bool get termsAccepted => termsVersion == AppConfig.termsVersion;

  String get maskedToken {
    final token = ezygoToken.value;
    if (token.length <= 8) return '••••••••';
    return '••••••••${token.substring(token.length - 8)}';
  }

  AuthenticatedUser copyWith({
    String? supabaseUserId,
    EncryptedValue? ezygoToken,
    String? ezygoId,
    String? username,
    String? termsVersion,
    UserSettings? settings,
    UserProfile? profile,
    bool? isSyncing,
    bool? isUpdatingSettings,
  }) {
    return AuthenticatedUser(
      supabaseUserId: supabaseUserId ?? this.supabaseUserId,
      ezygoToken: ezygoToken ?? this.ezygoToken,
      settings: settings ?? this.settings,
      ezygoId: ezygoId ?? this.ezygoId,
      username: username ?? this.username,
      termsVersion: termsVersion ?? this.termsVersion,
      profile: profile ?? this.profile,
      isSyncing: isSyncing ?? this.isSyncing,
      isUpdatingSettings: isUpdatingSettings ?? this.isUpdatingSettings,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthenticatedUser &&
          runtimeType == other.runtimeType &&
          supabaseUserId == other.supabaseUserId &&
          ezygoToken == other.ezygoToken &&
          ezygoId == other.ezygoId &&
          username == other.username &&
          termsVersion == other.termsVersion &&
          settings == other.settings &&
          profile == other.profile &&
          isSyncing == other.isSyncing &&
          isUpdatingSettings == other.isUpdatingSettings;

  @override
  int get hashCode =>
      supabaseUserId.hashCode ^
      ezygoToken.hashCode ^
      ezygoId.hashCode ^
      username.hashCode ^
      termsVersion.hashCode ^
      settings.hashCode ^
      profile.hashCode ^
      isSyncing.hashCode ^
      isUpdatingSettings.hashCode;
}

// ─── Auth Notifier ────────────────────────────────────────────────────────────

/// AuthNotifier
/// ------------
/// A complex notifier that manages the authenticated user session,
/// self-healing token logic, periodic background refreshes, and
/// security lockdown procedures.
class AuthNotifier extends AsyncNotifier<AuthenticatedUser?>
    with WidgetsBindingObserver {
  Timer? _refreshTimer;
  DateTime? _lastRefresh;
  DateTime? _lastBackgroundedAt;
  bool _isRefreshing = false;
  bool _isInitializing = false;
  int _consecutiveHealFailures = 0;

  @override
  FutureOr<AuthenticatedUser?> build() async {
    WidgetsBinding.instance.addObserver(this);

    final apiService = ref.read(apiServiceProvider);
    final unauthorizedSub = apiService.onUnauthorized.listen((_) {
      final _ = _handleUnauthorized();
    });

    final lockdownSub = apiService.onSecurityLockdown.listen(
      _handleSecurityLockdown,
    );

    ref.onDispose(() {
      WidgetsBinding.instance.removeObserver(this);
      _refreshTimer?.cancel();
      unawaited(unauthorizedSub.cancel());
      unawaited(lockdownSub.cancel());
    });

    _startPeriodicRefresh();
    _isInitializing = true;

    try {
      final user = await _buildFromCurrentSession();
      AppLogger.i('AuthNotifier: Core hydration complete');
      return user;
    } finally {
      _isInitializing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _lastBackgroundedAt = DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final now = DateTime.now();
      if (_lastBackgroundedAt != null) {
        final backgroundDuration = now.difference(_lastBackgroundedAt!);
        if (backgroundDuration < const Duration(minutes: 15)) return;
      }
      final _ = refreshProfile(force: true, sync: true);
    }
  }

  void _startPeriodicRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(minutes: 30), (_) {
      final _ = refreshProfile();
    });
  }

  Future<void> _handleUnauthorized() async {
    if (_isRefreshing || _isInitializing) return;
    _isRefreshing = true;

    final api = ref.read(apiServiceProvider)..suppress401 = true;
    AppLogger.w('AuthNotifier: 401 DETECTED. Attempting self-healing...');

    try {
      final oldToken = state.value?.ezygoToken;
      if (state.value == null) {
        final recoveredUser = await _buildFromCurrentSession();
        if (recoveredUser != null) state = AsyncValue.data(recoveredUser);
      }

      final supabaseToken = await _getFreshSupabaseToken();
      if (supabaseToken == null) {
        await logout();
        return;
      }

      final syncRes = await api.syncMobileAuth(supabaseToken);
      if (syncRes.statusCode == 200 && syncRes.data is Map<String, dynamic>) {
        final syncData = syncRes.data as Map<String, dynamic>;
        final syncedToken = (syncData['ezygo_token'] as String?)?.trim();

        if (syncedToken != null && syncedToken.isNotEmpty) {
          await ref.read(secureStorageProvider).saveEzygoToken(syncedToken);

          final current = state.value;
          if (current != null) {
            final syncedTermsVersion = syncData['terms_version'] as String?;
            final syncedEzygoId = syncData['id']?.toString();
            state = AsyncValue.data(
              current.copyWith(
                ezygoToken: EncryptedValue.fromPlaintext(syncedToken),
                termsVersion: syncedTermsVersion,
                ezygoId: syncedEzygoId,
              ),
            );
          }
        }
      }

      await refreshProfile(force: true, sync: true);
      final newToken = state.value?.ezygoToken;

      if (newToken != null && newToken != oldToken) {
        AppLogger.i('AuthNotifier: SELF-HEALING SUCCESSFUL.');
        _consecutiveHealFailures = 0;
      } else {
        _consecutiveHealFailures++;
        AppLogger.w(
          'AuthNotifier: Self-healing did not produce a new token. Failures: $_consecutiveHealFailures',
        );

        if (_consecutiveHealFailures >= 3) {
          final lastError = state.error;
          final isSecurityError =
              lastError is AppException &&
              lastError.details?['type'] == 'security';

          if (isSecurityError) {
            AppLogger.w(
              'AuthNotifier: Terminal security block. Not logging out.',
            );
            _consecutiveHealFailures = 0; // Reset to allow more attempts later
          } else {
            AppLogger.e(
              'AuthNotifier: Terminal 401 loop detected. Logging out to protect state.',
            );
            await logout();
          }
        }
      }
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Self-healing error', e);
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.w(
            'AuthNotifier: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e('AuthNotifier: CRITICAL SECURITY RISK. Logging out.');
          }
          await logout();
        }
      }
    } finally {
      // Cooldown before allowing next 401 triggers to prevent tight cascades
      await Future<void>.delayed(const Duration(milliseconds: 1000));
      api.suppress401 = false;
      _isRefreshing = false;
    }
  }

  Future<void> _handleSecurityLockdown(Map<String, String> data) async {
    AppLogger.e('AuthNotifier: SECURITY LOCKDOWN TRIGGERED');

    // 1. Set failure state immediately to block UI
    ref
        .read(securityFailureProvider.notifier)
        .setFailure(
          data['title'],
          criticalRisk: true,
          reason: data['reason'],
          action: data['action'],
          source: data['technicalDetails'],
        );

    // 2. Perform forced logout and data wipe
    await logout(force: true);
  }

  Future<void> refreshProfile({bool force = false, bool sync = false}) async {
    final currentUser = state.value;
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
      final token = await _getFreshSupabaseToken();
      if (token == null) {
        await logout();
        return;
      }

      await _fetchAndApplyServerProfile(
        currentUser,
        supabaseToken: token,
        sync: sync,
      );
    } on Object catch (e) {
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.w(
            'AuthNotifier: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e('AuthNotifier: CRITICAL SECURITY RISK. Logging out.');
          }
          await logout();
        }
      }
    }
  }

  Future<void> syncProfile() => refreshProfile(force: true);

  Future<void> acceptTerms() async {
    final user = state.value;
    if (user == null) return;

    final token = await _getFreshSupabaseToken();
    if (token == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);
    final version = AppConfig.termsVersion;

    try {
      await api.acceptTerms(token, version);
      await storage.saveTermsVersion(version);
      state = AsyncValue.data(user.copyWith(termsVersion: version));
      try {
        await AnalyticsService.instance.logAcceptTerms(version);
      } on Object catch (_) {}
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Terms acceptance failed', e);
      rethrow;
    }
  }

  Future<AuthenticatedUser?> _buildFromCurrentSession() async {
    final session = ref.read(supabaseClientProvider).auth.currentSession;
    if (session == null) return null;

    final storage = ref.read(secureStorageProvider);
    final ezygoToken = await storage.getEzygoToken();

    final user = await _buildStoredUserForIdentity(
      supabaseUserId: session.user.id,
      ezygoToken: ezygoToken ?? '',
    );

    final api = ref.read(apiServiceProvider)..suppress401 = true;
    try {
      final token = await _getFreshSupabaseToken();
      if (token == null) {
        throw const AppException(
          message: 'Auth session dead',
          type: AppExceptionType.unauthorized,
        );
      }

      // Step 3 & 4: Fetch Profile & EzyGo Academic Context concurrently (non-blocking bottleneck)
      late final AuthenticatedUser updatedUser;
      await Future.wait([
        _fetchAndApplyServerProfile(
          user,
          supabaseToken: token,
          updateState: false,
        ).then((res) => updatedUser = res),
        _fetchAndSaveAcademicContext(token),
      ]);
      _lastRefresh = DateTime.now();

      // Step 5: Mark as syncing and kick off cron sync in background
      final syncingUser = updatedUser.copyWith(isSyncing: true);
      unawaited(
        Future.microtask(() async {
          try {
            // Pre-fetch institutions so they are ready in settings
            unawaited(ref.read(institutionsProvider.future));

            await api.triggerSync(token, force: true);
            // Refresh profile after cron so class name, etc. are accurate
            await refreshProfile(force: true);
          } on Object catch (e) {
            AppLogger.w('AuthNotifier: Background startup tasks failed', e);
          } finally {
            final finalUser = state.value;
            if (finalUser != null) {
              state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
            }
          }
        }),
      );

      return syncingUser;
    } on Object catch (e) {
      if (e is AppException && e.isAuthError) {
        await logout();
        return null;
      }

      // Network / server errors: return cached user so app is usable offline.
      AppLogger.w('AuthNotifier: Startup sync failed. Using cached data.', e);
      return user;
    } finally {
      api.suppress401 = false;
    }
  }

  /// Fetches sem/year from EzyGo and persists to secure storage.
  /// If EzyGo returns null/empty, calculates from the current date and
  /// POSTs the calculated values back to EzyGo so it stays in sync.
  /// This is called synchronously during startup — it blocks the splash screen.
  Future<void> _fetchAndSaveAcademicContext(String supabaseToken) async {
    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    // Clear any previously cached academic state so we always get a fresh value
    // (avoids showing last term's data after semester rollover)
    try {
      final results = await Future.wait<dynamic>([
        api.fetchSemester(storage),
        api.fetchAcademicYear(storage),
      ]);

      final semRes = results[0] as Response<dynamic>;
      final yearRes = results[1] as Response<dynamic>;

      String? extract(dynamic raw, String key) {
        if (raw == null) return null;
        if (raw is! Map<dynamic, dynamic>) {
          final s = raw.toString().trim();
          return s.isEmpty ? null : s;
        }
        final map = raw;
        if (map[key] != null) {
          return map[key].toString().trim().isEmpty
              ? null
              : map[key].toString().trim();
        }
        for (final k in ['data', 'value']) {
          final val = map[k];
          if (val == null) continue;
          if (val is! Map<dynamic, dynamic>) {
            return val.toString().trim().isEmpty ? null : val.toString().trim();
          }
          final nested = val;
          if (nested[key] != null) {
            return nested[key].toString().trim().isEmpty
                ? null
                : nested[key].toString().trim();
          }
        }
        return null;
      }

      var semester = extract(semRes.data, 'default_semester');
      var year = extract(yearRes.data, 'default_academic_year');

      AppLogger.i(
        'AuthNotifier: EzyGo academic context — semester=$semester year=$year',
      );

      // If EzyGo returned null/empty, calculate from date and POST back
      if (semester == null || year == null) {
        final fallback = calculateCurrentAcademicInfo();
        semester ??= fallback['current_semester']!;
        year ??= fallback['current_year']!;

        AppLogger.i(
          'AuthNotifier: EzyGo academic context missing — using fallback ($semester, $year) and posting back',
        );

        // Best-effort POST — do not throw if this fails
        try {
          await Future.wait([
            api.updateSemester(semester, storage),
            api.updateAcademicYear(year, storage),
          ]);
        } on Object catch (e) {
          AppLogger.w(
            'AuthNotifier: Could not POST fallback academic context to EzyGo',
            e,
          );
        }
      }

      final academicState = AcademicState(semester: semester, year: year);
      await storage.saveAcademicState(academicState);
      AppLogger.i('AuthNotifier: Academic context saved — $semester / $year');
    } on Object catch (e) {
      // EzyGo is down: calculate fallback and persist it so the app still works
      AppLogger.w(
        'AuthNotifier: Failed to fetch academic context from EzyGo. Using date-based fallback.',
        e,
      );
      final fallback = calculateCurrentAcademicInfo();
      final academicState = AcademicState(
        semester: fallback['current_semester']!,
        year: fallback['current_year']!,
      );
      await storage.saveAcademicState(academicState);
    }
  }

  Future<void> login(String username, String password) async {
    ref.invalidate(institutionsProvider);
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final storage = ref.read(secureStorageProvider);

      final bridgeResponse = await api.loginAndProvision(
        username: username,
        password: password,
      );

      if (bridgeResponse.statusCode != 200 &&
          bridgeResponse.statusCode != 201) {
        final data = bridgeResponse.data as Map<String, dynamic>?;
        final errorMsg = formatApiError(data, 'Secure Session');
        throw AppException(
          message: errorMsg,
          type: bridgeResponse.statusCode == 401
              ? AppExceptionType.unauthorized
              : AppExceptionType.server,
          statusCode: bridgeResponse.statusCode,
          details: data,
        );
      }

      final bridgeData = bridgeResponse.data as Map<String, dynamic>;

      if (kDebugMode) {
        AppLogger.d(
          'AuthNotifier: Bridge response received with ${bridgeData.length} top-level fields',
        );
      }

      final sessionData =
          (bridgeData['session'] ?? bridgeData) as Map<String, dynamic>?;
      final refreshToken = sessionData?['refresh_token'] as String?;
      if (refreshToken == null) {
        throw const AppException(
          message: 'Secure session failed: No refresh token returned.',
          type: AppExceptionType.unauthorized,
        );
      }

      await ref.read(supabaseClientProvider).auth.signOut();
      final authResponse = await ref
          .read(supabaseClientProvider)
          .auth
          .setSession(refreshToken);
      final supabaseUser = authResponse.user;
      if (supabaseUser == null) {
        throw const AppException(
          message: 'Identity recovery failed',
          type: AppExceptionType.unauthorized,
        );
      }

      final settingsFallback = bridgeData['settings'] != null
          ? UserSettings.fromJson(
              bridgeData['settings'] as Map<String, dynamic>,
            )
          : UserSettings.defaults();

      final ezygoId = (bridgeData['id'] ?? bridgeData['user_id'])?.toString();
      final termsVersion = _extractTermsVersion(
        bridgeData,
      );
      final ezygoToken = (bridgeData['ezygo_token'] as String?) ?? '';

      // Extract initial academic context from bridge response
      final initialSem =
          bridgeData['current_semester'] ?? bridgeData['semester'];
      final initialYear =
          bridgeData['current_year'] ?? bridgeData['academic_year'];

      final settingsWithAcademic = settingsFallback.copyWith(
        semester: initialSem?.toString(),
        academicYear: initialYear?.toString(),
      );

      await Future.wait([
        storage.saveEzygoToken(ezygoToken),
        storage.saveSupabaseUserId(supabaseUser.id),
        storage.saveUsername(username),
        storage.saveSettings(settingsWithAcademic),
        if (ezygoId != null) storage.saveEzygoUserId(ezygoId),
        if (termsVersion != null) storage.saveTermsVersion(termsVersion),
      ]);

      final cachedUser = await _buildStoredUserForIdentity(
        supabaseUserId: supabaseUser.id,
        ezygoToken: ezygoToken,
        usernameOverride: username,
        ezygoIdOverride: ezygoId,
        termsVersionOverride: termsVersion,
        settingsFallback: settingsWithAcademic,
      );

      final profileService = ref.read(profileServiceProvider);
      if (profileService.hasRenderableLocalProfile(cachedUser.profile)) {
        state = AsyncValue.data(cachedUser);
        unawaited(Future.microtask(() => refreshProfile(force: true)));
        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
        return;
      }

      final token = await _getFreshSupabaseToken();
      if (token != null) {
        // Fetch sem/year from EzyGo (blocking — user waits on login screen)
        await _fetchAndSaveAcademicContext(token);

        // Mark as syncing and kick off cron sync in background
        final profiledUser = await _fetchAndApplyServerProfile(
          cachedUser,
          supabaseToken: token,
          updateState: false,
        );
        final syncingUser = profiledUser.copyWith(isSyncing: true);
        state = AsyncValue.data(syncingUser);
        unawaited(
          Future.microtask(() async {
            try {
              // Pre-fetch institutions so they are ready in settings
              unawaited(ref.read(institutionsProvider.future));

              await ref
                  .read(apiServiceProvider)
                  .triggerSync(token, force: true);
              await refreshProfile(force: true);
            } on Object catch (e) {
              AppLogger.w('AuthNotifier: Post-login cron sync failed', e);
            } finally {
              final finalUser = state.value;
              if (finalUser != null) {
                state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
              }
            }
          }),
        );

        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      } else {
        await _fetchAndApplyServerProfile(cachedUser);
        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      }
    } on AuthException catch (e, st) {
      AppLogger.e('AuthNotifier: SUPABASE AUTH ERROR', e);
      state = AsyncValue.error(e, st);
      rethrow;
    } catch (e, st) {
      AppLogger.e('AuthNotifier: LOGIN ERROR', e);
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout({bool force = false}) async {
    final storage = ref.read(secureStorageProvider);
    // Reset security failure state on normal logout so the next login starts clean.
    if (!force) {
      ref.read(securityFailureProvider.notifier).clearFailure();
    }
    ref.read(apiServiceProvider).clearCaches();
    ref.invalidate(institutionsProvider);

    state = const AsyncValue.data(null);
    try {
      await Future.wait([
        ref.read(supabaseClientProvider).auth.signOut(),
        storage.clearAll(),
        _clearSharedPrefs(),
      ]);
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: LOGOUT CLEANUP ERROR', e);
    }
    try {
      await AnalyticsService.instance.logLogout();
    } on Object catch (_) {}
  }

  Future<void> _clearSharedPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
    } on Object catch (e, st) {
      AppLogger.e('AuthNotifier: Failed to clear shared preferences', e, st);
    }
  }

  Future<void> updateAvatar(String publicUrl) async {
    final user = state.value;
    if (user == null) return;
    await ref
        .read(profileServiceProvider)
        .updateAvatar(user.supabaseUserId, publicUrl);
    final updatedProfile = user.profile?.copyWith(avatarUrl: publicUrl);
    if (updatedProfile != null) {
      await ref.read(secureStorageProvider).saveUserProfile(updatedProfile);
    }
    state = AsyncValue.data(user.copyWith(profile: updatedProfile));
  }

  Future<void> deleteAccount() async {
    final user = state.value;
    if (user == null) return;
    try {
      await ref.read(profileServiceProvider).deleteAccount(user.supabaseUserId);
      await logout();
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: Account deletion failed', e);
      rethrow;
    }
  }

  Future<void> updateSettings({
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, String>>? disabledCourses,
  }) async {
    final user = state.value;
    if (user == null) return;

    final previousSettings = user.settings;

    // 1. Optimistic UI Update + Visual Feedback (isUpdatingSettings = true)
    final updatedSettings = user.settings.copyWith(
      bunkCalculatorEnabled: bunkEnabled ?? user.settings.bunkCalculatorEnabled,
      targetPercentage: targetPercentage ?? user.settings.targetPercentage,
      disabledCourses: disabledCourses ?? user.settings.disabledCourses,
    );

    state = AsyncValue.data(
      user.copyWith(
        settings: updatedSettings,
        isUpdatingSettings: true,
      ),
    );

    // 2. Persist
    final service = ref.read(settingsServiceProvider);
    try {
      await service.saveSettingsLocally(updatedSettings);
      await service.updateSettings(
        user.supabaseUserId,
        bunkEnabled: bunkEnabled,
        targetPercentage: targetPercentage,
        disabledCourses: disabledCourses,
      );
      // Analytics: settings updated
      try {
        final changes = <String, dynamic>{};
        if (bunkEnabled != null) {
          changes['bunkCalculatorEnabled'] = bunkEnabled;
        }
        if (targetPercentage != null) {
          changes['targetPercentage'] = targetPercentage;
        }
        if (disabledCourses != null) {
          changes['disabledCoursesCount'] = disabledCourses.length;
        }
        if (changes.isNotEmpty) {
          await AnalyticsService.instance.logSettingsUpdated(changes);
        }
      } on Object catch (_) {}
    } on Object catch (e) {
      AppLogger.w(
        'AuthNotifier: Settings persistence failed, rolling back.',
        e,
      );
      // Rollback to previous settings
      state = AsyncValue.data(
        user.copyWith(
          settings: previousSettings,
          isUpdatingSettings: false,
        ),
      );
      rethrow;
    } finally {
      // Clear updating flag if not already cleared by rollback
      final currentUser = state.value;
      if (currentUser != null && currentUser.isUpdatingSettings) {
        state = AsyncValue.data(
          currentUser.copyWith(isUpdatingSettings: false),
        );
      }
    }
  }

  Future<void> updateAcademicContext(String? sem, String? year) async {
    final user = state.value;
    if (user == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      // 1. Inform Ezygo of the change first (matches web parity)
      final updates = <Future<dynamic>>[];
      if (sem != null) updates.add(api.updateSemester(sem, storage));
      if (year != null) updates.add(api.updateAcademicYear(year, storage));

      if (updates.isNotEmpty) {
        final results = await Future.wait(updates);
        for (final r in results) {
          final res = r as Response<dynamic>;
          if (res.statusCode != 200 && res.statusCode != 201) {
            final resData = res.data as Map<String, dynamic>?;
            throw Exception(formatApiError(resData, 'Auth.AcademicUpdate'));
          }
        }
      }

      // 2. Update the dedicated academic state in storage immediately so providers see it
      if (sem != null || year != null) {
        final currentAcademic = await storage.getAcademicState();
        final nextAcademic = AcademicState(
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

      // 3. Trigger server-side profile sync to align database with new Ezygo state
      // This also updates our local profile and settings via _applyProfileResponseData.
      // We set isSyncing=true here to show the syncing overlay while backend sync runs.
      state = AsyncValue.data(user.copyWith(isSyncing: true));

      final token = await _getFreshSupabaseToken();
      if (token == null) {
        await logout();
        return;
      }

      // Fetch profile with sync=true to force database to sync with Ezygo and get the new class label first (blocking).
      final response = await api.refreshProfile(token, sync: true);
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

      final updatedUser = await _applyProfileResponseData(
        currentUser: user,
        data: response.data as Map<String, dynamic>,
      );

      // 4. Perform the remaining backend queries blocking (not ezygo ones)
      try {
        api.clearCaches();
        await api.triggerSync(token, force: true);

        // Fetch final profile (blocking)
        final finalResponse = await api.refreshProfile(token);
        if (finalResponse.statusCode == 200 && finalResponse.data != null) {
          await _applyProfileResponseData(
            currentUser: updatedUser,
            data: finalResponse.data as Map<String, dynamic>,
          );
        }
      } finally {
        final finalUser = state.value;
        if (finalUser != null) {
          state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
        }
      }

      AppLogger.i(
        'AuthNotifier: Academic context updated successfully ($sem, $year)',
      );
    } catch (e) {
      AppLogger.e('AuthNotifier: Failed to update academic context', e);
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.w(
            'AuthNotifier: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e('AuthNotifier: CRITICAL SECURITY RISK. Logging out.');
          }
          await logout();
        }
      }
      rethrow;
    }
  }

  Future<void> updateDefaultInstitution(int institutionId) async {
    final user = state.value;
    if (user == null) return;

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      final res = await api.updateDefaultInstitution(institutionId, storage);
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw Exception(formatApiError(res.data, 'Auth.Institution'));
      }

      // Update local state by re-fetching profile (this ensures ID and other fields sync)
      await refreshProfile(force: true);
    } catch (e) {
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

    // Achieve parity with web app: Only show institutions where user is a student
    return all.where((i) => i.role.toLowerCase() == 'student').toList();
  }

  // ─── Private Handlers ───────────────────────────────────────────────────────

  Future<AuthenticatedUser> _buildStoredUserForIdentity({
    required String supabaseUserId,
    required String ezygoToken,
    String? usernameOverride,
    String? ezygoIdOverride,
    String? termsVersionOverride,
    UserSettings? settingsFallback,
  }) async {
    final storage = ref.read(secureStorageProvider);
    final storedSupabaseUserId = await storage.getSupabaseUserId();
    final storedEzygoUserId = await storage.getEzygoUserId();

    final matchesIdentity =
        storedSupabaseUserId == null ||
        storedSupabaseUserId == supabaseUserId ||
        (ezygoIdOverride != null && storedEzygoUserId == ezygoIdOverride);

    return AuthenticatedUser(
      supabaseUserId: supabaseUserId,
      ezygoToken: EncryptedValue.fromPlaintext(ezygoToken),
      ezygoId: ezygoIdOverride ?? (matchesIdentity ? storedEzygoUserId : null),
      username:
          usernameOverride ??
          (matchesIdentity ? await storage.getUsername() : null),
      termsVersion:
          termsVersionOverride ??
          (matchesIdentity ? await storage.getTermsVersion() : null),
      settings: matchesIdentity
          ? await storage.getSettings() ??
                settingsFallback ??
                UserSettings.defaults()
          : settingsFallback ?? UserSettings.defaults(),
      profile: matchesIdentity ? await storage.getUserProfile() : null,
    );
  }

  Future<AuthenticatedUser> _fetchAndApplyServerProfile(
    AuthenticatedUser user, {
    String? supabaseToken,
    bool updateState = true,
    bool sync = false,
  }) async {
    final token = supabaseToken ?? await _getFreshSupabaseToken();
    if (token == null) {
      throw const AppException(
        message: 'Session dead',
        type: AppExceptionType.unauthorized,
      );
    }

    final api = ref.read(apiServiceProvider);
    final response = await api.refreshProfile(token, sync: sync);

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

    final updatedUser = await _applyProfileResponseData(
      currentUser: user,
      data: response.data as Map<String, dynamic>,
      updateState: false,
    );

    if (updateState) {
      state = AsyncValue.data(updatedUser);
    }

    if (sync) {
      unawaited(
        Future.microtask(() async {
          try {
            api.clearCaches();
            await api.triggerSync(token, force: true);
            await refreshProfile(force: true);
          } on Object catch (e) {
            AppLogger.w('AuthNotifier: Profile-triggered cron sync failed', e);
          } finally {
            final finalUser = state.value;
            if (finalUser != null) {
              state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
            }
          }
        }),
      );
    }

    return updatedUser;
  }

  Future<AuthenticatedUser> _applyProfileResponseData({
    required AuthenticatedUser currentUser,
    required Map<String, dynamic> data,
    bool updateState = true,
  }) async {
    final storage = ref.read(secureStorageProvider);
    final rawSettings = data['settings'] as Map<String, dynamic>?;
    final baseSettings = rawSettings != null
        ? UserSettings.fromJson(rawSettings)
        : currentUser.settings;

    final settings = baseSettings;

    final rawProfile = data.containsKey('profile')
        ? Map<String, dynamic>.from(data['profile'] as Map<dynamic, dynamic>)
        : Map<String, dynamic>.from(data);

    // Ensure current_semester/year are explicitly included in the map passed to fromJson
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

    await Future.wait([
      storage.saveEzygoToken(mergedUser.ezygoToken.value),
      storage.saveSupabaseUserId(mergedUser.supabaseUserId),
      storage.saveSettings(settings),
      storage.saveUserProfile(profile),
      if (mergedUser.ezygoId != null)
        storage.saveEzygoUserId(mergedUser.ezygoId!),
      if (mergedUser.username != null)
        storage.saveUsername(mergedUser.username!),
      if (mergedUser.termsVersion != null)
        storage.saveTermsVersion(mergedUser.termsVersion!),
    ]);

    if (updateState) state = AsyncValue.data(mergedUser);
    _lastRefresh = DateTime.now();
    return mergedUser;
  }

  Future<String?> _getFreshSupabaseToken() async {
    try {
      final session = ref.read(supabaseClientProvider).auth.currentSession;
      if (session == null) return null;
      if (session.isExpired) {
        final res = await ref
            .read(supabaseClientProvider)
            .auth
            .refreshSession();
        return res.session?.accessToken;
      }
      return session.accessToken;
    } on AuthException catch (e) {
      // User Request (Verification): Match proxy.ts logic from web app
      // Only return null (which triggers logout) if the session is definitively dead.
      // Codes like 'refresh_token_not_found' or 400 with 'Invalid Refresh Token' are terminal.
      final isTerminal =
          e.statusCode == '400' ||
          e.message.contains('refresh_token_not_found') ||
          e.message.contains('Invalid Refresh Token') ||
          e.message.contains('not found');

      if (isTerminal) {
        AppLogger.w('AuthNotifier: Supabase session terminal failure', e);
        return null;
      }

      // For other AuthExceptions (e.g. 500s, rate limits), treat as transient
      // network errors to avoid logging out the user prematurely.
      AppLogger.w(
        'AuthNotifier: Supabase transient auth error. Preventing logout.',
        e,
      );
      throw AppException(
        message: 'Supabase service issues: ${e.message}',
        type: AppExceptionType.network,
        originalError: e,
      );
    } on Object catch (e) {
      AppLogger.w(
        'AuthNotifier: Network error during token refresh. Preventing logout.',
        e,
      );
      throw AppException(
        message: 'Could not refresh session due to network failure.',
        type: AppExceptionType.network,
        originalError: e,
      );
    }
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
