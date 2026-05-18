import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/constants/static_content.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class LegalScreen extends StatefulWidget {
  const LegalScreen({
    required this.title,
    required this.body,
    super.key,
  });
  final String title;
  final String body;

  @override
  State<LegalScreen> createState() => _LegalScreenState();
}

class _LegalScreenState extends State<LegalScreen> {
  bool _renderMarkdown = false;

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        setState(() => _renderMarkdown = true);
      }
    });
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _copyToClipboard(
    BuildContext context,
    String text,
    String label,
  ) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied to clipboard'),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Theme.of(context).colorScheme.primary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final accent =
        ghostColors?.brandAccent ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          // Background Glow Blobs for aesthetics
          Positioned(
            top: -100,
            right: -80,
            child: _GlowBlob(color: accent.withValues(alpha: 0.15), size: 300),
          ),
          Positioned(
            bottom: 100,
            left: -120,
            child: _GlowBlob(color: primary.withValues(alpha: 0.12), size: 280),
          ),

          SafeArea(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                // Custom Header
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                    child: Row(
                      children: [
                        _PillButton(
                          icon: LucideIcons.chevronLeft,
                          label: 'Back',
                          onTap: () => context.pop(),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(100),
                            border: Border.all(
                              color: primary.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                LucideIcons.shield,
                                size: 14,
                                color: primary,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Legal Compliance',
                                style: GoogleFonts.manrope(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: primary,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 32, 24, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: GoogleFonts.manrope(
                            fontSize: 40,
                            height: 1,
                            fontWeight: FontWeight.w900,
                            color: onSurface,
                            letterSpacing: -1.5,
                          ),
                        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Container(
                              width: 32,
                              height: 4,
                              decoration: BoxDecoration(
                                color: primary,
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ).animate().fadeIn(delay: 200.ms).scaleX(begin: 0),
                            const SizedBox(width: 12),
                            Text(
                              'Effective: $legalEffectiveDate  •  v$termsVersion',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: onSurface.withValues(alpha: 0.5),
                              ),
                            ).animate().fadeIn(delay: 300.ms),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // Markdown Content
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
                  sliver: SliverToBoxAdapter(
                    child: Container(
                      decoration: BoxDecoration(
                        color: onSurface.withValues(alpha: 0.03),
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(
                          color: onSurface.withValues(alpha: 0.08),
                        ),
                      ),
                      padding: const EdgeInsets.all(24),
                      child: _renderMarkdown
                          ? MarkdownBody(
                              data: widget.body,
                              onTapLink: (text, href, title) {
                                if (href != null) unawaited(_launchUrl(href));
                              },
                              styleSheet: MarkdownStyleSheet(
                                p: GoogleFonts.manrope(
                                  fontSize: 15,
                                  height: 1.75,
                                  color: onSurface.withValues(alpha: 0.8),
                                ),
                                h2: GoogleFonts.manrope(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: onSurface,
                                  height: 2.5,
                                ),
                                h3: GoogleFonts.manrope(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: onSurface,
                                  height: 2,
                                ),
                                listBullet: GoogleFonts.manrope(
                                  color: primary,
                                  fontWeight: FontWeight.bold,
                                ),
                                strong: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w800,
                                  color: onSurface,
                                ),
                                em: GoogleFonts.manrope(
                                  fontStyle: FontStyle.italic,
                                ),
                                code: GoogleFonts.firaCode(
                                  backgroundColor: onSurface.withValues(
                                    alpha: 0.08,
                                  ),
                                  fontSize: 13,
                                  color: primary,
                                ),
                                blockquote: GoogleFonts.manrope(
                                  fontStyle: FontStyle.italic,
                                  color: onSurface.withValues(alpha: 0.7),
                                ),
                                blockquoteDecoration: BoxDecoration(
                                  color: primary.withValues(alpha: 0.05),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border(
                                    left: BorderSide(color: primary, width: 4),
                                  ),
                                ),
                                horizontalRuleDecoration: BoxDecoration(
                                  border: Border(
                                    top: BorderSide(
                                      color: onSurface.withValues(alpha: 0.1),
                                    ),
                                  ),
                                ),
                              ),
                            )
                          : const Center(
                              child: Padding(
                                padding: EdgeInsets.symmetric(vertical: 40),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                    ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.05),
                  ),
                ),

                // Contact & GitHub Section
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                    child: Column(
                      children: [
                        _ActionCard(
                          icon: LucideIcons.mail,
                          title: 'Legal Inquiry',
                          subtitle: AppConfig.legalEmail,
                          onTap: () => _copyToClipboard(
                            context,
                            AppConfig.legalEmail,
                            'Legal Email',
                          ),
                        ),
                        const SizedBox(height: 12),
                        _ActionCard(
                          icon: LucideIcons.shieldCheck,
                          title: 'Build Transparency',
                          subtitle:
                              'Verify app integrity and audit our lineage',
                          onTap: () => context.push('/about'),
                        ),
                      ],
                    ).animate().fadeIn(delay: 600.ms),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: onSurface.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: onSurface.withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 20,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.manrope(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: onSurface,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              LucideIcons.chevronRight,
              size: 16,
              color: onSurface.withValues(alpha: 0.3),
            ),
          ],
        ),
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(100),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(100),
            border: Border.all(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: theme.colorScheme.onSurface),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color,
            blurRadius: size * 0.8,
            spreadRadius: size * 0.2,
          ),
        ],
      ),
    );
  }
}
