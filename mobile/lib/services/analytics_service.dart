import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// AnalyticsService
/// Centralized wrapper around `FirebaseAnalytics` that exposes common
/// application events and a single `FirebaseAnalyticsObserver` instance for
/// screen view tracking.
class AnalyticsService {
  AnalyticsService._();

  static final AnalyticsService instance = AnalyticsService._();

  FirebaseAnalytics? _analytics;
  FirebaseAnalyticsObserver? _observer;

  bool get isInitialized => _analytics != null && _observer != null;

  static Future<void> initialize({FirebaseAnalytics? analyticsInstance}) async {
    final svc = AnalyticsService.instance;
    svc
      .._analytics = analyticsInstance ?? FirebaseAnalytics.instance
      .._observer = FirebaseAnalyticsObserver(analytics: svc.analytics)
      .._env = kDebugMode ? 'development' : 'production';
    try {
      await svc.analytics.setUserProperty(name: 'env', value: svc._env);
    } on Object catch (_) {}

    // Log an app_open event on cold start (includes env param)
    try {
      await svc.analytics.logAppOpen(parameters: svc._withEnvParams());
    } on Object catch (_) {}
  }

  Future<void> logScreenView(String screenName) async {
    try {
      await analytics.logScreenView(
        screenName: screenName,
        parameters: _withEnvParams(),
      );
    } on Object catch (_) {}
  }

  Future<void> logLogin({String method = 'unknown'}) async {
    try {
      await analytics.logEvent(
        name: 'login',
        parameters: _withEnvParams({'method': method}),
      );
    } on Object catch (_) {}
  }

  Future<void> logLogout() async {
    try {
      await analytics.logEvent(name: 'logout', parameters: _withEnvParams());
    } on Object catch (_) {}
  }

  Future<void> logSignUp({String method = 'unknown'}) async {
    try {
      await analytics.logEvent(
        name: 'sign_up',
        parameters: _withEnvParams({'method': method}),
      );
    } on Object catch (_) {}
  }

  Future<void> logAttendanceMarked({
    required String courseId,
    required int count,
  }) async {
    try {
      await analytics.logEvent(
        name: 'attendance_marked',
        parameters: _withEnvParams({'course_id': courseId, 'count': count}),
      );
    } on Object catch (_) {}
  }

  Future<void> logLeaveRequested({
    required String courseId,
    required String type,
  }) async {
    try {
      await analytics.logEvent(
        name: 'leave_requested',
        parameters: _withEnvParams({'course_id': courseId, 'type': type}),
      );
    } on Object catch (_) {}
  }

  Future<void> logError(String message, {String? stack}) async {
    try {
      await analytics.logEvent(
        name: 'app_error',
        parameters: _withEnvParams({'message': message, 'stack': stack ?? ''}),
      );
    } on Object catch (_) {}
  }

  String _env = 'production';

  FirebaseAnalytics get analytics {
    final value = _analytics;
    if (value == null) {
      throw StateError('AnalyticsService has not been initialized.');
    }
    return value;
  }

  FirebaseAnalyticsObserver get observer {
    final value = _observer;
    if (value == null) {
      throw StateError('AnalyticsService has not been initialized.');
    }
    return value;
  }

  @visibleForTesting
  static void resetForTest() {
    final svc = AnalyticsService.instance;
    // Reset the singleton state in one place so tests start from a clean slate.
    // ignore: cascade_invocations
    svc
      .._analytics = null
      .._observer = null
      .._env = 'production';
  }

  Map<String, Object> _withEnvParams([Map<String, Object>? p]) {
    final map = <String, Object>{};
    if (p != null) map.addAll(p);
    map['env'] = _env;
    return map;
  }

  Future<void> logAttendanceDeleted({
    required String courseId,
    required int count,
  }) async {
    try {
      await analytics.logEvent(
        name: 'attendance_deleted',
        parameters: _withEnvParams({'course_id': courseId, 'count': count}),
      );
    } on Object catch (_) {}
  }

  Future<void> logSettingsUpdated(Map<String, dynamic> changes) async {
    try {
      await analytics.logEvent(
        name: 'settings_updated',
        parameters: _withEnvParams(
          changes.map((key, value) => MapEntry(key, value as Object)),
        ),
      );
    } on Object catch (_) {}
  }

  Future<void> logAcceptTerms(String version) async {
    try {
      await analytics.logEvent(
        name: 'accept_terms',
        parameters: _withEnvParams({'version': version}),
      );
    } on Object catch (_) {}
  }

  Future<void> logCustom(String name, Map<String, dynamic> params) async {
    try {
      await analytics.logEvent(
        name: name,
        parameters: _withEnvParams(params.cast<String, Object>()),
      );
    } on Object catch (_) {}
  }

  NavigatorObserver get appObserver => DelegatingAnalyticsObserver();
}

class DelegatingAnalyticsObserver extends NavigatorObserver {
  NavigatorObserver? get _delegate {
    if (!AnalyticsService.instance.isInitialized) {
      return null;
    }
    return AnalyticsService.instance.observer;
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _delegate?.didPush(route, previousRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _delegate?.didPop(route, previousRoute);
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _delegate?.didRemove(route, previousRoute);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    _delegate?.didReplace(newRoute: newRoute, oldRoute: oldRoute);
  }

  @override
  void didStartUserGesture(
    Route<dynamic> route,
    Route<dynamic>? previousRoute,
  ) {
    _delegate?.didStartUserGesture(route, previousRoute);
  }

  @override
  void didStopUserGesture() {
    _delegate?.didStopUserGesture();
  }
}
