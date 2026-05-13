import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

@immutable
class GhostColors extends ThemeExtension<GhostColors> {

  const GhostColors({
    required this.brandPurple,
    required this.brandPink,
    required this.accentOrange,
    required this.accentBlue,
    required this.accentCyan,
    required this.successGreen,
    required this.warningYellow,
    required this.dangerRed,
    required this.chartBar,
    required this.surfaceLighter,
  });
  final Color? brandPurple;
  final Color? brandPink;
  final Color? accentOrange;
  final Color? accentBlue;
  final Color? accentCyan;
  final Color? successGreen;
  final Color? warningYellow;
  final Color? dangerRed;
  final Color? chartBar;
  final Color? surfaceLighter;

  Color? get brandPrimary => brandPink;

  Color? get brandAccent => accentOrange;

  @override
  GhostColors copyWith({
    Color? brandPurple,
    Color? brandPink,
    Color? accentOrange,
    Color? accentBlue,
    Color? accentCyan,
    Color? successGreen,
    Color? warningYellow,
    Color? dangerRed,
    Color? chartBar,
    Color? surfaceLighter,
  }) {
    return GhostColors(
      brandPurple: brandPurple ?? this.brandPurple,
      brandPink: brandPink ?? this.brandPink,
      accentOrange: accentOrange ?? this.accentOrange,
      accentBlue: accentBlue ?? this.accentBlue,
      accentCyan: accentCyan ?? this.accentCyan,
      successGreen: successGreen ?? this.successGreen,
      warningYellow: warningYellow ?? this.warningYellow,
      dangerRed: dangerRed ?? this.dangerRed,
      chartBar: chartBar ?? this.chartBar,
      surfaceLighter: surfaceLighter ?? this.surfaceLighter,
    );
  }

  @override
  GhostColors lerp(ThemeExtension<GhostColors>? other, double t) {
    if (other is! GhostColors) return this;
    return GhostColors(
      brandPurple: Color.lerp(brandPurple, other.brandPurple, t),
      brandPink: Color.lerp(brandPink, other.brandPink, t),
      accentOrange: Color.lerp(accentOrange, other.accentOrange, t),
      accentBlue: Color.lerp(accentBlue, other.accentBlue, t),
      accentCyan: Color.lerp(accentCyan, other.accentCyan, t),
      successGreen: Color.lerp(successGreen, other.successGreen, t),
      warningYellow: Color.lerp(warningYellow, other.warningYellow, t),
      dangerRed: Color.lerp(dangerRed, other.dangerRed, t),
      chartBar: Color.lerp(chartBar, other.chartBar, t),
      surfaceLighter: Color.lerp(surfaceLighter, other.surfaceLighter, t),
    );
  }
}

class AppColors {
  // Brand & Semantic (Updated to match OKLCH values from Web)
  static const Color brandPurple = Color(0xFF7C3AED);
  static const Color brandPink = Color(0xFFEC4899); // Vibrant Pink (Tailwind Pink 500)
  static const Color successGreen = Color(0xFF10B981);
  static const Color dangerRed = Color(0xFFFF3B30); // Semantic Red (Clear contrast with Pink)
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentBlue = Color(0xFF3B82F6);
  static const Color accentCyan = Color(0xFF06B6D4);
  static const Color warningYellow = Color(0xFFFFB800);

  // Dark Theme Neutral (Aesthetic Midnight-Indigo for a lively, vibrant experience)
  static const Color background = Color(0xFF0F0F1E);     // Deep Midnight Indigo
  static const Color surface = Color(0xFF1B1B38);        // Vibrant Navy-Indigo Surface
  static const Color surfaceLighter = Color(0xFF2E2E5D); // Indigo Highlight Color
  static const Color primary = Color(0xFFF9FAFB);        // oklch(0.98 0.01 265)
  static const Color muted = Color(0xFF1F1F2E);
  static const Color mutedForeground = Color(0xFF94A3B8); // Brighter slate for lively text
  static const Color border = Color(0xFF3B3B55);         // oklch(0.32 0.06 265)

