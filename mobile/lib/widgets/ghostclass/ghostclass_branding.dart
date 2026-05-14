import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
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
          GestureDetector(
            onTap: () => _launchUrl(authorUrl),
            behavior: HitTestBehavior.opaque,
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
              _FooterActionButton(
                icon: LucideIcons.coffee,
                label: 'Buy me a Coffee',
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.pinkAccent
                    : const Color(0xFFDB2777),
                onTap: () => _launchUrl(donateUrl),
              ),
              const SizedBox(width: 8),
              _FooterActionButton(
                icon: LucideIcons.star,
                label: 'Star on GitHub',
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.amber
                    : Colors.amber.shade700,
                onTap: () => _launchUrl(githubUrl),
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

class _FooterActionButton extends StatelessWidget {
  const _FooterActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 10),
            Text(
              label.toUpperCase(),
              style: GoogleFonts.manrope(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                color: color,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SecondaryLink extends StatelessWidget {
  const _SecondaryLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Text(
        label,
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          letterSpacing: 1.2,
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
