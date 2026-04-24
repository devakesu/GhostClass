import 'package:ghostclass/services/secure_storage.dart';

class ProfileService {
  bool hasRenderableLocalProfile(UserProfile? profile) {
    return profile?.fullName != null || profile?.avatarUrl != null;
  }

  Future<void> updateAvatar(String userId, String publicUrl) async {}

  Future<void> deleteAccount(String userId) async {}
}
