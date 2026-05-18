import 'dart:async';
import 'dart:convert';

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
  EzygoBatchFetcher(
    this._dio, {
    required bool Function() getOutage,
    // ignore: avoid_positional_boolean_parameters -- Matches StateNotifier/Provider signatures
    required void Function(bool) setOutage,
    required bool Function() isBackendUnauthorized,
  }) : _getOutage = getOutage,
       _setOutage = setOutage,
       _isBackendUnauthorized = isBackendUnauthorized;
  final Dio _dio;
  final bool Function() _getOutage;
  // ignore: avoid_positional_boolean_parameters -- Matches StateNotifier/Provider signatures
  final void Function(bool) _setOutage;
  final bool Function() _isBackendUnauthorized;

  // Cache for 60 seconds (parity with Next.js implementation)
  static const Duration _cacheTtl = Duration(seconds: 60);

  // In-flight request map for deduplication
  static final Map<String, Future<Response<dynamic>>> _inFlight = {};

  // Rate limiting (parity with Next.js MAX_CONCURRENT = 3)
  static const int _maxConcurrent = 3;
  static int _activeRequests = 0;
  static final List<Completer<void>> _queue = [];

  // Local result cache
  static final Map<String, _CacheEntry> _cache = {};

  // Tracker for log throttling
  static DateTime? _lastCircuitBreakerLog;

  static int _generation = 0;

  /// Executes an authenticated request with deduplication and caching.
  ///
  /// [path] The full URL or relative path.
  /// [token] The EzyGo Bearer token.
  /// [method] The HTTP method (GET or POST).
  /// [data] Optional request body (only empty bodies are currently cached for POST).
  Future<Response<dynamic>> fetch({
    required String path,
    required String token,
    String method = 'GET',
    dynamic data,
  }) async {
    // Generate a unique cache key based on the request identity
    // We include method, path, token, and a hash of the body data to avoid collisions.
    final dataKey = data != null ? json.encode(data) : '';
    final cacheKey = '$method|$path|$token|$dataKey';
    final startGeneration = _generation;

    // 0. Security Barrier: If the backend connection is compromised, block immediately.
    if (_isBackendUnauthorized()) {
      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.cancel,
        message: 'Security Verification Required: App Check failed.',
        response: Response<dynamic>(
          requestOptions: RequestOptions(path: path),
          statusCode: 401,
          statusMessage: 'Security Handshake Required',
        ),
      );
    }

    // 0.5. Circuit Breaker: If an outage is active, block ALL network requests immediately.
    // This state is only cleared when the user manually presses 'Retry' (clearAll()).
    if (_getOutage()) {
      // Ensure the UI state is definitely true if we are blocking
      _setOutage(true);

      // Throttle the warning log to once per minute to avoid console flooding
      const logThrottle = Duration(minutes: 1);
      final now = DateTime.now();
      if (_lastCircuitBreakerLog == null ||
          now.difference(_lastCircuitBreakerLog!) > logThrottle) {
        _lastCircuitBreakerLog = now;
        AppLogger.w(
          'EzygoBatchFetcher: CIRCUIT BREAKER ACTIVE. Blocking network request logic for $path',
        );
      } else {
        AppLogger.d(
          'EzygoBatchFetcher: CIRCUIT BREAKER THROTTLED. Blocking $path',
        );
      }

      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.cancel,
        message: 'EzyGo Outage Lock: Please press retry to attempt recovery.',
        response: Response<dynamic>(
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
        AppLogger.d(
          'EzygoBatchFetcher: CACHE HIT for $path ${cached.response.statusCode != 200 ? "(NEGATIVE)" : ""}',
        );
        return cached.response;
      } else {
        // Purge expired entry
        _cache.remove(cacheKey);
      }
    }

    // 2. Check in-flight requests (Deduplication)
    final inFlight = _inFlight[cacheKey];
    if (inFlight != null) {
      AppLogger.d(
        'EzygoBatchFetcher: DEDUPLICATING in-flight request for $path',
      );
      return inFlight;
    }

    // 3. Rate Limiting: Wait for an available slot.
    // Track acquisition so _releaseSlot() is only called if we actually got one,
    // preventing the active-request counter from going below zero on early throws.
    var slotAcquired = false;
    try {
      await _waitForSlot();
      slotAcquired = true;

      // 3.5. Final Deduplication Check
      // Between checking inFlight (step 2) and acquiring a slot (step 3),
      // another request with the same key might have already started.
      final postSlotInFlight = _inFlight[cacheKey];
      if (postSlotInFlight != null) {
        AppLogger.d(
          'EzygoBatchFetcher: DEDUPLICATING in-flight request (POST-SLOT) for $path',
        );
        _releaseSlot(); // Immediate release as we will await the existing future
        slotAcquired = false;
        return postSlotInFlight;
      }

      // 4. Execute the network request
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

        // 5. Cache the result
        if (_generation == startGeneration) {
          if (response.statusCode == 200) {
            // Success cache (Longer)
            _cache[cacheKey] = _CacheEntry(
              response: response,
              expiry: DateTime.now().add(_cacheTtl),
            );
          } else if (response.statusCode != null &&
              response.statusCode! >= 500) {
            // NEGATIVE CACHE (Circuit Breaker):
            // Remember 5xx failures briefly to prevent Request Storms.
            _setOutage(true);
            _cache[cacheKey] = _CacheEntry(
              response: response,
              expiry: DateTime.now().add(const Duration(seconds: 15)),
            );
          }
        } else {
          AppLogger.d(
            'EzygoBatchFetcher: Discarded caching for $path due to cache clear during request.',
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
          if (e.response != null && _generation == startGeneration) {
            _cache[cacheKey] = _CacheEntry(
              response: e.response!,
              expiry: DateTime.now().add(const Duration(seconds: 5)),
            );
          }
        }
        rethrow;
      } finally {
        // 6. Clean up in-flight map REGARDLESS of outcome.
        // Map.remove() is synchronous — do NOT wrap in unawaited().
        final _ = _inFlight.remove(cacheKey);
      }
    } finally {
      // Only release the slot if we successfully acquired one.
      if (slotAcquired) _releaseSlot();
    }
  }

  Future<void> _waitForSlot() async {
    if (_activeRequests < _maxConcurrent) {
      _activeRequests++;
      return;
    }
    final completer = Completer<void>();
    _queue.add(completer);
    return completer.future;
  }

  void _releaseSlot() {
    _activeRequests--;
    if (_queue.isNotEmpty) {
      _activeRequests++;
      _queue.removeAt(0).complete();
    }
  }

  Future<Response<dynamic>> _executeRequest({
    required String path,
    required String token,
    required String method,
    dynamic data,
  }) {
    if (token.isEmpty) {
      return Future.error(
        const AppException(
          message: 'No EzyGo credentials found. Please log in.',
          type: AppExceptionType.unauthorized,
        ),
      );
    }
    return _dio.request<dynamic>(
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
    _generation++;
    AppLogger.i(
      'EzygoBatchFetcher: Cache and Outage state cleared. Generation updated to $_generation.',
    );
  }
}

class _CacheEntry {
  _CacheEntry({required this.response, required this.expiry});
  final Response<dynamic> response;
  final DateTime expiry;
}
