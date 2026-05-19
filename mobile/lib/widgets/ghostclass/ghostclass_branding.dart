import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:ghostclass/widgets/footer/footer_action_button.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class GhostClassBranding extends StatelessWidget {
  const GhostClassBranding({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authorName = AppConfig.authorName;
    final authorUrl = AppConfig.authorUrl;
    final githubUrl = AppConfig.githubUrl;
    final donateUrl = AppConfig.donateUrl;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
      child: Column(
        children: [
          // Author Credits at Very Top
          InkWell(
            onTap: () => _launchUrl(authorUrl),
            splashColor: Colors.transparent,
            highlightColor: Colors.transparent,
            child: Column(
              children: [
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.8),
                      letterSpacing: 2.5,
                    ),
                    children: [
                      const TextSpan(text: 'CRAFTED WITH '),
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Icon(
                          LucideIcons.heart,
                          size: 11,
                          color: Colors.pinkAccent.withValues(alpha: 0.8),
                        ),
                      ),
                      const TextSpan(text: ' BY'),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  authorName.toUpperCase(),
                  style: GoogleFonts.manrope(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.onSurface,
                    letterSpacing: 4,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Primary Actions
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FooterActionButton(
                icon: LucideIcons.coffee,
                label: 'Buy me a Coffee',
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.pinkAccent
                    : const Color(0xFFDB2777),
                onTap: () => _launchUrl(donateUrl),
                uppercase: false,
              ),
              const SizedBox(width: 8),
              FooterActionButton(
                icon: LucideIcons.star,
                label: 'Star on GitHub',
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.amber
                    : Colors.amber.shade700,
                onTap: () => _launchUrl(githubUrl),
                uppercase: false,
              ),
            ],
          ),

          const SizedBox(height: 12),

          TransparencyBadge(onTap: () => context.push('/about')),

          const SizedBox(height: 20),

          // Secondary Links
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SecondaryLink(
                label: 'GHOSTCLASS WEB',
                onTap: () => _launchUrl(AppConfig.webUrl),
              ),
              const SizedBox(width: 16),
              _SecondaryLink(
                label: 'PROJECT CREDITS',
                onTap: () => _launchUrl(AppConfig.creditsUrl),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Minimal Divider to Settings
          Container(
            width: 32,
            height: 4,
            decoration: BoxDecoration(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}

// FooterActionButton provided by shared widget.

class _SecondaryLink extends StatelessWidget {
  const _SecondaryLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }
}

class GhostClassSectionTitle extends StatelessWidget {
  const GhostClassSectionTitle({required this.title, super.key, this.color});
  final String title;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: GoogleFonts.manrope(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color:
            color ??
            Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
        letterSpacing: 1.2,
      ),
    );
  }
}
