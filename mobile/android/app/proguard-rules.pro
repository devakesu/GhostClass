# ProGuard rules for Flutter / native wrapper optimization
# Standard Android optimizations and preservation rules.

# Preserve Flutter wrapper classes if needed
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class plugins.flutter.io.**  { *; }

# Suppress warnings for optional Play Core split install classes referenced by Flutter embedding
-dontwarn com.google.android.play.core.**
