import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Centralized logging service for the application.
/// 
/// This ensures that logs are only printed during development and
/// stripped or handled securely in production.
class AppLogger {
  AppLogger._();

  static final RegExp _safeTagChars = RegExp(r'[^a-z0-9._-]');

  static String _toSafeTagValue(String value) {
    final normalized = value.trim().toLowerCase().replaceAll(' ', '_');
    return normalized.replaceAll(_safeTagChars, '_');
  }

  static Map<String, String> _deriveTags(String message) {
    final tags = <String, String>{'log_level': 'error'};
    final splitIndex = message.indexOf(':');
    if (splitIndex > 0) {
      final component = message.substring(0, splitIndex).trim();
      if (component.isNotEmpty) {
        tags['component'] = _toSafeTagValue(component);
      }
    }
    return tags;
  }

  /// Logs a debug message.
  static void d(String message, [Object? error, StackTrace? stackTrace]) {
    if (kDebugMode) {
      debugPrint('[DEBUG] $message');
      if (error != null) {
        debugPrint('Error: $error');
      }
      if (stackTrace != null) {
        debugPrint('StackTrace: $stackTrace');
      }
    }
  }

  /// Logs an information message.
  static void i(String message) {
    if (kDebugMode) {
      debugPrint('[INFO] $message');
    }
    Sentry.addBreadcrumb(Breadcrumb(message: message, level: SentryLevel.info));
  }

  /// Logs a warning message.
  static void w(String message, [Object? error]) {
    if (kDebugMode) {
      debugPrint('[WARNING] $message');
      if (error != null) {
        debugPrint('Details: $error');
      }
    }
    Sentry.addBreadcrumb(Breadcrumb(
      message: message,
      level: SentryLevel.warning,
      data: error != null ? {'error': error.toString()} : null,
    ));
  }

  /// Logs an error message.
  static void e(String message, [Object? error, StackTrace? stackTrace]) {
    eWithContext(message, error: error, stackTrace: stackTrace);
  }

  /// Logs an error message with optional Sentry tags and extras.
  static void eWithContext(
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, String>? tags,
    Map<String, dynamic>? extras,
  }) {
    if (kDebugMode) {
      debugPrint('[ERROR] $message');
      if (error != null) {
        debugPrint('Error: $error');
      }
      if (stackTrace != null) {
        debugPrint('StackTrace: $stackTrace');
      }
    }
    
    // Always capture in Sentry if it's an error
    Sentry.captureException(
      error ?? message,
      stackTrace: stackTrace,
      withScope: (scope) {
        scope.setTag('logger_message', message);
        for (final entry in _deriveTags(message).entries) {
          scope.setTag(entry.key, entry.value);
        }
        if (tags != null) {
          for (final entry in tags.entries) {
            scope.setTag(entry.key, _toSafeTagValue(entry.value));
          }
        }
        final loggerContext = <String, dynamic>{'message': message};
        if (error != null) {
          loggerContext['error'] = error.toString();
        }
        if (extras != null && extras.isNotEmpty) {
          loggerContext['details'] = Map<String, dynamic>.from(extras);
        }
        scope.setContexts('logger', loggerContext);
      },
    );
  }
}
