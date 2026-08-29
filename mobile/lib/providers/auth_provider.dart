import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_context_service.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/profile_hydration_service.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/session_healing_service.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/cache_manager.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/push_notification_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:ghostclass/services/startup_flow_service.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginException implements Exception {
  LoginException(this.message);
  final String message;
  @override
  String toString() => 'LoginException: $message';
}

// ─── Providers ────────────────────────────────────────────────────────────────

final Provider<ProfileService> profileServiceProvider = Provider(
  (ref) => ProfileService(ref.watch(supabaseClientProvider)),
);
final Provider<SettingsService> settingsServiceProvider = Provider(
  (ref) => SettingsService(
    ref.watch(secureStorageProvider),
    ref.watch(supabaseClientProvider),
  ),
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
    if (token.length <= 4) return '••••••••';
    return '••••••••${token.substring(token.length - 4)}';
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
/// A simplified notifier that delegates complex session/hydration/healing
/// operations to dedicated services: SessionHealingService,
/// ProfileHydrationService, and AcademicContextService.
class AuthNotifier extends AsyncNotifier<AuthenticatedUser?>
    with WidgetsBindingObserver {
  bool _isInitializing = false;
  bool get isInitializing => _isInitializing;

  Timer? _refreshTimer;
  DateTime? _lastBackgroundedAt;

  @override
  FutureOr<AuthenticatedUser?> build() async {
    WidgetsBinding.instance.removeObserver(this);
    WidgetsBinding.instance.addObserver(this);

    final apiService = ref.read(apiServiceProvider);
    final unauthorizedSub = apiService.onUnauthorized.listen((_) {
      AppLogger.safeUnawait(
        ref.read(sessionHealingServiceProvider.notifier).handleUnauthorized(),
        'AuthNotifier: handleUnauthorized',
      );
    });

    final lockdownSub = apiService.onSecurityLockdown.listen((data) {
      AppLogger.safeUnawait(
        ref
            .read(sessionHealingServiceProvider.notifier)
            .handleSecurityLockdown(data),
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
      final user = await ref
          .read(profileHydrationServiceProvider.notifier)
          .buildFromCurrentSession();
      AppLogger.i('AuthNotifier: Core hydration complete');
      if (user != null) {
        AppLogger.safeUnawait(
          Future.microtask(() async {
            await ref
                .read(pushNotificationServiceProvider)
                .syncToken(force: true);
          }).catchError((Object e, StackTrace st) {
            AppLogger.e('AuthNotifier: Post-hydration FCM sync failed', e, st);
          }),
          'AuthNotifier: post-hydration FCM sync',
        );
      }
      return user;
    } finally {
      _isInitializing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _lastBackgroundedAt = DateTime.now();
      _refreshTimer?.cancel();
      _refreshTimer = null;
    } else if (state == AppLifecycleState.resumed) {
      _startPeriodicRefresh();
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

  // ─── Public Setters / Internal Helpers ─────────────────────────────────────

  void updateState(AuthenticatedUser? user) {
    state = AsyncValue.data(user);
  }

  void setAuthLoading() {
    state = const AsyncValue.loading();
  }

  void setAuthError(Object error, StackTrace stackTrace) {
    state = AsyncValue.error(error, stackTrace);
  }

  Future<String?> getFreshSupabaseToken() async {
    try {
      final session = ref.read(supabaseClientProvider).auth.currentSession;
      if (session == null) return null;
      if (session.isExpired) {
        final res = await ref
            .read(supabaseClientProvider)
            .auth
            .refreshSession()
            .timeout(AppConfig.defaultTimeout);
        return res.session?.accessToken;
      }
      return session.accessToken;
    } on AuthException catch (e) {
      final isTerminal =
          e.statusCode == '400' ||
          e.message.contains('refresh_token_not_found') ||
          e.message.contains('Invalid Refresh Token') ||
          e.message.contains('not found');

      if (isTerminal) {
        AppLogger.e('AuthNotifier: Supabase session terminal failure', e);
        return null;
      }

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

  // ─── Session Methods (delegated or handled directly) ───────────────────────

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
        final isTransientSecurity = isTransientSecurityPayload(data);
        final errorMsg = formatApiError(data, 'Secure Session');
        throw AppException(
          message: isTransientSecurity
              ? 'Device verification is temporarily unavailable. Please retry in a few moments.'
              : errorMsg,
          type: isTransientSecurity
              ? AppExceptionType.network
              : (bridgeResponse.statusCode == 401
                    ? AppExceptionType.unauthorized
                    : AppExceptionType.server),
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
      final termsVersion = _extractTermsVersion(bridgeData);
      final ezygoToken = (bridgeData['ezygo_token'] as String?) ?? '';

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

      final cachedUser = await ref
          .read(profileHydrationServiceProvider.notifier)
          .buildStoredUserForIdentity(
            supabaseUserId: supabaseUser.id,
            ezygoToken: ezygoToken,
            usernameOverride: username,
            ezygoIdOverride: ezygoId,
            termsVersionOverride: termsVersion,
            settingsFallback: settingsWithAcademic,
          );

      AppLogger.safeUnawait(
        ref
            .read(pushNotificationServiceProvider)
            .syncToken(force: true)
            .catchError((Object e, StackTrace st) {
              AppLogger.e('AuthNotifier: Post-login FCM sync failed', e, st);
            }),
        'AuthNotifier: post-login FCM sync',
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
        unawaited(
          Sentry.addBreadcrumb(
            Breadcrumb(
              message: 'Login successful',
              category: 'auth',
              data: {'supabase_user_id': supabaseUser.id},
            ),
          ),
        );
        ref
            .read(startupFlowServiceProvider)
            .markPostLoginFastPath(supabaseUser.id);
        return;
      }

      final token = await getFreshSupabaseToken();
      if (token != null) {
        final profiledUser = await ref
            .read(profileHydrationServiceProvider.notifier)
            .runProfileRefresh(
              cachedUser,
              supabaseToken: token,
              updateState: false,
              sync: true,
            );
        final syncingUser = profiledUser.copyWith(isSyncing: true);
        state = AsyncValue.data(syncingUser);
        AppLogger.safeUnawait(
          Future.microtask(() async {
            try {
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

        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      } else {
        await ref
            .read(profileHydrationServiceProvider.notifier)
            .runProfileRefresh(cachedUser);
        try {
          await AnalyticsService.instance.logLogin(method: 'ezygo');
        } on Object catch (_) {}
      }

      ref
          .read(startupFlowServiceProvider)
          .markPostLoginFastPath(supabaseUser.id);
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
    if (!force) {
      ref.read(securityFailureProvider.notifier).clearFailure();
    }
    await ref.read(cacheManagerProvider).clearAllCaches();
    ref
      ..invalidate(institutionsProvider)
      ..invalidate(academicProvider)
      ..invalidate(startupFlowServiceProvider);

    state = const AsyncValue.data(null);
    _refreshTimer?.cancel();

    ref.read(sessionHealingServiceProvider.notifier).reset();
    ref.read(profileHydrationServiceProvider.notifier).reset();

    EncryptedValue.clearEntropy();
    try {
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

  Future<void> updateSettings({
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, String>>? disabledCourses,
    Map<String, int>? courseTargets,
  }) async {
    final user = state.value;
    if (user == null) return;

    final previousSettings = user.settings;

    final updatedSettings = user.settings.copyWith(
      bunkCalculatorEnabled: bunkEnabled ?? user.settings.bunkCalculatorEnabled,
      targetPercentage: targetPercentage ?? user.settings.targetPercentage,
      disabledCourses: disabledCourses ?? user.settings.disabledCourses,
      courseTargets: courseTargets ?? user.settings.courseTargets,
    );

    state = AsyncValue.data(
      user.copyWith(
        settings: updatedSettings,
        isUpdatingSettings: true,
      ),
    );

    final service = ref.read(settingsServiceProvider);
    try {
      await service.saveSettingsLocally(updatedSettings);
      await service.updateSettings(
        user.supabaseUserId,
        bunkEnabled: bunkEnabled,
        targetPercentage: targetPercentage,
        disabledCourses: disabledCourses,
        courseTargets: courseTargets,
      );
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
        if (courseTargets != null) {
          changes['courseTargetsCount'] = courseTargets.length;
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
      state = AsyncValue.data(
        user.copyWith(
          settings: previousSettings,
          isUpdatingSettings: false,
        ),
      );
      rethrow;
    } finally {
      final currentUser = state.value;
      if (currentUser != null && currentUser.isUpdatingSettings) {
        state = AsyncValue.data(
          currentUser.copyWith(isUpdatingSettings: false),
        );
      }
    }
  }

  // ─── Delegation Facades ────────────────────────────────────────────────────

  Future<void> refreshProfile({bool force = false}) => ref
      .read(profileHydrationServiceProvider.notifier)
      .refreshProfile(force: force);

  Future<void> syncProfile() =>
      ref.read(profileHydrationServiceProvider.notifier).syncProfile();

  Future<void> acceptTerms() =>
      ref.read(profileHydrationServiceProvider.notifier).acceptTerms();

  Future<void> updateAvatar(String publicUrl) => ref
      .read(profileHydrationServiceProvider.notifier)
      .updateAvatar(publicUrl);

  Future<void> deleteAccount() =>
      ref.read(profileHydrationServiceProvider.notifier).deleteAccount();

  Future<void> updateAcademicContext(String? sem, String? year) => ref
      .read(academicContextServiceProvider.notifier)
      .updateAcademicContext(sem, year);

  Future<void> updateDefaultInstitution(int institutionId) => ref
      .read(academicContextServiceProvider.notifier)
      .updateDefaultInstitution(institutionId);

  Future<List<Institution>> fetchInstitutions() =>
      ref.read(academicContextServiceProvider.notifier).fetchInstitutions();

  // ─── Private Helpers ───────────────────────────────────────────────────────

  String? _extractTermsVersion(Map<String, dynamic> data) {
    if (data['terms_version'] != null) return data['terms_version'].toString();
    final profile = data['profile'] as Map<dynamic, dynamic>?;
    if (profile != null && profile['terms_version'] != null) {
      return profile['terms_version'].toString();
    }
    return null;
  }
}
