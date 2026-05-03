import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SettingsService {
  final SecureStorageService storage;
  final _client = Supabase.instance.client;

  SettingsService(this.storage);

  Future<void> updateSettings(
    String userId, {
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, dynamic>>? disabledCourses,
    Map<String, String>? catalogOverride,
  }) async {
    final Map<String, dynamic> updates = {};
    if (bunkEnabled != null) updates['bunk_calculator_enabled'] = bunkEnabled;
    if (targetPercentage != null) updates['target_percentage'] = targetPercentage;
    if (disabledCourses != null) updates['disabled_courses'] = disabledCourses;
    if (catalogOverride != null) updates['course_catalog'] = catalogOverride;

    if (updates.isEmpty) return;

    await _client.from('user_settings').upsert({
      'user_id': userId,
      ...updates,
      'updated_at': DateTime.now().toIso8601String(),
    });
  }

  Future<void> saveSettingsLocally(UserSettings settings) =>
      storage.saveSettings(settings);
}
