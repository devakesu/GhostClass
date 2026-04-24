import 'dart:async';

import 'package:dio/dio.dart';
import 'package:ghostclass/logic/app_exception.dart';
import 'package:ghostclass/services/logger.dart';

/// A utility to deduplicate and cache EzyGo API requests locally in the Flutter app.
/// 
/// This prevents redundant network calls during dashboard hydration and improves
/// performance by serving recently fetched data from a short-lived LRU cache.
/// 
/// Note: This is implemented locally to preserve the user's local IP address,
/// which helps avoid triggering EzyGo's server-side rate limits that might
/// occur if all requests were proxied through the GhostClass backend.
class EzygoBatchFetcher {
  final Dio _dio;
  final bool Function() _getOutage;
  final void Function(bool) _setOutage;
  
  // Cache for 60 seconds (parity with Next.js implementation)
  static const Duration _cacheTtl = Duration(seconds: 60);
  
  // In-flight request map for deduplication
  static final Map<String, Future<Response>> _inFlight = {};
  
  // Local result cache
  static final Map<String, _CacheEntry> _cache = {};
  
  // Tracker for log throttling
  static DateTime? _lastCircuitBreakerLog;

  EzygoBatchFetcher(this._dio, {
    required bool Function() getOutage,
    required void Function(bool) setOutage,
  }) : _getOutage = getOutage, 
       _setOutage = setOutage;

  /// Executes an authenticated request with deduplication and caching.
  /// 
  /// [path] The full URL or relative path.
  /// [token] The EzyGo Bearer token.
  /// [method] The HTTP method (GET or POST).
  /// [data] Optional request body (only empty bodies are currently cached for POST).
  Future<Response> fetch({
    required String path,
    required String token,
    String method = 'GET',
    dynamic data,
  }) async {
    // Generate a unique cache key based on the request identity
    final cacheKey = '$method|$path|$token';

    // 0. Circuit Breaker: If an outage is active, block ALL network requests immediately.
    // This state is only cleared when the user manually presses 'Retry' (clearAll()).
    if (_getOutage()) {
      // Throttle the warning log to once per minute to avoid console flooding
      const logThrottle = Duration(minutes: 1);
      final now = DateTime.now();
      if (_lastCircuitBreakerLog == null || now.difference(_lastCircuitBreakerLog!) > logThrottle) {
        _lastCircuitBreakerLog = now;
        AppLogger.w('EzygoBatchFetcher: CIRCUIT BREAKER ACTIVE. Blocking network request logic for $path');
      } else {
        AppLogger.d('EzygoBatchFetcher: CIRCUIT BREAKER THROTTLED. Blocking $path');
      }

      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.cancel,
        message: 'EzyGo Outage Lock: Please press retry to attempt recovery.',
        response: Response(
          requestOptions: RequestOptions(path: path),
          statusCode: 503,
          statusMessage: 'Service Unavailable (Outage Lock)',
        ),
      );
    }

    // 1. Check local cache (LRU-lite)
    final cached = _cache[cacheKey];
    if (cached != null) {
      if (DateTime.now().isBefore(cached.expiry)) {
        AppLogger.d('EzygoBatchFetcher: CACHE HIT for $path ${cached.response.statusCode != 200 ? "(NEGATIVE)" : ""}');
        return cached.response;
      } else {
        // Purge expired entry
        _cache.remove(cacheKey);
      }
    }

    // 2. Handle request deduplication (In-Flight sharing)
    if (_inFlight.containsKey(cacheKey)) {
      AppLogger.d('EzygoBatchFetcher: DEDUPLICATING in-flight request for $path');
      return _inFlight[cacheKey]!;
    }

    // 3. Execute the network request
    final requestFuture = _executeRequest(
      path: path,
      token: token,
      method: method,
      data: data,
    );

    // Store in-flight future
    _inFlight[cacheKey] = requestFuture;

    try {
      final response = await requestFuture;
      
      // 4. Cache the result
      if (response.statusCode == 200) {
        // Success cache (Longer)
        _cache[cacheKey] = _CacheEntry(
          response: response,
          expiry: DateTime.now().add(_cacheTtl),
        );
      } else if (response.statusCode != null && response.statusCode! >= 500) {
        // NEGATIVE CACHE (Circuit Breaker): 
        // Remember 5xx failures briefly to prevent Request Storms.
        _setOutage(true);
        _cache[cacheKey] = _CacheEntry(
          response: response,
          expiry: DateTime.now().add(const Duration(seconds: 15)),
        );
      }
      
      return response;
    } on DioException catch (e) {
      // Treat timeouts and connection errors as outages to trigger the UI barrier
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        _setOutage(true);
        // Short error TTL for transient network issues to recover faster
        if (e.response != null) {
          _cache[cacheKey] = _CacheEntry(
            response: e.response!,
            expiry: DateTime.now().add(const Duration(seconds: 5)),
          );
        }
      }
      rethrow;
    } finally {
      // 5. Clean up in-flight map REGARDLESS of outcome
      unawaited(_inFlight.remove(cacheKey));
    }
  }


  Future<Response> _executeRequest({
    required String path,
    required String token,
    required String method,
    dynamic data,
  }) {
    if (token.isEmpty) {
      return Future.error(AppException(
        message: 'No EzyGo credentials found. Please log in.',
        type: AppExceptionType.unauthorized,
      ));
    }
    return _dio.request(
      path,
      data: data,
      options: Options(
        method: method,
        headers: {'Authorization': 'Bearer $token'},
        // Ensure standard validation for batching
        validateStatus: (s) => s != null && s < 600,
      ),
    );
  }

  /// Manually clears the local cache (e.g. on logout or manual refresh).
  void clearAll() {
    _cache.clear();
    _inFlight.clear();
    _setOutage(false);
    AppLogger.i('EzygoBatchFetcher: Cache and Outage state cleared.');
  }
}

class _CacheEntry {
  final Response response;
  final DateTime expiry;

  _CacheEntry({required this.response, required this.expiry});
}
