import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class ServiceErrorDialog extends StatelessWidget {
  const ServiceErrorDialog({
    required this.title,
    required this.messages,
    super.key,
    this.onRetry,
    this.onContactSupport,
    this.closeLabel,
    this.retryLabel,
    this.details,
    this.isDismissible = true,
  });
  final String title;
  final List<String> messages;
  final VoidCallback? onRetry;
  final VoidCallback? onContactSupport;
  final String? closeLabel;
  final String? retryLabel;
  final String? details;
  final bool isDismissible;

  /// Shows the error dialog with a centralized design.
  static Future<void> show(
    BuildContext context,
    String title,
    List<String> messages, {
    VoidCallback? onRetry,
    VoidCallback? onContactSupport,
    String? closeLabel,
    String? retryLabel,
    String? details,
    bool isDismissible = true,
  }) {
    if (messages.isEmpty) return Future.value();

    return showDialog<void>(
      context: context,
      barrierDismissible: isDismissible,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (ctx) => PopScope(
        canPop: isDismissible,
        child: ServiceErrorDialog(
          title: title,
          messages: messages,
          onRetry: onRetry,
          onContactSupport: onContactSupport,
          closeLabel: closeLabel,
          retryLabel: retryLabel,
          details: details,
          isDismissible: isDismissible,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child:
          Container(
                constraints: const BoxConstraints(maxWidth: 400),
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.08),
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Error Icon with Pulsed Glow
                    Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withValues(alpha: 0.1),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            LucideIcons.alertCircle,
                            color: Colors.redAccent,
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
                      title,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).colorScheme.onSurface,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Message Area
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxHeight: MediaQuery.of(context).size.height * 0.4,
                      ),
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        child: Column(
                          children: [
                            ...messages.where((m) => m.trim().isNotEmpty).map((
                              msg,
                            ) {
                              final isList = messages.length > 1;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 14),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: isList
                                      ? MainAxisAlignment.start
                                      : MainAxisAlignment.center,
                                  children: [
                                    if (isList) ...[
                                      Padding(
                                        padding: const EdgeInsets.only(top: 7),
                                        child: Container(
                                          width: 6,
                                          height: 6,
                                          decoration: const BoxDecoration(
                                            color: Colors.redAccent,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 14),
                                    ],
                                    Flexible(
                                      child: Text(
                                        msg,
                                        textAlign: isList
                                            ? TextAlign.left
                                            : TextAlign.center,
                                        style: GoogleFonts.manrope(
                                          fontSize: 14,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurface
                                              .withValues(alpha: 0.7),
                                          height: 1.5,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }),

                            // Unified persistence message
                            Padding(
                              padding: const EdgeInsets.only(top: 8, bottom: 4),
                              child: Text(
                                'If this issue persists even after some time and repeated attempts, please contact us.',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.55),
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    if (details != null &&
                        (kDebugMode || details!.isNotEmpty)) ...[
                      const SizedBox(height: 16),
                      Theme(
                        data: Theme.of(
                          context,
                        ).copyWith(dividerColor: Colors.transparent),
                        child: ExpansionTile(
                          title: Text(
                            'Technical Details',
                            style: GoogleFonts.manrope(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                          tilePadding: EdgeInsets.zero,
                          children: [
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.05),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: SelectableText(
                                details!,
                                style: GoogleFonts.robotoMono(
                                  fontSize: 10,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.6),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 24),

                    // Actions
                    Column(
                      children: [
                        // Primary Action: Retry
                        if (onRetry != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: SizedBox(
                              width: double.infinity,
                              height: 56,
                              child: ElevatedButton.icon(
                                onPressed: () {
                                  Navigator.of(context).pop();
                                  onRetry!();
                                },
                                icon: Icon(
                                  // Use an 'x' icon for exit/close flows (label contains "Exit" or "Close"),
                                  // otherwise keep the restart/refresh icon.
                                  (retryLabel?.toLowerCase().contains('exit') ??
                                              false) ||
                                          (retryLabel?.toLowerCase().contains(
                                                'close',
                                              ) ??
                                              false)
                                      ? LucideIcons.x
                                      : LucideIcons.refreshCcw,
                                  size: 18,
                                ),
                                label: Text(
                                  retryLabel ?? 'Try Again',
                                  style: GoogleFonts.manrope(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  ),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Theme.of(
                                    context,
                                  ).colorScheme.primary,
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
                          ),

                        // Secondary Action: Contact Support
                        if (onContactSupport != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: SizedBox(
                              width: double.infinity,
                              height: 56,
                              child: OutlinedButton.icon(
                                onPressed: onContactSupport,
                                icon: const Icon(LucideIcons.mail, size: 18),
                                label: Text(
                                  'Contact Support',
                                  style: GoogleFonts.manrope(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Theme.of(
                                    context,
                                  ).colorScheme.onSurface,
                                  side: BorderSide(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface
                                        .withValues(alpha: 0.12),
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                ),
                              ),
                            ),
                          ),

                        // Tertiary Action: Close/Dismiss
                        if (isDismissible || closeLabel != null)
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: TextButton(
                              onPressed: () {
                                Navigator.of(context).pop();
                              },
                              style: TextButton.styleFrom(
                                foregroundColor: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.5),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                              child: Text(
                                closeLabel ?? 'Dismiss',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
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
