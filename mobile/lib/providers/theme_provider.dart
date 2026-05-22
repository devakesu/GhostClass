import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:shared_preferences/shared_preferences.dart';

final themeProvider = NotifierProvider<ThemeNotifier, ThemeMode>(
  ThemeNotifier.new,
);

/// ThemeNotifier
/// -------------
/// Manages the persistence and state of the application's theme mode.
class ThemeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';
  static ThemeMode? _preloadedTheme;

  static Future<void> preload() async {
    if (_preloadedTheme != null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final index = prefs.getInt(_key);
      if (index != null && index < ThemeMode.values.length) {
        _preloadedTheme = ThemeMode.values[index];
      }
    } on Object catch (e) {
      AppLogger.e('ThemeNotifier: Error preloading theme', e);
    }
  }

  @override
  ThemeMode build() {
    final _ = _loadTheme();
    return _preloadedTheme ?? ThemeMode.system;
  }

  Future<void> _loadTheme() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final index = prefs.getInt(_key);
      if (index != null && index < ThemeMode.values.length) {
        final mode = ThemeMode.values[index];
        _preloadedTheme = mode;
        state = mode;
      }
    } on Object catch (e) {
      AppLogger.e('ThemeNotifier: Error loading theme', e);
    }
  }

  Future<void> setTheme(ThemeMode mode) async {
    _preloadedTheme = mode;
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_key, mode.index);
    } on Object catch (e) {
      AppLogger.e('ThemeNotifier: Error saving theme', e);
    }
  }

  void toggleTheme() {
    final newMode = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    final _ = setTheme(newMode);
  }
}
