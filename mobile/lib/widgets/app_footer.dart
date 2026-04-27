import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class AppFooter extends StatelessWidget {
  const AppFooter({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final onSurface = theme.colorScheme.onSurface;
    final ghostColors = theme.extension<GhostColors>();
    final amber = ghostColors?.accentOrange ?? const Color(0xFFF59E0B);

    final borderColor = primary.withValues(alpha: 0.12);

    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. Dual Action Row: Transparency & Security
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _CompactActionTile(
                    icon: LucideIcons.shieldCheck,
                    label: 'Build Transparency',
                    subtitle:
                        'GhostClass is open-source and provides a verifiable lineage. Inspect our signed APK, SBOM, and provenance to ensure your app is secure. 🛡️',
                    gradientColors: [primary, amber],
                    onTap: () => context.push('/about'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _CompactActionTile(
                    icon: LucideIcons.lock,
                    label: "GHOSTS DON'T SNOOP 😁",
                    subtitle:
                        "Your EzyGo password is safe. We strictly do not read, store, or share your login password. GhostClass is just here to help you skip. 👻",
                    color: primary.withValues(alpha: 0.08),
                    iconColor: primary,
                    onTap: () {},
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 2. Links Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _FooterTextButton(
                icon: LucideIcons.helpCircle,
                label: 'Help',
                onTap: () => context.push('/help'),
              ),
              _FooterTextButton(
                icon: LucideIcons.shield,
                label: 'Legal',
                onTap: () => context.push('/legal'),
              ),
              _FooterTextButton(
                icon: LucideIcons.messageSquare,
                label: 'Contact',
                onTap: () => context.push('/contact'),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // 3. Divider
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Divider(color: borderColor, height: 1),
          ),
          const SizedBox(height: 20),

          // 4. Metadata & Donation Row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTap: () => _launchUrl(AppConfig.authorUrl),
                      child: Row(
                        children: [
                          Text(
                            AppConfig.authorName,
                            style: GoogleFonts.manrope(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: onSurface.withValues(alpha: 0.9),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            LucideIcons.externalLink,
                            size: 11,
                            color: onSurface.withValues(alpha: 0.3),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'GhostClass v${AppConfig.appVersion}',
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: onSurface.withValues(alpha: 0.4),
                      ),
                    ),
                  ],
                ),

                _CoffeeButton(onTap: () => _launchUrl(AppConfig.donateUrl)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;
  final List<Color>? gradientColors;
  final Color? color;
  final Color? iconColor;

  const _CompactActionTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
    this.gradientColors,
    this.color,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;

    return Material(
      color: theme.colorScheme.surface.withValues(alpha: 0.4),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: theme.colorScheme.primary.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  gradient: gradientColors != null
                      ? LinearGradient(
                          colors: gradientColors!,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : null,
                  color: color,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 14, color: iconColor ?? Colors.white),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: GoogleFonts.manrope(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        color: onSurface.withValues(alpha: 0.9),
                        letterSpacing: -0.2,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6), // Increased space between title and text
                    Text(
                      subtitle,
                      style: GoogleFonts.manrope(
                        fontSize: 8,
                        fontWeight: FontWeight.w600,
                        color: onSurface.withValues(alpha: 0.5),
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FooterTextButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _FooterTextButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: onSurface.withValues(alpha: 0.5)),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: onSurface.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CoffeeButton extends StatelessWidget {
  final VoidCallback onTap;

  const _CoffeeButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final ghostColors = theme.extension<GhostColors>();
    final amber = ghostColors?.accentOrange ?? const Color(0xFFF59E0B);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(100),
        boxShadow: [
          BoxShadow(
            color: primary.withValues(alpha: 0.2),
            blurRadius: 15,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(100),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(100),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [primary, amber],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(100),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.coffee, size: 14, color: Colors.white),
                const SizedBox(width: 8),
                Text(
                  'Buy Me A Coffee',
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
