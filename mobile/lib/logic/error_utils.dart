import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:ghostclass/logic/app_exception.dart';

String formatApiError(dynamic response, String context) {
  if (response == null) {
    if (context == 'ApiService.Dio') {
      return "Connectivity problem: The server is taking too long to respond.";
    }
    if (context == 'Tracking.OfficialReport') {
      return "The attendance report is currently unavailable. Please check your connection and try again.";
    }
    return 'Failed to complete $context';
  }

  // Handle String response
  if (response is String && response.trim().isNotEmpty) {
    return response;
  }

  // Extract code and message
  String code = '';
  String message = '';
  int? status;

  if (response is PostgrestException) {
    code = response.code ?? '';
    message = response.message;
  } else if (response is DioException) {
    status = response.response?.statusCode;
    final data = response.response?.data;
    if (data is Map) {
      code = (data['code'] ?? '').toString();
      message = (data['message'] ?? data['error'] ?? data['detail'] ?? '').toString();
    } else {
      message = response.message ?? '';
    }
  } else if (response is Map) {
    code = (response['code'] ?? '').toString();
    message = (response['message'] ?? response['error'] ?? response['detail'] ?? '').toString();
    status = response['status'] as int?;
  } else if (response is AppException) {
    message = response.message;
    status = response.statusCode;
  }

  final lower = message.toLowerCase();

  // Row Level Security (RLS) violations
  if (code == '42501' || lower.contains('row-level security')) {
    if (context == 'adding course') {
      return "You don't have permission to add courses to this class. Ensure your profile sync is complete.";
    }
    if (context == 'attendance') {
      return "Permission denied. You can only modify your own attendance records.";
    }
    return "You don't have permission to perform this action.";
  }

  // Unique constraint violations
  if (code == '23505') {
    if (context == 'adding course') {
      return "This course already exists in your class lineup for this semester.";
    }
    if (context == 'attendance') {
      return "A record already exists for this date and session.";
    }
    return "This record already exists.";
  }

  // Foreign key violations
  if (code == '23503') {
    return "The related record was not found or has been deleted.";
  }

  // Data type / UUID mismatch
  if (code == '22P02') {
    return "Invalid data format. Please check your input and try again.";
  }

  // Network / timeout
  if (lower.contains('fetch') || lower.contains('network') || code == 'ERR_NETWORK') {
    return "Connection failed. Please check your internet and try again.";
  }

  // Circuit Breaker (503)
  if (status == 503 || lower.contains('technical issues')) {
    return "EzyGo servers are currently down. Please try again later.";
  }

  // Rate limiting
  if (code == '429' || lower.contains('too many requests') || status == 429) {
    return "Too many requests. Please wait a few moments and try again.";
  }

  return message.isNotEmpty ? message : 'Failed to complete $context';
}

/// Redacts sensitive information like IP addresses, ports, and file paths from error logs.
String sanitizeTechnicalDetails(String error) {
  // Remove IP addresses (v4)
  String sanitized = error.replaceAll(
      RegExp(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'), '[REDACTED_IP]');

  // Remove Port numbers in common formats
  sanitized = sanitized.replaceAll(RegExp(r'port\s*[:=]\s*\d+'), 'port = [REDACTED]');
  sanitized = sanitized.replaceAll(RegExp(r':\d{4,5}'), ':[REDACTED_PORT]');

  // Remove absolute Unix-like paths (keeping it safe for common startup logs)
  sanitized = sanitized.replaceAll(
      RegExp(r'\/[a-zA-Z0-9._\-\/]+\/[a-zA-Z0-9._\-]+'), '[REDACTED_PATH]');

  // Remove potential auth tokens in URLs or headers
  sanitized = sanitized.replaceAll(
      RegExp(r'(Bearer|token|key|secret)[^, \n]+', caseSensitive: false),
      r'$1 [REDACTED]');

  return sanitized;
}
