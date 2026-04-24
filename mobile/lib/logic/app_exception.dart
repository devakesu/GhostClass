class AppException implements Exception {
  final String message;
  final AppExceptionType type;
  final Object? originalError;
  final int? statusCode;

  const AppException({
    required this.message,
    required this.type,
    this.originalError,
    this.statusCode,
  });

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
