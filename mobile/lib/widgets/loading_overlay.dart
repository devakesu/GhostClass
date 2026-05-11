import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class LoadingOverlay extends StatelessWidget {
  final String message;
  final bool isFullScreen;
  final bool showLogo;

  const LoadingOverlay({
    super.key,
    this.message = 'Waiting on Ezygo to stop ghosting us 👻',
    this.isFullScreen = true,
    this.showLogo = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ghostColors = theme.extension<GhostColors>()!;
    final primary = ghostColors.brandPrimary ?? const Color(0xFF7C3AED);
    
    final content = SizedBox.expand(
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Main Spinner / Icon
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: primary.withValues(alpha: 0.1),
                      ),
                      child: showLogo 
                        ? Image.asset(
                            'assets/images/logo.png',
                            height: 60,
                          )
                        : Icon(
                            LucideIcons.ghost,
                            size: 60,
                            color: primary,
                          ),
                    )
                    .animate(onPlay: (c) => c.repeat())
                    .shimmer(
                      duration: 400.ms,
                      color: Colors.white.withValues(alpha: 0.6),
                    )
                    .scale(
                      begin: const Offset(1, 1),
                      end: const Offset(1.1, 1.1),
                      duration: 300.ms,
                      curve: Curves.easeInOut,
                    )
                    .then()
                    .scale(
                      begin: const Offset(1.1, 1.1),
                      end: const Offset(1, 1),
                      duration: 300.ms,
                      curve: Curves.easeInOut,
                    ),
                const SizedBox(height: 24),

                // The Text Message
                Text(
                      message,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: isFullScreen 
                            ? Colors.white.withValues(alpha: 0.9)
                            : theme.colorScheme.onSurface,
                        letterSpacing: 0.5,
                      ),
                    )
                    .animate(onPlay: (c) => c.repeat())
                    .fadeIn(duration: 400.ms)
                    .then()
                    .fadeOut(duration: 400.ms),

                const SizedBox(height: 8),

                // Subtle Subtitle / Hint
                Text(
                  'This might take a few seconds',
                  style: GoogleFonts.manrope(
                    color: isFullScreen
                        ? Colors.white.withValues(alpha: 0.3)
                        : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // Progress indicator at the bottom (optional/subtle)
          Positioned(
            bottom: 120,
            child: SizedBox(
                  width: 40,
                  height: 2,
                  child: LinearProgressIndicator(
                    backgroundColor: (isFullScreen ? Colors.white : theme.colorScheme.onSurface).withValues(alpha: 0.1),
                    valueColor: AlwaysStoppedAnimation(primary),
                  ),
                )
                .animate(onPlay: (c) => c.repeat())
                .shimmer(duration: 2000.ms),
          ),

          // EzyGo Disclaimer at Bottom
          Positioned(
            bottom: 80,
            left: 40,
            right: 40,
            child: Text(
              'The app will not load if EzyGo is down.',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                color: isFullScreen
                    ? Colors.white.withValues(alpha: 0.25)
                    : theme.colorScheme.onSurface.withValues(alpha: 0.3),
                height: 1.4,
              ),
            ).animate().fadeIn(delay: 500.ms, duration: 400.ms),
          ),
        ],
      ),
    );


    if (isFullScreen) {
      return PopScope(
        canPop: false, // LOCK the back button during loading
        child: Scaffold(
          backgroundColor: Colors.black.withValues(alpha: 0.85),
          body: ClipRRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: content,
            ),
          ),
        ),
      );
    }

    return content;
  }

  // Track the current overlay route to ensure we only pop what we pushed
  static dynamic _currentRoute;

  /// Helper to show the overlay as a dialog
  static void show(
    BuildContext context, {
    String message = 'Waiting on EzyGo...',
  }) {
    // If an overlay is already showing, don't push another
    if (_currentRoute != null) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      useRootNavigator: true,
      builder: (_) => LoadingOverlay(message: message),
    ).then((_) => _currentRoute = null);
    
    // We don't get the route object directly from showDialog easily,
    // so we use a flag to indicate visibility.
    _currentRoute = true; 
  }

  static void hide(BuildContext context) {
    if (!context.mounted) return;
    final navigator = Navigator.of(context, rootNavigator: true);
    hideWithNavigator(navigator);
  }

  static void hideWithNavigator(NavigatorState navigator) {
    if (_currentRoute == null) return;
    
    if (navigator.canPop()) {
      _currentRoute = null;
      navigator.pop();
    }
  }
}
