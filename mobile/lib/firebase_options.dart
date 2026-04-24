import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform => const FirebaseOptions(
    apiKey: 'placeholder-api-key',
    appId: '1:000000000000:android:placeholder',
    messagingSenderId: '000000000000',
    projectId: 'ghostclass-placeholder',
    storageBucket: 'ghostclass-placeholder.appspot.com',
  );
}
