/// AppException
/// ------------
/// Custom exception class for handling application-specific errors with
/// structured types and technical details.
class AppException implements Exception {

  const AppException({
    required this.message,
    required this.type,
    this.originalError,
    this.statusCode,
    this.details,
  });
  final String message;
  final AppExceptionType type;
  final Object? originalError;
  final int? statusCode;
  final Map<String, dynamic>? details;

  bool get isAuthError =>
      type == AppExceptionType.unauthorized ||
      type == AppExceptionType.forbidden;

  @override
  String toString() => 'AppException($type): $message';
}

enum AppExceptionType {
  unknown,
  network,
  unauthorized,
  forbidden,
  rateLimit,
  server,
}
