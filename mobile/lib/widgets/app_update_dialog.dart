import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class AppUpdateDialog extends StatelessWidget {
  const AppUpdateDialog({
    required this.latestVersion,
    required this.isForceUpdate,
    super.key,
  });

  final String latestVersion;
  final bool isForceUpdate;

  /// Launches the store URL based on OS.
  Future<void> _launchStore() async {
    final urlString = (!kIsWeb && Platform.isIOS)
        ? AppConfig.appStoreUrl
        : AppConfig.playStoreUrl;
    final url = Uri.parse(urlString);
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } on Object {
      // Gracefully catch and ignore launching errors in testing/unsupported environments
    }
  }

  /// Displays the dialog.
  static Future<void> show(
    BuildContext context,
    String latestVersion, {
    required bool isForceUpdate,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: !isForceUpdate,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (ctx) => PopScope(
        canPop: !isForceUpdate,
        child: AppUpdateDialog(
          latestVersion: latestVersion,
          isForceUpdate: isForceUpdate,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final surfaceColor = Theme.of(context).colorScheme.surface;
    final primaryColor = Theme.of(context).colorScheme.primary;
    final onSurfaceColor = Theme.of(context).colorScheme.onSurface;

    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child:
          Container(
                constraints: const BoxConstraints(maxWidth: 400),
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(
                    color: onSurfaceColor.withValues(alpha: 0.08),
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      blurRadius: 40,
                      spreadRadius: 10,
                      offset: const Offset(0, 20),
                    ),
                  ],
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Download Icon with Pulsed Glow
                      Container(
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              color: primaryColor.withValues(alpha: 0.1),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              isForceUpdate
                                  ? LucideIcons.alertTriangle
                                  : LucideIcons.arrowUpCircle,
                              color: isForceUpdate
                                  ? Colors.amber
                                  : primaryColor,
                              size: 32,
                            ),
                          )
                          .animate(
                            onPlay: (controller) =>
                                controller.repeat(reverse: true),
                          )
                          .scale(
                            begin: const Offset(1, 1),
                            end: const Offset(1.1, 1.1),
                            duration: 1200.ms,
                          ),

                      const SizedBox(height: 24),

                      // Title
                      Text(
                        isForceUpdate
                            ? 'Critical Update Required'
                            : 'New Update Available!',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.manrope(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: onSurfaceColor,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Version Transition Badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: primaryColor.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: primaryColor.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'v${AppConfig.appVersion}',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: onSurfaceColor.withValues(alpha: 0.5),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Icon(
                              LucideIcons.arrowRight,
                              size: 14,
                              color: primaryColor.withValues(alpha: 0.6),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'v$latestVersion',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: primaryColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Message Body
                      Text(
                        isForceUpdate
                            ? 'A critical new security and feature update is required to continue using GhostClass. Please download the latest version (v$latestVersion) to stay secure.'
                            : 'A new version of GhostClass (v$latestVersion) is available! We highly recommend updating now to experience improved stability and fresh features.',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          color: onSurfaceColor.withValues(alpha: 0.7),
                          height: 1.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),

                      const SizedBox(height: 32),

                      // Action Buttons
                      Column(
                        children: [
                          // "Update Now" Primary Button
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: ElevatedButton.icon(
                              onPressed: _launchStore,
                              icon: const Icon(LucideIcons.download, size: 18),
                              label: Text(
                                'Update Now',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                ),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: primaryColor,
                                foregroundColor: Theme.of(
                                  context,
                                ).colorScheme.onPrimary,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                            ),
                          ),

                          // "Later" / Dismiss Tertiary Button (Only shown if optional)
                          if (!isForceUpdate) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              height: 56,
                              child: TextButton(
                                onPressed: () {
                                  Navigator.of(context).pop();
                                },
                                style: TextButton.styleFrom(
                                  foregroundColor: onSurfaceColor.withValues(
                                    alpha: 0.5,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                ),
                                child: Text(
                                  'Later',
                                  style: GoogleFonts.manrope(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: TextButton.icon(
                              onPressed: () async {
                                await SupportHelper.contactViaEmail(
                                  subject:
                                      'App Update Support [v${AppConfig.appVersion} ➔ v$latestVersion]',
                                  customBody:
                                      'Hello GhostClass Support Team,\n\n'
                                      'I am having trouble updating my app to the latest version (v$latestVersion).\n\n',
                                );
                              },
                              icon: const Icon(
                                LucideIcons.helpCircle,
                                size: 18,
                              ),
                              label: Text(
                                'Contact Support',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: onSurfaceColor.withValues(
                                  alpha: 0.6,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              )
              .animate()
              .scale(
                duration: 800.ms,
                curve: Curves.easeOutCubic,
                begin: const Offset(0.9, 0.9),
              )
              .fade(duration: 800.ms),
    );
  }
}
