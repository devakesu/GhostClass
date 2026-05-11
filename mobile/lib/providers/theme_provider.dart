import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ghostclass/services/logger.dart';

final themeProvider = NotifierProvider<ThemeNotifier, ThemeMode>(
  ThemeNotifier.new,
);

/// ThemeNotifier
/// -------------
/// Manages the persistence and state of the application's theme mode.
class ThemeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';

  @override
  ThemeMode build() {
    _loadTheme();
    return ThemeMode.system;
  }

  Future<void> _loadTheme() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final index = prefs.getInt(_key);
      if (index != null && index < ThemeMode.values.length) {
        state = ThemeMode.values[index];
      }
    } catch (e) {
      AppLogger.e('ThemeNotifier: Error loading theme', e);
    }
  }

  Future<void> setTheme(ThemeMode mode) async {
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_key, mode.index);
    } catch (e) {
      AppLogger.e('ThemeNotifier: Error saving theme', e);
    }
  }

  void toggleTheme() {
    final newMode = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    setTheme(newMode);
  }
}
