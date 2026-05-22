import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Centralized logging service for the application.
///
/// This ensures that logs are only printed during development and
/// redacted and forwarded to Sentry in production.
class AppLogger {
  AppLogger._();

  static final List<String> _logBuffer = [];
  static const int _maxBufferSize = 50;

  static void _addToBuffer(String level, String message) {
    final timestamp = DateTime.now().toIso8601String().substring(11, 19);
    _logBuffer.add('[$timestamp] [$level] $message');
    if (_logBuffer.length > _maxBufferSize) {
      _logBuffer.removeAt(0);
    }
  }

  /// Returns the current log buffer as a single string.
  static String getLogBuffer() => _logBuffer.join('\n');

  /// Returns a sanitized version of the log buffer suitable for export.
  static String getSanitizedLogBuffer() => sanitizeForExport(getLogBuffer());

  static String _hashString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Sanitizes a log string for export or Sentry by removing common PII
  /// and replacing UUIDs with a hashed placeholder.
  static String sanitizeForExport(String raw) {
    if (raw.isEmpty) return raw;
    var s = raw;

    // Reuse existing technical sanitizer for IPs, paths, tokens
    s = sanitizeTechnicalDetails(s);

    // Redact emails
    s = s.replaceAll(
      RegExp(r'[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}'),
      '[REDACTED_EMAIL]',
    );

    // Redact phone-like strings (heuristic)
    s = s.replaceAll(RegExp(r'\+?\d[\d\s\-]{6,}\d'), '[REDACTED_PHONE]');

    // Hash UUIDs
    s = s.replaceAllMapped(
      RegExp(
        r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b',
      ),
      (m) => 'HASHED_USERID:${_hashString(m.group(0)!)}',
    );

    return s;
  }

  static final RegExp _safeTagChars = RegExp('[^a-z0-9._-]');

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
    _addToBuffer('DEBUG', message);
    if (kDebugMode) {
      debugPrint('[DEBUG] $message');
      if (error != null) debugPrint('Error: $error');
      if (stackTrace != null) debugPrint('StackTrace: $stackTrace');
    }
  }

  /// Safely attach a top-level catcher to a fire-and-forget future.
  /// Use this instead of calling `unawaited(...)` directly to ensure
  /// exceptions are logged and do not get silently dropped.
  static void safeUnawait(Future<dynamic> future, [String? context]) {
    unawaited(
      future.catchError(
        (Object e, StackTrace st) => AppLogger.e(
          'SafeUnawait${context != null ? ': $context' : ''}',
          e,
          st,
        ),
      ),
    );
  }

  /// Logs an information message.
  static void i(String message) {
    _addToBuffer('INFO', message);
    if (kDebugMode) debugPrint('[INFO] $message');
    unawaited(
      Sentry.addBreadcrumb(
        Breadcrumb(message: message, level: SentryLevel.info),
      ).catchError(
        (Object e, StackTrace st) {
          debugPrint('Sentry breadcrumb failed: $e $st');
        },
      ),
    );
  }

  /// Logs a warning message.
  static void w(String message, [Object? error]) {
    _addToBuffer('WARN', message);
    if (kDebugMode) {
      debugPrint('[WARNING] $message');
      if (error != null) debugPrint('Details: $error');
    }
    unawaited(
      Sentry.addBreadcrumb(
        Breadcrumb(
          message: message,
          level: SentryLevel.warning,
          data: error != null ? {'error': error.toString()} : null,
        ),
      ).catchError(
        (Object e, StackTrace st) {
          debugPrint('Sentry breadcrumb failed: $e $st');
        },
      ),
    );
  }

  /// Logs an error message (simple wrapper).
  static void e(String message, [Object? error, StackTrace? stackTrace]) {
    eWithContext(message, error: error, stackTrace: stackTrace);
  }

  /// Logs an error message with optional tags/extras and sends a sanitized
  /// payload to Sentry. PII is redacted and any UUIDs are hashed.
  static void eWithContext(
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, String>? tags,
    Map<String, dynamic>? extras,
  }) {
    _addToBuffer('ERROR', message);
    if (kDebugMode) {
      debugPrint('[ERROR] $message');
      if (error != null) debugPrint('Error: $error');
      if (stackTrace != null) debugPrint('StackTrace: $stackTrace');
    }

    final sanitizedMessage = sanitizeForExport(message);
    final sanitizedError = error != null
        ? sanitizeForExport(error.toString())
        : null;
    final sanitizedExtras = <String, dynamic>{};
    if (extras != null) {
      for (final e in extras.entries) {
        sanitizedExtras[e.key] = sanitizeForExport(e.value.toString());
      }
    }

    // Extract first UUID (if any) and hash it for tagging
    String? hashedUserId;
    final uuidRegex = RegExp(
      r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b',
    );
    final match =
        uuidRegex.firstMatch(message) ??
        uuidRegex.firstMatch(error?.toString() ?? '');
    if (match != null) hashedUserId = _hashString(match.group(0)!);

    final capturedError = error ?? Exception(message);

    unawaited(
      Sentry.captureException(
        capturedError,
        stackTrace: stackTrace,
        withScope: (scope) async {
          await scope.setTag('logger_message', sanitizedMessage);
          for (final entry in _deriveTags(message).entries) {
            await scope.setTag(entry.key, entry.value);
          }
          if (tags != null) {
            for (final entry in tags.entries) {
              await scope.setTag(entry.key, _toSafeTagValue(entry.value));
            }
          }
          if (hashedUserId != null) {
            await scope.setTag('user_id_hashed', hashedUserId);
          }
          final loggerContext = <String, dynamic>{'message': sanitizedMessage};
          if (sanitizedError != null) loggerContext['error'] = sanitizedError;
          if (sanitizedExtras.isNotEmpty) {
            loggerContext['details'] = sanitizedExtras;
          }
          await scope.setContexts('logger', loggerContext);
        },
      ).catchError(
        (Object e, StackTrace st) {
          debugPrint('Sentry capture failed: $e $st');
          return const SentryId.empty();
        },
      ),
    );
  }
}
