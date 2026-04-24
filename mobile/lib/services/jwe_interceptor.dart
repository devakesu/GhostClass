import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/jwe_service.dart';
import 'package:ghostclass/services/logger.dart';

/// Interceptor that handles JSON Web Encryption (JWE) for all GhostClass API requests.
/// 
/// 1. [onRequest]: Encrypts outgoing POST/PUT request bodies and attaches the RCEK 
///    (Response Content Encryption Key) to the headers for server-side use.
/// 2. [onResponse]: Decrypts incoming encrypted responses using the stored RCEK.
class JweInterceptor extends Interceptor {
  // Use a map to store RCEKs for concurrent requests
  static final Map<String, String> _rcekMap = {};

  JweInterceptor(Ref ref);

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // Only encrypt requests to our own API and only if it's a write or explicit proxy
    final isGhostClassApi = options.path.contains('/api/') || options.baseUrl.contains('/api/');
    final isWrite = options.method == 'POST' || options.method == 'PUT' || options.method == 'PATCH';

    if (isGhostClassApi && isWrite && options.data is Map<String, dynamic>) {
      try {
        final jweService = JweService.instance;
        final result = await jweService.encryptRequest(options.data as Map<String, dynamic>);
        
        // Store the RCEK for this request's response decryption
        final requestId = options.hashCode.toString();
        _rcekMap[requestId] = result.rcek;
        
        options.data = result.jwe;
        options.headers['x-jwe'] = 'true';
        // The server needs the RCEK to decrypt the request and to encrypt the response
        // In the GhostClass protocol, we send the RCEK encrypted with the server's public key
        final keyResult = await jweService.encryptHeaderKey();
        options.headers['x-jwe-key'] = keyResult.jwe;
        
        AppLogger.d('JweInterceptor: Request encrypted for ${options.path}');
      } catch (e) {
        AppLogger.e('JweInterceptor: Encryption failed', e);
      }
    } else if (isGhostClassApi && options.method == 'GET') {
      // For GET requests, we still need to send a JWE key if we want the response to be encrypted
      try {
        final jweService = JweService.instance;
        final keyResult = await jweService.encryptHeaderKey();
        
        final requestId = options.hashCode.toString();
        _rcekMap[requestId] = keyResult.rcek;
        
        options.headers['x-jwe-key'] = keyResult.jwe;
      } catch (e) {
        AppLogger.e('JweInterceptor: GET Key setup failed', e);
      }
    }
    
    return handler.next(options);
  }

  @override
  Future<void> onResponse(Response response, ResponseInterceptorHandler handler) async {
    final isEncrypted = response.headers.value('x-jwe') == 'true';
    final requestId = response.requestOptions.hashCode.toString();
    final rcek = _rcekMap.remove(requestId);

    if (isEncrypted && rcek != null && response.data is String) {
      try {
        final jweService = JweService.instance;
        final decryptedData = await jweService.decryptResponse(response.data as String, rcek);
        response.data = decryptedData;
        AppLogger.d('JweInterceptor: Response decrypted for ${response.requestOptions.path}');
      } catch (e) {
        AppLogger.e('JweInterceptor: Decryption failed', e);
        // If decryption fails, it might be a security issue or server error
      }
    }
    
    return handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // Clean up RCEK on error to prevent memory leaks
    _rcekMap.remove(err.requestOptions.hashCode.toString());
    return handler.next(err);
  }
}
