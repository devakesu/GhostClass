import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SettingsService {

  SettingsService(this.storage);
  final SecureStorageService storage;
  final SupabaseClient _client = Supabase.instance.client;

  Future<void> updateSettings(
    String userId, {
    bool? bunkEnabled,
    int? targetPercentage,
    Map<String, Map<String, dynamic>>? disabledCourses,
  }) async {
    final updates = <String, dynamic>{};
    if (bunkEnabled != null) updates['bunk_calculator_enabled'] = bunkEnabled;
    if (targetPercentage != null) updates['target_percentage'] = targetPercentage;
    if (disabledCourses != null) updates['disabled_courses'] = disabledCourses;

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
