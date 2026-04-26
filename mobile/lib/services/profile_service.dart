import 'package:ghostclass/services/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileService {
  final _client = Supabase.instance.client;

  bool hasRenderableLocalProfile(UserProfile? profile) {
    return profile?.fullName != null || profile?.avatarUrl != null;
  }

  Future<void> updateAvatar(String userId, String publicUrl) async {
    await _client.from('profiles').update({
      'avatar_url': publicUrl,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', userId);
  }

  Future<void> deleteAccount(String userId) async {
    // In GhostClass, account deletion is handled by a database function 
    // to ensure all related data (tracking, settings, etc.) is purged.
    await _client.rpc('delete_user_account');
  }
}
