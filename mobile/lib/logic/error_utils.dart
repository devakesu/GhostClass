String formatApiError(dynamic response, String context) {
  if (response == null) return '$context: Unknown error';

  if (response is String && response.trim().isNotEmpty) {
    return response;
  }

  if (response is Map) {
    final message =
        response['message'] ?? response['error'] ?? response['detail'];
    if (message is String && message.trim().isNotEmpty) return message;
    return '$context: ${response.toString()}';
  }

  return '$context: ${response.toString()}';
}