  // Light Theme Neutral (Clean and Modern)
  static const Color lightBackground = Color(0xFFF9FAFB);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceLighter = Color(0xFFF3F4F6);
  static const Color lightPrimary = Color(0xFF18181B);
  static const Color lightMuted = Color(0xFFF3F4F6);
  static const Color lightMutedForeground = Color(0xFF475569); // Sharper contrast for light mode
  static const Color lightBorder = Color(0xFFE5E7EB);
}

class AppTheme {
  static final ThemeData darkTheme = _buildDarkTheme();
  static final ThemeData lightTheme = _buildLightTheme();

  static ThemeData _buildDarkTheme() {
    final base = ThemeData.dark();
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.background,
      primaryColor: AppColors.brandPink,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.brandPink,
        onPrimary: Colors.white,
        surface: AppColors.surface,
        onSurface: AppColors.primary,
        secondary: AppColors.muted,
        onSecondary: AppColors.mutedForeground,
        secondaryContainer: AppColors.surfaceLighter,
        onSecondaryContainer: AppColors.mutedForeground,
      ),
      extensions: const [
        GhostColors(
          brandPurple: AppColors.brandPurple,
          brandPink: AppColors.brandPink,
          accentOrange: AppColors.accentOrange,
          accentBlue: AppColors.accentBlue,
          accentCyan: AppColors.accentCyan,
          successGreen: AppColors.successGreen,
          warningYellow: AppColors.warningYellow,
          dangerRed: AppColors.dangerRed,
          chartBar: AppColors.successGreen,
          surfaceLighter: AppColors.surfaceLighter,
        ),
      ],
      textTheme: GoogleFonts.manropeTextTheme(base.textTheme).copyWith(
        bodyLarge: const TextStyle(color: AppColors.primary, fontSize: 16),
        bodyMedium: const TextStyle(
          color: AppColors.mutedForeground,
          fontSize: 14,
        ),
        titleLarge: GoogleFonts.manrope(
          fontWeight: FontWeight.w900,
          color: AppColors.primary,
          fontSize: 28,
          letterSpacing: -1,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: AppColors.primary),
        titleTextStyle: TextStyle(
          color: AppColors.primary,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceLighter,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.brandPink, width: 2),
        ),
      ),
    );
  }

  static ThemeData _buildLightTheme() {
    final base = ThemeData.light();
    return ThemeData(
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.lightBackground,
      primaryColor: AppColors.brandPink,
      colorScheme: const ColorScheme.light(
        primary: AppColors.brandPink,
        onSurface: AppColors.lightPrimary,
        secondary: AppColors.lightMuted,
        onSecondary: AppColors.lightMutedForeground,
        secondaryContainer: AppColors.lightSurfaceLighter,
        onSecondaryContainer: AppColors.lightMutedForeground,
      ),
      extensions: const [
        GhostColors(
          brandPurple: AppColors.brandPurple,
          brandPink: AppColors.brandPink,
          accentOrange: Color(0xFFD97706),
          accentBlue: Color(0xFF2563EB),
          accentCyan: Color(0xFF0891B2),
          successGreen: Color(0xFF059669),
          warningYellow: Color(0xFFD97706),
          dangerRed: Color(0xFFDC2626),
          chartBar: Color(0xFF059669),
          surfaceLighter: AppColors.lightSurfaceLighter,
        ),
      ],
      textTheme: GoogleFonts.manropeTextTheme(base.textTheme).copyWith(
        bodyLarge: const TextStyle(color: AppColors.lightPrimary, fontSize: 16),
        bodyMedium: const TextStyle(
          color: AppColors.lightMutedForeground,
          fontSize: 14,
        ),
        titleLarge: GoogleFonts.manrope(
          fontWeight: FontWeight.w900,
          color: AppColors.lightPrimary,
          fontSize: 28,
          letterSpacing: -1,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: AppColors.lightPrimary),
        titleTextStyle: TextStyle(
          color: AppColors.lightPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.lightSurface,
        elevation: 2,
        shadowColor: Colors.black.withValues(alpha: 0.05),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.lightBorder),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.lightSurface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.lightBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.lightBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.brandPink, width: 2),
        ),
      ),
    );
  }
}
