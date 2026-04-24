import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class AboutScreen extends StatelessWidget {
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

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final accent = ghostColors?.brandAccent ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = Theme.of(context).colorScheme.onSecondary;

    final releaseState = AppConfig.isReleaseBuild ? 'Signed release build' : 'Local / debug build';
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
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
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
                          onTap: () => _launchUrl(AppConfig.githubUrl),
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
                            height: 1.0,
                            fontWeight: FontWeight.w900,
                            color: onSurface,
                            letterSpacing: -1.1,
                          ),
                        ).animate().fadeIn(duration: 260.ms).slideY(begin: 0.10),
                        const SizedBox(height: 12),
                        Text(
                          'This screen shows the exact release build details injected by CI so users can verify what binary they are running without leaving the app.',
                          style: GoogleFonts.manrope(
                            fontSize: 14,
                            height: 1.55,
                            fontWeight: FontWeight.w500,
                            color: muted.withValues(alpha: 0.95),
                          ),
                        ).animate().fadeIn(delay: 80.ms, duration: 260.ms).slideY(begin: 0.08),
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
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 14,
                      crossAxisSpacing: 14,
                      childAspectRatio: 1.18,
                    ),
                    delegate: SliverChildListDelegate([
                      _MetricCard(
                        icon: LucideIcons.tag,
                        label: 'Version',
                        value: AppConfig.appVersion,
                        accent: primary,
                        onTap: () => _copy(context, AppConfig.appVersion, 'Version'),
                      ),
                      _MetricCard(
                        icon: LucideIcons.fileDigit,
                        label: 'Commit',
                        value: _shortSha(AppConfig.appCommitSha),
                        accent: accent,
                        onTap: () => _copy(context, AppConfig.appCommitSha, 'Commit SHA'),
                      ),
                      _MetricCard(
                        icon: LucideIcons.clock3,
                        label: 'Built',
                        value: AppConfig.buildTimestamp,
                        accent: ghostColors?.accentCyan ?? const Color(0xFF06B6D4),
                        onTap: () => _copy(context, AppConfig.buildTimestamp, 'Build timestamp'),
                      ),
                      _MetricCard(
                        icon: LucideIcons.hash,
                        label: 'Run',
                        value: AppConfig.githubRunNumber,
                        accent: ghostColors?.successGreen ?? const Color(0xFF10B981),
                        onTap: () => _copy(context, AppConfig.githubRunId, 'Workflow run'),
                      ),
                    ]),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
                    child: _SectionCard(
                      title: 'What is proven',
                      subtitle: 'The mobile release lane is built to leave a paper trail that matches the GitHub workflow.',
                      children: [
                        _ProofRow(icon: LucideIcons.shieldCheck, label: 'Signed APK', value: 'Release keystore injected from secrets and used in CI.'),
                        _ProofRow(icon: LucideIcons.packageSearch, label: 'SBOM', value: 'CycloneDX output generated from the Flutter dependency graph.'),
                        _ProofRow(icon: LucideIcons.fileLock2, label: 'Provenance', value: 'GitHub attestation attached to the APK artifact.'),
                        _ProofRow(icon: LucideIcons.monitorSmartphone, label: 'Runtime mode', value: releaseState),
                      ],
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                    child: _SectionCard(
                      title: 'Pointers',
                      subtitle: 'These links should point to the same release lineage as the binary on your device.',
                      children: [
                        _LinkRow(
                          icon: LucideIcons.github,
                          title: 'GitHub repository',
                          value: AppConfig.githubUrl,
                          onTap: () => _launchUrl(AppConfig.githubUrl),
                        ),
                        _LinkRow(
                          icon: LucideIcons.globe,
                          title: 'Web app',
                          value: AppConfig.ghostclassWebUrl,
                          onTap: () => _launchUrl(AppConfig.ghostclassWebUrl),
                        ),
                        _LinkRow(
                          icon: LucideIcons.mail,
                          title: 'Legal contact',
                          value: AppConfig.legalEmail,
                          onTap: () => _copy(context, AppConfig.legalEmail, 'Legal email'),
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

  String _shortSha(String value) {
    if (value.isEmpty || value == 'local') return value;
    if (value.length <= 10) return value;
    return '${value.substring(0, 8)}…';
  }
}

class _GlowBlob extends StatelessWidget {
  final Color color;
  final double size;

  const _GlowBlob({required this.color, required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: [
          BoxShadow(color: color, blurRadius: 70, spreadRadius: 20),
        ],
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _PillButton({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface.withValues(alpha: 0.65),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: theme.colorScheme.onSurface),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
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

class _StatusBanner extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color accent;

  const _StatusBanner({required this.title, required this.subtitle, required this.accent});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          colors: [accent.withValues(alpha: 0.15), theme.colorScheme.surface.withValues(alpha: 0.95)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: accent.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.manrope(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            subtitle,
            style: GoogleFonts.manrope(
              fontSize: 13,
              height: 1.5,
              fontWeight: FontWeight.w500,
              color: theme.colorScheme.onSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color accent;
  final VoidCallback onTap;

  const _MetricCard({required this.icon, required this.label, required this.value, required this.accent, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: accent.withValues(alpha: 0.18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 18, color: accent),
              ),
              const SizedBox(height: 18),
              Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSecondary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.manrope(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  color: theme.colorScheme.onSurface,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: theme.colorScheme.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.manrope(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: theme.colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: GoogleFonts.manrope(
              fontSize: 12.5,
              height: 1.5,
              fontWeight: FontWeight.w500,
              color: theme.colorScheme.onSecondary,
            ),
          ),
          const SizedBox(height: 18),
          ...children,
        ],
      ),
    );
  }
}

class _ProofRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _ProofRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ghostColors = theme.extension<GhostColors>();
    final accent = ghostColors?.accentCyan ?? const Color(0xFF06B6D4);

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 16, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: GoogleFonts.manrope(
                    fontSize: 12.5,
                    height: 1.45,
                    fontWeight: FontWeight.w500,
                    color: theme.colorScheme.onSecondary,
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

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  const _LinkRow({required this.icon, required this.title, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 16, color: theme.colorScheme.onSurface),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      value,
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: theme.colorScheme.onSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(LucideIcons.chevronRight, size: 18, color: theme.colorScheme.onSecondary),
            ],
          ),
        ),
      ),
    );
  }
}