import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/secure_storage.dart';

class SecurityGuard {
  final SecureStorageService storage;

  SecurityGuard(this.storage);

  Future<void> initialize() async {}

  Future<void> setSecureScreen(bool enabled) async {
    AppLogger.d(
      'SecurityGuard: secure screen ${enabled ? 'enabled' : 'disabled'}',
    );
  }
}
