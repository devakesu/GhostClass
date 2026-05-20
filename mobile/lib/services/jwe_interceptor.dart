import 'package:dio/dio.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:uuid/uuid.dart';

/// Interceptor that handles JSON Web Encryption (JWE) for all GhostClass API requests.
///
/// 1. [onRequest]: Encrypts outgoing POST/PUT request bodies and attaches the RCEK
///    (Response Content Encryption Key) to the headers for server-side use.
/// 2. [onResponse]: Decrypts incoming encrypted responses using the stored RCEK.
class JweInterceptor extends Interceptor {
  JweInterceptor([this._serviceOverride]);
  final JweService? _serviceOverride;

  JweService get _jweService => _serviceOverride ?? JweService.instance;

  // Use a map to store RCEKs for concurrent requests with self-pruning timestamps
  static final Map<String, _RcekEntry> _rcekMap = {};

  static void _pruneExpiredRceks() {
    final now = DateTime.now();
    // Prune entries older than 2 minutes (120 seconds) to prevent any unbounded leak
    _rcekMap.removeWhere(
      (key, entry) => now.difference(entry.timestamp).inSeconds > 120,
    );
    // Defensive cap: if an attacker floods requests, prevent the map from
    // growing without bound by removing the oldest entries when exceeding
    // a reasonable limit.
    const maxEntries = 256;
    if (_rcekMap.length > maxEntries) {
      final entries = _rcekMap.entries.toList()
        ..sort((a, b) => a.value.timestamp.compareTo(b.value.timestamp));
      final toRemove = _rcekMap.length - maxEntries;
      for (var i = 0; i < toRemove; i++) {
        _rcekMap.remove(entries[i].key);
      }
    }
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final baseUrl = AppConfig.ghostclassApiUrl;
    // Ensure we only encrypt requests targeting our own backend.
    // Check both absolute paths and relative paths combined with baseUrl.
    final fullUrl = options.path.startsWith('http')
        ? options.path
        : '${options.baseUrl}${options.path}';
    final isGhostClassApi = fullUrl.startsWith(baseUrl);
    final isWrite =
        options.method == 'POST' ||
        options.method == 'PUT' ||
        options.method == 'PATCH';

    if (isGhostClassApi && isWrite && options.data is Map<String, dynamic>) {
      try {
        final jweService = _jweService;
        final result = await jweService.encryptRequest(
          options.data as Map<String, dynamic>,
        );

        // Store the RCEK for this request's response decryption using a unique request ID
        final requestId = const Uuid().v4();
        _pruneExpiredRceks();
        _rcekMap[requestId] = _RcekEntry(
          rcek: result.rcek,
          timestamp: DateTime.now(),
        );
        options.headers['X-GhostClass-Request-ID'] = requestId;

        options.data = result.jwe;
        options.headers['x-jwe'] = 'true';
        options.headers['Content-Type'] = 'application/jose';
        // The server needs the RCEK to decrypt the request and to encrypt the response
        // In the GhostClass protocol, we send the RCEK encrypted with the server's public key
        final keyResult = await jweService.encryptHeaderKey();
        options.headers['x-jwe-key'] = keyResult.jwe;

        AppLogger.d('JweInterceptor: Request encrypted for ${options.path}');
      } on Object catch (e) {
        AppLogger.e('JweInterceptor: Encryption failed', e);
        // Fail the request if encryption for our backend fails to avoid sending
        // sensitive payloads unencrypted.
        return handler.reject(
          DioException(
            requestOptions: options,
            error: 'JWE encryption failed',
          ),
        );
      }
    } else if (isGhostClassApi && options.method == 'GET') {
      // For GET requests, we still need to send a JWE key if we want the response to be encrypted
      try {
        final jweService = _jweService;
        final keyResult = await jweService.encryptHeaderKey();

        final requestId = const Uuid().v4();
        _pruneExpiredRceks();
        _rcekMap[requestId] = _RcekEntry(
          rcek: keyResult.rcek,
          timestamp: DateTime.now(),
        );
        options.headers['X-GhostClass-Request-ID'] = requestId;

        options.headers['x-jwe-key'] = keyResult.jwe;
      } on Object catch (e) {
        AppLogger.e('JweInterceptor: GET Key setup failed', e);
        // Fail GET if we cannot establish a header key for our backend.
        return handler.reject(
          DioException(
            requestOptions: options,
            error: 'JWE header key setup failed',
          ),
        );
      }
    }

    return handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) async {
    final contentType = response.headers.value('content-type') ?? '';
    final isEncrypted =
        contentType.contains('application/jose') ||
        response.headers.value('x-jwe') == 'true';
    // Header casing can vary depending on platform/transport. Try common
    // variants to robustly retrieve the request ID used to store the RCEK.
    String? requestId;
    final headers = response.requestOptions.headers;
    if (headers.containsKey('X-GhostClass-Request-ID')) {
      requestId = headers['X-GhostClass-Request-ID'] as String?;
    } else if (headers.containsKey('x-ghostclass-request-id')) {
      requestId = headers['x-ghostclass-request-id'] as String?;
    } else if (headers.containsKey('X-Ghostclass-Request-Id')) {
      requestId = headers['X-Ghostclass-Request-Id'] as String?;
    }
    final entry = requestId == null ? null : _rcekMap.remove(requestId);
    final rcek = entry?.rcek;

    if (isEncrypted && rcek != null) {
      String? jwe;
      if (response.data is String) {
        jwe = response.data as String;
      }

      if (jwe != null) {
        try {
          final jweService = _jweService;
          final decryptedData = await jweService.decryptResponse(jwe, rcek);
          response.data = decryptedData;
          AppLogger.d(
            'JweInterceptor: Response decrypted for ${response.requestOptions.path}',
          );
        } on Object catch (e) {
          AppLogger.e('JweInterceptor: Decryption failed', e);
          // If decryption fails, reject the response so callers don't process
          // potentially tampered or unreadable data.
          return handler.reject(
            DioException(
              requestOptions: response.requestOptions,
              error: 'JWE response decryption failed',
              type: DioExceptionType.badResponse,
            ),
          );
        }
      }
    }

    return handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // Clean up RCEK on error to prevent memory leaks
    final headers = err.requestOptions.headers;
    String? requestId;
    if (headers.containsKey('X-GhostClass-Request-ID')) {
      requestId = headers['X-GhostClass-Request-ID'] as String?;
    } else if (headers.containsKey('x-ghostclass-request-id')) {
      requestId = headers['x-ghostclass-request-id'] as String?;
    }
    if (requestId != null) _rcekMap.remove(requestId);
    return handler.next(err);
  }
}

class _RcekEntry {
  _RcekEntry({required this.rcek, required this.timestamp});
  final String rcek;
  final DateTime timestamp;
}
