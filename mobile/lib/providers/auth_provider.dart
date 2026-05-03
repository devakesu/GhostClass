import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/logic/encrypted_value.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/profile_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/services/settings_service.dart';
import 'package:ghostclass/services/stealth_headers_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginException implements Exception {
  final String message;
  LoginException(this.message);
  @override
  String toString() => 'LoginException: $message';
}

// ─── Providers ────────────────────────────────────────────────────────────────

final stealthHeadersServiceProvider = Provider(
  (ref) => StealthHeadersService(ref.watch(secureStorageProvider)),
);
final profileServiceProvider = Provider((ref) => ProfileService());
final settingsServiceProvider = Provider(
  (ref) => SettingsService(ref.watch(secureStorageProvider)),
);

final supabaseClientProvider = Provider<SupabaseClient>(
  (ref) => Supabase.instance.client,
);

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthenticatedUser?>(
  AuthNotifier.new,
);

final institutionsProvider = FutureProvider<List<Institution>>((ref) async {
  final authState = ref.watch(authProvider);
  if (authState.value == null) return [];
  return ref.read(authProvider.notifier).fetchInstitutions();
});

// ─── Authenticated User Model ─────────────────────────────────────────────────

class AuthenticatedUser {
  final String supabaseUserId;
  final EncryptedValue ezygoToken;
  final String? ezygoId;
  final String? username;
  final String? termsVersion;
  final UserSettings settings;
  final UserProfile? profile;

