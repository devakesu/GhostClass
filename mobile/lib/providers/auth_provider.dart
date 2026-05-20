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
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/cache_manager.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginException implements Exception {
  LoginException(this.message);
  final String message;
  @override
  String toString() => 'LoginException: $message';
}

// ─── Providers ────────────────────────────────────────────────────────────────

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
  int _profileRefreshGeneration = 0;
  Future<void>? _refreshProfileInFlight;
  Future<AuthenticatedUser>? _profileRefreshInFlight;

  @override
  FutureOr<AuthenticatedUser?> build() async {
    WidgetsBinding.instance.addObserver(this);

    final apiService = ref.read(apiServiceProvider);
    final unauthorizedSub = apiService.onUnauthorized.listen((_) {
      AppLogger.safeUnawait(
        _handleUnauthorized(),
        'AuthNotifier: handleUnauthorized',
      );
    });

    final lockdownSub = apiService.onSecurityLockdown.listen((data) {
      AppLogger.safeUnawait(
        _handleSecurityLockdown(data),
        'AuthNotifier: securityLockdown',
      );
    });

    ref.onDispose(() {
      WidgetsBinding.instance.removeObserver(this);
      _refreshTimer?.cancel();
      AppLogger.safeUnawait(
        unauthorizedSub.cancel().catchError((Object e, StackTrace st) {
          AppLogger.e('AuthNotifier: unauthorizedSub.cancel failed', e, st);
        }),
        'AuthNotifier: unauthorizedSub.cancel',
      );
      AppLogger.safeUnawait(
        lockdownSub.cancel().catchError((Object e, StackTrace st) {
          AppLogger.e('AuthNotifier: lockdownSub.cancel failed', e, st);
        }),
        'AuthNotifier: lockdownSub.cancel',
      );
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
      AppLogger.safeUnawait(
        refreshProfile(force: true),
        'AuthNotifier: refreshProfile on resume',
      );
    }
  }

  void _startPeriodicRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(minutes: 30), (_) {
      AppLogger.safeUnawait(refreshProfile(), 'AuthNotifier: periodic refresh');
    });
  }

  Future<void> _handleUnauthorized() async {
    if (_isRefreshing || _isInitializing) return;
    _isRefreshing = true;
    final healAttemptId = DateTime.now().microsecondsSinceEpoch.toString();

    final api = ref.read(apiServiceProvider)..suppress401 = true;
    AppLogger.e('AuthNotifier: 401 DETECTED. Attempting self-healing...');
    AppLogger.d(
      'AuthNotifier [HEAL-$healAttemptId]: Starting heal with $_consecutiveHealFailures prior failures',
    );

    try {
      // Adaptive backoff based on consecutive failures: 0ms, 500ms, 1s, 2s, 4s (capped at 5s)
      final backoffMs = _consecutiveHealFailures > 0
          ? (500 * (1 << (_consecutiveHealFailures - 1))).clamp(500, 5000)
          : 0;
      if (backoffMs > 0) {
        AppLogger.d(
          'AuthNotifier [HEAL-$healAttemptId]: Waiting ${backoffMs}ms before retry (attempt ${_consecutiveHealFailures + 1})',
        );
        await Future<void>.delayed(Duration(milliseconds: backoffMs));
      }

      final oldToken = state.value?.ezygoToken;
      if (state.value == null) {
        final recoveredUser = await _buildFromCurrentSession();
        if (recoveredUser != null) {
          state = AsyncValue.data(recoveredUser);
          AppLogger.d(
            'AuthNotifier [HEAL-$healAttemptId]: Recovered user from session',
          );
        }
      }

      final supabaseToken = await _getFreshSupabaseToken();
      if (supabaseToken == null) {
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: Supabase token unavailable, logging out',
        );
        await logout();
        return;
      }

      Response<dynamic>? syncRes;
      try {
        AppLogger.d(
          'AuthNotifier [HEAL-$healAttemptId]: Calling syncMobileAuth (attempt 1/2)',
        );
        syncRes = await api
            .syncMobileAuth(supabaseToken)
            .timeout(const Duration(seconds: 10));
      } on TimeoutException catch (e, st) {
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: syncMobileAuth timed out (attempt 1)',
          e,
          st,
        );
        syncRes = null;
      }

      // If the first attempt failed, do a single retry with a short backoff
      if (syncRes == null || syncRes.statusCode != 200) {
        try {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          AppLogger.d(
            'AuthNotifier [HEAL-$healAttemptId]: Calling syncMobileAuth (attempt 2/2)',
          );
          syncRes = await api
              .syncMobileAuth(supabaseToken)
              .timeout(const Duration(seconds: 10));
        } on Object catch (e, st) {
          AppLogger.e(
            'AuthNotifier [HEAL-$healAttemptId]: syncMobileAuth retry failed',
            e,
            st,
          );
          syncRes = null;
        }
      }

      if (syncRes != null &&
          syncRes.statusCode == 200 &&
          syncRes.data is Map<String, dynamic>) {
        final syncData = syncRes.data as Map<String, dynamic>;
        final syncedToken = (syncData['ezygo_token'] as String?)?.trim();

        if (syncedToken != null && syncedToken.isNotEmpty) {
          try {
            await ref.read(secureStorageProvider).saveEzygoToken(syncedToken);
            AppLogger.d(
              'AuthNotifier [HEAL-$healAttemptId]: Persisted synced ezygo token',
            );
          } on Object catch (e, st) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Failed to persist synced ezygo token',
              e,
              st,
            );
          }

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
            AppLogger.d(
              'AuthNotifier [HEAL-$healAttemptId]: Updated state with synced token',
            );
          }
        }
      }

      AppLogger.d('AuthNotifier [HEAL-$healAttemptId]: Refreshing profile');
      await refreshProfile(force: true);
      final newToken = state.value?.ezygoToken;

      if (newToken != null && newToken != oldToken) {
        AppLogger.i(
          'AuthNotifier [HEAL-$healAttemptId]: SELF-HEALING SUCCESSFUL. Token changed',
        );
        _consecutiveHealFailures = 0;
      } else {
        _consecutiveHealFailures++;
        AppLogger.e(
          'AuthNotifier [HEAL-$healAttemptId]: Self-healing did not produce a new token. Consecutive failures: $_consecutiveHealFailures',
        );

        if (_consecutiveHealFailures >= 3) {
          final lastError = state.error;
          final isSecurityError =
              lastError is AppException &&
              lastError.details?['type'] == 'security';

          if (isSecurityError) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Terminal security block detected. Not logging out.',
            );
            _consecutiveHealFailures = 0; // Reset to allow more attempts later
          } else {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: Terminal 401 loop detected after $_consecutiveHealFailures attempts. Logging out to protect state.',
            );
            await logout();
          }
        }
      }
    } on Object catch (e) {
      AppLogger.e('AuthNotifier [HEAL-$healAttemptId]: Self-healing error', e);
      if (e is AppException && e.isAuthError) {
        final isSecurityError = e.details?['type'] == 'security';
        final isCritical = e.details?['criticalRisk'] == true;

        if (isSecurityError && !isCritical) {
          AppLogger.e(
            'AuthNotifier [HEAL-$healAttemptId]: Non-critical security block. Skipping logout.',
          );
        } else {
          if (isCritical) {
            AppLogger.e(
              'AuthNotifier [HEAL-$healAttemptId]: CRITICAL SECURITY RISK. Logging out.',
            );
          }
          await logout();
        }
      }
    } finally {
      // Cooldown before allowing next 401 triggers to prevent tight cascades.
      // Cooldown increases with consecutive failures (1s baseline, up to 5s).
      final cooldownMs = _consecutiveHealFailures > 0
          ? (500 * (1 << (_consecutiveHealFailures - 1))).clamp(500, 5000)
          : 1000;
      AppLogger.d(
        'AuthNotifier [HEAL-$healAttemptId]: Cooldown for ${cooldownMs}ms before next 401 can trigger',
      );
      await Future<void>.delayed(Duration(milliseconds: cooldownMs));
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

  Future<void> refreshProfile({bool force = false}) async {
    final inFlight = _refreshProfileInFlight;
    if (inFlight != null) return inFlight;

    final future = _refreshProfileInternal(force: force);
    _refreshProfileInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshProfileInFlight, future)) {
        _refreshProfileInFlight = null;
      }
    });
  }

  Future<void> _refreshProfileInternal({bool force = false}) async {
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
    final ezygoToken = await storage.getNormalizedEzygoToken();

    final user = await _buildStoredUserForIdentity(
      supabaseUserId: session.user.id,
      ezygoToken: ezygoToken ?? '',
    );

    // Synchronously await critical profile sync to block authProvider initialization
    // until server profile sync returns 200 successfully.
    await _runBackgroundStartupHydration(user);

    return state.value ?? user;
  }

  Future<void> _runBackgroundStartupHydration(
    AuthenticatedUser cachedUser, {
    bool silent = false,
  }) async {
    final api = ref.read(apiServiceProvider)..suppress401 = true;
    try {
      final token = await _getFreshSupabaseToken();
      if (token == null) {
        throw const AppException(
          message: 'Auth session dead',
          type: AppExceptionType.unauthorized,
        );
      }

      // 1. Fetch Profile and trigger backend full EzyGo sync synchronously
      await _runProfileRefresh(
        cachedUser,
        supabaseToken: token,
        sync: true,
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
        final finalUser = state.value;
        if (finalUser != null &&
            finalUser.supabaseUserId == cachedUser.supabaseUserId) {
          state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
        }
      }
    } on Object catch (e) {
      if (e is AppException && e.isAuthError) {
        AppLogger.e('AuthNotifier: Background auth error, logging out', e);
        await logout();
        return;
      }

      AppLogger.e(
        'AuthNotifier: Background startup hydration failed. Using cached data.',
        e,
      );
      if (!silent) {
        final currentUser = state.value;
        if (currentUser != null &&
            currentUser.supabaseUserId == cachedUser.supabaseUserId) {
          state = AsyncValue.data(currentUser.copyWith(isSyncing: false));
        }
      }
    } finally {
      api.suppress401 = false;
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

      final saves = <Future<void>>[
        storage.saveEzygoToken(ezygoToken).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist ezygo token (post-login)',
            e,
            st,
          );
        }),
        storage.saveSupabaseUserId(supabaseUser.id).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist supabase user id (post-login)',
            e,
            st,
          );
        }),
        storage.saveUsername(username).catchError((Object e, StackTrace st) {
          AppLogger.e(
            'AuthNotifier: Failed to persist username (post-login)',
            e,
            st,
          );
        }),
        storage.saveSettings(settingsWithAcademic).catchError((
          Object e,
          StackTrace st,
        ) {
          AppLogger.e(
            'AuthNotifier: Failed to persist settings (post-login)',
            e,
            st,
          );
        }),
        if (ezygoId != null)
          storage.saveEzygoUserId(ezygoId).catchError((
            Object e,
            StackTrace st,
          ) {
            AppLogger.e(
              'AuthNotifier: Failed to persist ezygo user id (post-login)',
              e,
              st,
            );
          }),
        if (termsVersion != null)
          storage.saveTermsVersion(termsVersion).catchError((
            Object e,
            StackTrace st,
          ) {
            AppLogger.e(
              'AuthNotifier: Failed to persist terms version (post-login)',
              e,
              st,
            );
          }),
      ];
      await Future.wait(saves);

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
        AppLogger.safeUnawait(
          Future.microtask(() => refreshProfile(force: true)).catchError((
            Object e,
            StackTrace st,
          ) {
            AppLogger.e('AuthNotifier: Async refresh failed', e, st);
          }),
          'AuthNotifier: async refreshProfile',
        );
        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
        return;
      }

      final token = await _getFreshSupabaseToken();
      if (token != null) {
        // Mark as syncing and trigger backend full EzyGo sync
        final profiledUser = await _runProfileRefresh(
          cachedUser,
          supabaseToken: token,
          updateState: false,
          sync: true, // Wait for backend to heal semester and fetch courses
        );
        final syncingUser = profiledUser.copyWith(isSyncing: true);
        state = AsyncValue.data(syncingUser);
        AppLogger.safeUnawait(
          Future.microtask(() async {
            try {
              // Pre-fetch institutions so they are ready in settings
              AppLogger.safeUnawait(
                ref.read(institutionsProvider.future).catchError((
                  Object e,
                  StackTrace st,
                ) {
                  AppLogger.e(
                    'AuthNotifier: prefetch institutions failed (post-login)',
                    e,
                    st,
                  );
                  return <Institution>[];
                }),
                'AuthNotifier: prefetch institutions (post-login)',
              );
            } on Object catch (e) {
              AppLogger.e('AuthNotifier: Post-login cron sync failed', e);
            } finally {
              final finalUser = state.value;
              if (finalUser != null) {
                state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
              }
            }
          }).catchError((Object e, StackTrace st) {
            AppLogger.e('AuthNotifier: Post-login microtask failed', e, st);
          }),
          'AuthNotifier: post-login microtask',
        );
        // Ensure any errors in the background microtask are logged
        // (the microtask itself contains its own try/catch, but attach
        // a top-level catcher to be defensive).
        // Note: we purposely keep this fire-and-forget behavior.

        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      } else {
        await _runProfileRefresh(cachedUser);
        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      }
    } on AuthException catch (e, st) {
      AppLogger.e('AuthNotifier: SUPABASE AUTH ERROR', e);
      state = AsyncValue.error(e, st);
      rethrow;
    } on Object catch (e, st) {
      AppLogger.e('AuthNotifier: LOGIN ERROR', e);
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout({bool force = false}) async {
    // Reset security failure state on normal logout so the next login starts clean.
    if (!force) {
      ref.read(securityFailureProvider.notifier).clearFailure();
    }
    await ref.read(cacheManagerProvider).clearAllCaches();
    ref
      ..invalidate(institutionsProvider)
      ..invalidate(academicProvider);

    state = const AsyncValue.data(null);
    // Stop periodic refreshes and prevent in-flight refresh continuations
    _refreshTimer?.cancel();
    _profileRefreshGeneration++;
    _refreshProfileInFlight = null;
    _profileRefreshInFlight = null;
    // Wipe any in-memory entropy used by `EncryptedValue` to prevent
    // reconstruction of plaintext tokens after logout.
    EncryptedValue.clearEntropy();
    try {
      // On forced logout (e.g. security lockdown), also wipe sensitive
      // secure storage entries such as EzyGo and FCM tokens.
      final storage = ref.read(secureStorageProvider);
      final ops = <Future<dynamic>>[
        ref.read(supabaseClientProvider).auth.signOut(),
      ];
      if (force) {
        ops.addAll([
          storage.clearEzygoToken(),
          storage.saveFcmToken(''),
        ]);
      }
      await Future.wait(ops);
    } on Object catch (e) {
      AppLogger.e('AuthNotifier: LOGOUT CLEANUP ERROR', e);
    }
    try {
      await AnalyticsService.instance.logLogout();
    } on Object catch (_) {}
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
      AppLogger.e(
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

      // 3. Set isSyncing=true here to show the syncing overlay while backend sync runs.
      final syncingUser = user.copyWith(isSyncing: true);
      state = AsyncValue.data(syncingUser);

      final token = await _getFreshSupabaseToken();
      if (token == null) {
        await logout();
        return;
      }

      // Sequential Clean Sync Flow:
      try {
        api.clearCaches();

        // 1. Fetch the fresh profile from Supabase with sync: true
        // This forces the backend to fetch the NEW courses for the updated semester and populate the database!
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

        await _applyProfileResponseData(
          currentUser: syncingUser,
          data: response.data as Map<String, dynamic>,
        );
      } finally {
        final finalUser = state.value;
        if (finalUser != null) {
          state = AsyncValue.data(finalUser.copyWith(isSyncing: false));
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
    bool force = false,
  }) async {
    final refreshGeneration = _profileRefreshGeneration;
    final token = supabaseToken ?? await _getFreshSupabaseToken();
    if (token == null) {
      throw const AppException(
        message: 'Session dead',
        type: AppExceptionType.unauthorized,
      );
    }

    final api = ref.read(apiServiceProvider);
    final response = await api.refreshProfile(token, sync: sync, force: force);

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

    if (updateState && refreshGeneration == _profileRefreshGeneration) {
      final currentState = state.value;
      if (currentState == null ||
          currentState.supabaseUserId == user.supabaseUserId) {
        state = AsyncValue.data(updatedUser);
      }
    }

    return updatedUser;
  }

  Future<AuthenticatedUser> _runProfileRefresh(
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

    final nextAcademic =
        (data['current_semester'] != null && data['current_year'] != null)
        ? AcademicState(
            semester: data['current_semester']! as String,
            year: data['current_year']! as String,
          )
        : null;

    // If the user has logged out while this refresh was in-flight, skip
    // persisting any profile or token changes to avoid reintroducing
    // sensitive data after a forced logout.
    if (state.value == null) {
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

    final academicChanged =
        nextAcademic != null &&
        (currentUser.profile?.currentSemester != nextAcademic.semester ||
            currentUser.profile?.currentYear != nextAcademic.year);

    if (academicChanged) {
      ref.read(apiServiceProvider).clearCaches();
      try {
        final api = ref.read(apiServiceProvider);
        await Future.wait([
          api.updateSemester(nextAcademic.semester, storage),
          api.updateAcademicYear(nextAcademic.year, storage),
        ]);
        AppLogger.i(
          'AuthNotifier: Successfully synced EzyGo session state to new academic context: ${nextAcademic.semester} ${nextAcademic.year}',
        );
      } on Object catch (e) {
        AppLogger.e(
          'AuthNotifier: Failed to update EzyGo active semester during self-heal',
          e,
        );
      }

      // Clear all page caches/providers to force clean re-fetch of all pages
      AppLogger.safeUnawait(
        Future.microtask(() {
          ref
            ..invalidate(dashboardProvider)
            ..invalidate(trackingProvider)
            ..invalidate(scoreProvider)
            ..invalidate(leaveProvider);
        }).catchError((Object e, StackTrace st) {
          AppLogger.e('AuthNotifier: Background invalidation failed', e, st);
        }),
        'AuthNotifier: background invalidation',
      );
    }

    if (nextAcademic != null) {
      AppLogger.safeUnawait(
        Future.delayed(Duration.zero, () {
          ref.read(academicProvider.notifier).state = AsyncValue.data(
            nextAcademic,
          );
        }).catchError((Object e, StackTrace st) {
          AppLogger.e('AuthNotifier: Deferred academic set failed', e, st);
        }),
        'AuthNotifier: deferred academic set',
      );
    }

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
            .refreshSession()
            .timeout(const Duration(seconds: 10));
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
        AppLogger.e('AuthNotifier: Supabase session terminal failure', e);
        return null;
      }

      // For other AuthExceptions (e.g. 500s, rate limits), treat as transient
      // network errors to avoid logging out the user prematurely.
      AppLogger.e(
        'AuthNotifier: Supabase transient auth error. Preventing logout.',
        e,
      );
      throw AppException(
        message: 'Supabase service issues: ${e.message}',
        type: AppExceptionType.network,
        originalError: e,
      );
    } on Object catch (e) {
      AppLogger.e(
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
