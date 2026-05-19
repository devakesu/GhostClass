import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

/// Centralises cache invalidation for the app so we have a single
/// intentional place to clear caches on logout, academic changes, and errors.
class CacheManager {
  CacheManager(this._ref);
  final Ref _ref;

  Future<void> clearAllCaches() async {
    try {
      // Clear in-memory/HTTP caches first
      _ref.read(apiServiceProvider).clearCaches();

      // Then wipe secure storage (tokens/profile/settings)
      await _ref.read(secureStorageProvider).clearAll();
    } on Object catch (e) {
      AppLogger.w('CacheManager: Failed to clear caches', e);
    }
  }
}

final cacheManagerProvider = Provider<CacheManager>((ref) {
  return CacheManager(ref);
});