  const AuthenticatedUser({
    required this.supabaseUserId,
    required this.ezygoToken,
    required this.settings,
    this.ezygoId,
    this.username,
    this.termsVersion,
    this.profile,
  });

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
  }) {
    return AuthenticatedUser(
      supabaseUserId: supabaseUserId ?? this.supabaseUserId,
      ezygoToken: ezygoToken ?? this.ezygoToken,
      settings: settings ?? this.settings,
      ezygoId: ezygoId ?? this.ezygoId,
      username: username ?? this.username,
      termsVersion: termsVersion ?? this.termsVersion,
      profile: profile ?? this.profile,
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
          profile == other.profile;

  @override
  int get hashCode =>
      supabaseUserId.hashCode ^
      ezygoToken.hashCode ^
      ezygoId.hashCode ^
      username.hashCode ^
      termsVersion.hashCode ^
      settings.hashCode ^
      profile.hashCode;
}

// ─── Auth Notifier ────────────────────────────────────────────────────────────

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
    final subscription = apiService.onUnauthorized.listen((_) {
      _handleUnauthorized();
    });

    ref.onDispose(() {
      WidgetsBinding.instance.removeObserver(this);
      _refreshTimer?.cancel();
      subscription.cancel();
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
      refreshProfile(force: true);
    }
  }

  void _startPeriodicRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(minutes: 30), (_) {
      refreshProfile();
    });
  }

  Future<void> _handleUnauthorized() async {
    if (_isRefreshing || _isInitializing) return;
    _isRefreshing = true;

    final api = ref.read(apiServiceProvider);
    api.suppress401 = true;
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
        AppLogger.w('AuthNotifier: Self-healing did not produce a new token. Failures: $_consecutiveHealFailures');
        
        if (_consecutiveHealFailures >= 3) {
          AppLogger.e('AuthNotifier: Terminal 401 loop detected. Logging out to protect state.');
          await logout();
        }
      }
    } catch (e) {
      AppLogger.e('AuthNotifier: Self-healing error', e);
      if (e is AppException && e.isAuthError) await logout();
    } finally {
      // Cooldown before allowing next 401 triggers to prevent tight cascades
      await Future.delayed(const Duration(milliseconds: 1000));
      api.suppress401 = false;
      _isRefreshing = false;
    }
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

      await _fetchAndApplyServerProfile(currentUser, supabaseToken: token, sync: sync);
    } catch (e) {
      if (e is AppException && e.isAuthError) await logout();
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
    } catch (e) {
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

    final api = ref.read(apiServiceProvider);
    api.suppress401 = true;
    try {
      final token = await _getFreshSupabaseToken();
      if (token == null) {
        throw const AppException(
          message: 'Auth session dead',
          type: AppExceptionType.unauthorized,
        );
      }

      final updatedUser = await _fetchAndApplyServerProfile(
        user,
        supabaseToken: token,
        updateState: false,
      );
      _lastRefresh = DateTime.now();
      return updatedUser;
    } catch (e) {
      if (e is AppException && e.isAuthError) {
        await logout();
        return null;
      }
      
      // If it's a network error or other non-auth issue, return the cached user 
      // instead of rethrowing, so the app remains usable in offline mode.
      AppLogger.w('AuthNotifier: Background sync failed during startup. Using cached data.', e);
      return user;
    } finally {
      api.suppress401 = false;
    }
  }

  Future<void> login(String username, String password) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final storage = ref.read(secureStorageProvider);

      final bridgeResponse = await api.loginAndProvision(
        username: username,
        password: password,
      );

      if (kDebugMode) {
        AppLogger.d('AuthNotifier: Bridge response data: ${bridgeResponse.data}');
      }

      final sessionData = (bridgeResponse.data['session'] ?? bridgeResponse.data) as Map<String, dynamic>?;
      final refreshToken = sessionData?['refresh_token'] as String?;
      if (refreshToken == null) {
        throw AppException(
          message: 'Secure session failed',
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
        throw AppException(
          message: 'Identity recovery failed',
          type: AppExceptionType.unauthorized,
        );
      }

      final settingsFallback = bridgeResponse.data['settings'] != null
          ? UserSettings.fromJson(bridgeResponse.data['settings'])
          : UserSettings.defaults();

      final ezygoId =
          (bridgeResponse.data['id'] ?? bridgeResponse.data['user_id'])
              ?.toString();
      final termsVersion = _extractTermsVersion(bridgeResponse.data);
      final ezygoToken = (bridgeResponse.data['ezygo_token'] as String?) ?? '';

      await Future.wait([
        storage.saveEzygoToken(ezygoToken),
        storage.saveSupabaseUserId(supabaseUser.id),
        storage.saveUsername(username),
        storage.saveSettings(settingsFallback),
        if (ezygoId != null) storage.saveEzygoUserId(ezygoId),
        if (termsVersion != null) storage.saveTermsVersion(termsVersion),
      ]);

      final cachedUser = await _buildStoredUserForIdentity(
        supabaseUserId: supabaseUser.id,
        ezygoToken: ezygoToken,
        usernameOverride: username,
        ezygoIdOverride: ezygoId,
        termsVersionOverride: termsVersion,
        settingsFallback: settingsFallback,
      );

      final profileService = ref.read(profileServiceProvider);
      if (profileService.hasRenderableLocalProfile(cachedUser.profile)) {
        state = AsyncValue.data(cachedUser);
        unawaited(Future.microtask(() => refreshProfile(force: true)));
        return;
      }

      await _fetchAndApplyServerProfile(cachedUser);
    } catch (e, st) {
      AppLogger.e('AuthNotifier: LOGIN ERROR', e);
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout({bool force = false}) async {
    final storage = ref.read(secureStorageProvider);
    state = const AsyncValue.data(null);
    try {
      await Future.wait([
        ref.read(supabaseClientProvider).auth.signOut(),
        storage.clearAll(),
        _clearSharedPrefs(),
      ]);
    } catch (e) {
      AppLogger.e('AuthNotifier: LOGOUT CLEANUP ERROR', e);
    }
  }

  Future<void> _clearSharedPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
    } catch (e, st) {
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
    } catch (e) {
      AppLogger.e('AuthNotifier: Account deletion failed', e);
      rethrow;
    }
  }

  Future<void> updateSettings({
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, String>>? disabledCourses,
    Map<String, String>? catalogOverride,
  }) async {
    final user = state.value;
    if (user == null) return;
    final service = ref.read(settingsServiceProvider);
    await service.updateSettings(
      user.supabaseUserId,
      bunkEnabled: bunkEnabled,
      targetPercentage: targetPercentage,
      disabledCourses: disabledCourses,
      catalogOverride: catalogOverride,
    );

    final updatedSettings = user.settings.copyWith(
      bunkCalculatorEnabled: bunkEnabled,
      targetPercentage: targetPercentage,
      disabledCourses: disabledCourses,
      courseCatalog: catalogOverride,
    );
    await service.saveSettingsLocally(updatedSettings);
    state = AsyncValue.data(user.copyWith(settings: updatedSettings));
  }

  Future<void> updateAcademicContext(String? sem, String? year) async {
    final user = state.value;
    if (user == null) return;

    final updatedSettings = user.settings.copyWith(
      semester: sem,
      academicYear: year,
    );
    final updatedProfile = user.profile?.copyWith(
      currentSemester: sem,
      currentYear: year,
    );

    final storage = ref.read(secureStorageProvider);
    await Future.wait([
      storage.saveSettings(updatedSettings),
      if (updatedProfile != null) storage.saveUserProfile(updatedProfile),
    ]);

    state = AsyncValue.data(
      user.copyWith(settings: updatedSettings, profile: updatedProfile),
    );
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

    final all =
        (response.data as List).map((i) => Institution.fromJson(i)).toList();

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
      throw AppException(
        message: 'Session dead',
        type: AppExceptionType.unauthorized,
      );
    }

    final api = ref.read(apiServiceProvider);
    final response = await api.refreshProfile(token, sync: sync);

    if (response.statusCode != 200 || response.data == null) {
      if (response.statusCode != null && response.statusCode! >= 500) {
        throw AppException(
          message: 'Ezygo issues (5xx)',
          type: AppExceptionType.server,
        );
      }
      throw AppException(
        message: 'Profile sync failed',
        type: AppExceptionType.server,
      );
    }

    return _applyProfileResponseData(
      currentUser: user,
      data: response.data as Map<String, dynamic>,
      updateState: updateState,
    );
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

    final settings = baseSettings.copyWith(
      semester: data['current_semester'] ?? baseSettings.semester,
      academicYear: data['current_year'] ?? baseSettings.academicYear,
    );

    final rawProfile = data.containsKey('profile') 
        ? Map<String, dynamic>.from(data['profile'] as Map) 
        : Map<String, dynamic>.from(data);
        
    // Ensure current_semester/year are explicitly included in the map passed to fromJson
    rawProfile['current_semester'] = data['current_semester'] ?? rawProfile['current_semester'];
    rawProfile['current_year'] = data['current_year'] ?? rawProfile['current_year'];
    
    final profile = UserProfile.fromJson(rawProfile);

    final mergedUser = currentUser.copyWith(
      settings: settings,
      profile: profile,
      ezygoToken: EncryptedValue.fromPlaintext(
        data['ezygo_token'] ?? currentUser.ezygoToken.value,
      ),
      ezygoId:
          (data['id'] ?? data['user_id'])?.toString() ?? currentUser.ezygoId,
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
      final isTerminal = e.statusCode == '400' || 
                         e.message.contains('refresh_token_not_found') || 
                         e.message.contains('Invalid Refresh Token') ||
                         e.message.contains('not found');

      if (isTerminal) {
        AppLogger.w('AuthNotifier: Supabase session terminal failure', e);
        return null;
      }

      // For other AuthExceptions (e.g. 500s, rate limits), treat as transient 
      // network errors to avoid logging out the user prematurely.
      AppLogger.w('AuthNotifier: Supabase transient auth error. Preventing logout.', e);
      throw AppException(
        message: 'Supabase service issues: ${e.message}',
        type: AppExceptionType.network,
        originalError: e,
      );
    } catch (e) {
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
    final profile = data['profile'] as Map?;
    if (profile != null && profile['terms_version'] != null) {
      return profile['terms_version'].toString();
    }
    return null;
  }
}
