import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/type_utils.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/about/about_widgets.dart';
import 'package:ghostclass/widgets/about/attestation_section.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _copy(BuildContext context, String value, String label) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied'),
        backgroundColor: Theme.of(context).colorScheme.primary,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String _shortSha(String value) {
    if (value.isEmpty || value == 'local') return value;
    if (value.length <= 10) return value;
    return '${value.substring(0, 8)}…';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final accent =
        ghostColors?.brandAccent ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = Theme.of(context).colorScheme.onSecondary;

    final releaseState = AppConfig.isReleaseBuild
        ? 'Signed release build'
        : 'Local / debug build';
    final releaseColor = AppConfig.isReleaseBuild
        ? ghostColors?.successGreen ?? const Color(0xFF10B981)
        : ghostColors?.warningYellow ?? const Color(0xFFF59E0B);

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          Positioned(
            top: -120,
            right: -100,
            child: _GlowBlob(color: accent.withValues(alpha: 0.22), size: 260),
          ),
          Positioned(
            top: 140,
            left: -120,
            child: _GlowBlob(color: primary.withValues(alpha: 0.18), size: 220),
          ),
          SafeArea(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
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
                        _PillButton(
                          icon: LucideIcons.github,
                          label: 'Repo',
                          onTap: () {
                            final _ = _launchUrl(AppConfig.githubUrl);
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const TransparencyBadge(expanded: true),
                        const SizedBox(height: 20),
                        Text(
                              'Release receipts, in-app.',
                              style: GoogleFonts.manrope(
                                fontSize: 34,
                                height: 1,
                                fontWeight: FontWeight.w900,
                                color: onSurface,
                                letterSpacing: -1.1,
                              ),
                            )
                            .animate()
                            .fadeIn(duration: 260.ms)
                            .slideY(begin: 0.10),
                        const SizedBox(height: 12),
                        Text(
                              'This screen shows the exact release build details injected by CI so users can verify what binary they are running without leaving the app.',
                              style: GoogleFonts.manrope(
                                fontSize: 14,
                                height: 1.55,
                                fontWeight: FontWeight.w500,
                                color: muted.withValues(alpha: 0.95),
                              ),
                            )
                            .animate()
                            .fadeIn(delay: 80.ms, duration: 260.ms)
                            .slideY(begin: 0.08),
                        const SizedBox(height: 20),
                        _StatusBanner(
                          title: releaseState,
                          subtitle: AppConfig.isReleaseBuild
                              ? 'APK signed in GitHub Actions and published with SBOM + provenance.'
                              : 'Debug builds are local and will not match the published release artifact.',
                          accent: releaseColor,
                        ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(24, 10, 24, 0),
                  sliver: SliverGrid(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 14,
                          crossAxisSpacing: 14,
                          childAspectRatio: 1.18,
                        ),
                    delegate: SliverChildListDelegate([
                      MetricCard(
                        icon: LucideIcons.tag,
                        label: 'Version',
                        value: AppConfig.appVersion,
                        accent: primary,
                        onTap: AppConfig.isReleaseBuild
                            ? () {
                                final _ = _launchUrl(AppConfig.playStoreUrl);
                              }
                            : null,
                        onLongPress: () {
                          final _ = _copy(
                            context,
                            AppConfig.appVersion,
                            'Version',
                          );
                        },
                      ),
                      MetricCard(
                        icon: LucideIcons.fileDigit,
                        label: 'Commit',
                        value: _shortSha(AppConfig.appCommitSha),
                        accent: accent,
                        onTap:
                            (AppConfig.appCommitSha != 'local' &&
                                AppConfig.appCommitSha.isNotEmpty)
                            ? () {
                                final _ = _launchUrl(
                                  '${AppConfig.githubUrl}/commit/${AppConfig.appCommitSha}',
                                );
                              }
                            : null,
                        onLongPress: () {
                          final _ = _copy(
                            context,
                            AppConfig.appCommitSha,
                            'Commit SHA',
                          );
                        },
                      ),
                      MetricCard(
                        icon: LucideIcons.clock3,
                        label: 'Built',
                        value: formatBuildTimestamp(AppConfig.buildTimestamp),
                        accent: const Color(0xFF0EA5E9),
                        onTap: () {
                          final _ = _copy(
                            context,
                            AppConfig.buildTimestamp,
                            'Build timestamp',
                          );
                        },
                      ),
                      MetricCard(
                        icon: LucideIcons.hash,
                        label: 'Run',
                        value: AppConfig.githubRunNumber,
                        accent:
                            ghostColors?.successGreen ??
                            const Color(0xFF10B981),
                        onTap:
                            (AppConfig.githubRunId != 'local' &&
                                AppConfig.githubRunId.isNotEmpty)
                            ? () {
                                final _ = _launchUrl(
                                  '${AppConfig.githubUrl}/actions/runs/${AppConfig.githubRunId}',
                                );
                              }
                            : null,
                        onLongPress: () {
                          final _ = _copy(
                            context,
                            AppConfig.githubRunId,
                            'Workflow run',
                          );
                        },
                      ),
                    ]),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
                    child: SectionCard(
                      title: 'What is proven',
                      subtitle:
                          'The mobile release lane is built to leave a paper trail that matches the GitHub workflow.',
                      children: [
                        const ProofRow(
                          icon: LucideIcons.shieldCheck,
                          label: 'Signed APK',
                          value:
                              'Release keystore injected from secrets and used in CI.',
                        ),
                        const ProofRow(
                          icon: LucideIcons.packageSearch,
                          label: 'SBOM',
                          value:
                              'CycloneDX output generated from the Flutter dependency graph.',
                        ),
                        const ProofRow(
                          icon: LucideIcons.fileLock2,
                          label: 'Provenance',
                          value:
                              'GitHub attestation attached to the APK artifact.',
                        ),
                        ProofRow(
                          icon: LucideIcons.monitorSmartphone,
                          label: 'Runtime mode',
                          value: releaseState,
                        ),
                      ],
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
                    child: AttestationSection(
                      onLaunch: (url) async {
                        final _ = _launchUrl(url);
                      },
                      onCopy: (ctx, val, lbl) async {
                        final _ = _copy(ctx, val, lbl);
                      },
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                    child: SectionCard(
                      title: 'Pointers',
                      subtitle:
                          'These links should point to the same release lineage as the binary on your device.',
                      children: [
                        LinkRow(
                          icon: LucideIcons.playCircle,
                          title: 'Google Play Store',
                          value: AppConfig.playStoreUrl,
                          onTap: () {
                            final _ = _launchUrl(AppConfig.playStoreUrl);
                          },
                        ),
                        LinkRow(
                          icon: LucideIcons.github,
                          title: 'GitHub repository',
                          value: AppConfig.githubUrl,
                          onTap: () {
                            final _ = _launchUrl(AppConfig.githubUrl);
                          },
                        ),
                        LinkRow(
                          icon: LucideIcons.globe,
                          title: 'Web app',
                          value: AppConfig.webUrl,
                          onTap: () {
                            final _ = _launchUrl(AppConfig.webUrl);
                          },
                        ),
                        LinkRow(
                          icon: LucideIcons.mail,
                          title: 'Legal contact',
                          value: AppConfig.legalEmail,
                          onTap: () {
                            final _ = _copy(
                              context,
                              AppConfig.legalEmail,
                              'Legal email',
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 28)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.title,
    required this.subtitle,
    required this.accent,
  });
  final String title;
  final String subtitle;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(LucideIcons.shieldCheck, color: accent, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: accent,
                  ),
                ),
                Text(
                  subtitle,
                  style: GoogleFonts.manrope(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: accent.withValues(alpha: 0.8),
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
