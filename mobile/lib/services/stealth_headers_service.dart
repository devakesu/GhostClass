import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:ghostclass/services/secure_storage.dart';

class StealthHeadersService {
  final SecureStorageService storage;
  String? _deviceUA;
  String? _secChUa;
  String? _secChUaPlatform;

  StealthHeadersService(this.storage);

  Future<void> _initDeviceInfo() async {
    if (_deviceUA != null) return;

    try {
      final deviceInfo = DeviceInfoPlugin();
      
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        // Generate a Chrome-on-Android style UA
        _deviceUA = 'Mozilla/5.0 (Linux; Android ${androidInfo.version.release}; ${androidInfo.model} Build/${androidInfo.id}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';
        _secChUa = '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
        _secChUaPlatform = '"Android"';
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        // Generate a Safari-on-iOS style UA
        final version = iosInfo.systemVersion.replaceAll('.', '_');
        _deviceUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS $version like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${iosInfo.systemVersion} Mobile/15E148 Safari/604.1';
        _secChUa = ''; // iOS Safari doesn't typically send Sec-Ch-Ua
        _secChUaPlatform = '"iOS"';
      } else {
        _deviceUA = 'Mozilla/5.0 (${Platform.operatingSystem} ${Platform.operatingSystemVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        _secChUa = '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
        _secChUaPlatform = '"${Platform.operatingSystem}"';
      }
    } catch (e) {
      // Fallback
      _deviceUA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';
      _secChUa = '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
      _secChUaPlatform = '"Android"';
    }
  }

  Future<Map<String, String>> getHeaders({required String url}) async {
    final info = await storage.getStealthInfo();
    await _initDeviceInfo();
    
    final Map<String, String> headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-GB,en;q=0.9,en;q=0.8',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Priority': 'u=1, i',
    };

    if (url.contains('ezygo.app')) {
      headers['Origin'] = 'https://edu.ezygo.app';
      headers['Referer'] = 'https://edu.ezygo.app/';
    }

    if (info != null) {
      // Use spoofed browser info from storage if available
      headers['User-Agent'] = info.userAgent;
      headers['Sec-Ch-Ua'] = info.secChUa;
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = '"Windows"';
    } else {
      // Use real device info formatted as a browser User-Agent
      headers['User-Agent'] = _deviceUA!;
      if (_secChUa!.isNotEmpty) {
        headers['Sec-Ch-Ua'] = _secChUa!;
      }
      headers['Sec-Ch-Ua-Mobile'] = (Platform.isAndroid || Platform.isIOS) ? '?1' : '?0';
      headers['Sec-Ch-Ua-Platform'] = _secChUaPlatform!;
    }

    return headers;
  }
}
