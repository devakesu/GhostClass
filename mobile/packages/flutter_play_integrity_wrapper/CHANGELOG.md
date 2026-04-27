# Changelog

## 0.0.2

* **Features**: Added `verifyTokenOnDevice` for direct Google API verification (mostly for debugging).
* **Features**: Added a Dart script (`dart run flutter_play_integrity_wrapper:setup_firebase_verification`) to generate Firebase Cloud Functions for secure server-side verification.
* **Improvements**: robust error handling. Introduced `PlayIntegrityException` to map native Android error codes (e.g. `API_NOT_AVAILABLE`, `NO_NETWORK`) to Dart exceptions.
* **Docs**: Updated README with detailed verification strategies (Backend, Firebase, Device).

## 0.0.1

* Initial release.
* Wrapper for Google Play Integrity API requestIntegrityToken.
