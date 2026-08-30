# ProGuard rules for Flutter / native wrapper optimization
# Standard Android optimizations and preservation rules.

# Enable advanced R8 optimization passes
-optimizationpasses 5
-allowaccessmodification
-dontskipnonpubliclibraryclasses
-dontskipnonpubliclibraryclassmembers

# Preserve Flutter embedding and plugin reflection entry points
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Suppress warnings for optional Play Core split install classes referenced by Flutter embedding
-dontwarn com.google.android.play.core.**
-dontwarn io.flutter.embedding.android.**

