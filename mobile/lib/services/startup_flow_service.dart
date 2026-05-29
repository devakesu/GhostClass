import 'package:flutter_riverpod/flutter_riverpod.dart';

/// In-memory startup flow hints used to coordinate one-shot navigation paths
/// without persisting security decisions across app restarts.
class StartupFlowService {
  String? _postLoginSessionKey;
  DateTime? _postLoginMarkedAt;
  static const Duration _postLoginFastPathTtl = Duration(seconds: 45);

  // SplashScreen startup checks cache
  Object? startupCache;
  DateTime? startupCacheAt;
  String? startupCacheSessionKey;
  Future<dynamic>? startupInFlight;

  void markPostLoginFastPath(String sessionKey) {
    _postLoginSessionKey = sessionKey;
    _postLoginMarkedAt = DateTime.now();
  }

  bool consumePostLoginFastPath(String sessionKey) {
    final markedAt = _postLoginMarkedAt;
    if (_postLoginSessionKey == null || markedAt == null) {
      return false;
    }

    final isMatch = _postLoginSessionKey == sessionKey;
    final isFresh =
        DateTime.now().difference(markedAt) <= _postLoginFastPathTtl;
    final canUse = isMatch && isFresh;

    // One-shot consume semantics.
    _postLoginSessionKey = null;
    _postLoginMarkedAt = null;

    return canUse;
  }
}

final startupFlowServiceProvider = Provider<StartupFlowService>(
  (ref) => StartupFlowService(),
);
