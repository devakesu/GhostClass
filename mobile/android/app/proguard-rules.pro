# ProGuard rules for Flutter / native wrapper optimization
# Standard Android optimizations and preservation rules.

# Preserve generated plugin registrant and Flutter plugin reflection entry points
-keep class plugins.flutter.io.** { *; }

# Suppress warnings for optional Play Core split install classes referenced by Flutter embedding
-dontwarn com.google.android.play.core.**

