import 'package:ghostclass/services/secure_storage.dart';

class StealthHeadersService {
  final SecureStorageService storage;

  StealthHeadersService(this.storage);

  Future<Map<String, String>> getHeaders({required String url}) async {
    return const {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    };
  }
}
