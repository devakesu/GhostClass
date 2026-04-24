import 'package:ghostclass/services/secure_storage.dart';

class SettingsService {
  final SecureStorageService storage;

  SettingsService(this.storage);

  Future<void> updateSettings(
    String userId, {
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, String>>? disabledCourses,
  }) async {}

  Future<void> saveSettingsLocally(UserSettings settings) =>
      storage.saveSettings(settings);
}
