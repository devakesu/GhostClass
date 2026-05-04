import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
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
                      _MetricCard(
                        icon: LucideIcons.tag,
                        label: 'Version',
                        value: AppConfig.appVersion,
                        accent: primary,
                        onTap: AppConfig.isReleaseBuild
                            ? () => _launchUrl(AppConfig.playStoreUrl)
                            : null,
                        onLongPress: () =>
                            _copy(context, AppConfig.appVersion, 'Version'),
                      ),
                      _MetricCard(
                        icon: LucideIcons.fileDigit,
                        label: 'Commit',
                        value: _shortSha(AppConfig.appCommitSha),
                        accent: accent,
                        onTap:
                            (AppConfig.appCommitSha != 'local' &&
                                AppConfig.appCommitSha.isNotEmpty)
                            ? () => _launchUrl(
                                '${AppConfig.githubUrl}/commit/${AppConfig.appCommitSha}',
                              )
                            : null,
                        onLongPress: () => _copy(
                          context,
                          AppConfig.appCommitSha,
                          'Commit SHA',
                        ),
                      ),
                      _MetricCard(
                        icon: LucideIcons.clock3,
                        label: 'Built',
                        value: AppConfig.buildTimestamp,
                        accent: const Color(0xFF0EA5E9),
                        onTap: () => _copy(
                          context,
                          AppConfig.buildTimestamp,
                          'Build timestamp',
                        ),
                      ),
                      _MetricCard(
                        icon: LucideIcons.hash,
                        label: 'Run',
                        value: AppConfig.githubRunNumber,
                        accent:
                            ghostColors?.successGreen ??
                            const Color(0xFF10B981),
                        onTap:
                            (AppConfig.githubRunId != 'local' &&
                                AppConfig.githubRunId.isNotEmpty)
                            ? () => _launchUrl(
                                '${AppConfig.githubUrl}/actions/runs/${AppConfig.githubRunId}',
                              )
                            : null,
                        onLongPress: () => _copy(
                          context,
                          AppConfig.githubRunId,
                          'Workflow run',
                        ),
                      ),
                    ]),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
                    child: _SectionCard(
                      title: 'What is proven',
                      subtitle:
                          'The mobile release lane is built to leave a paper trail that matches the GitHub workflow.',
                      children: [
                        _ProofRow(
                          icon: LucideIcons.shieldCheck,
                          label: 'Signed APK',
                          value:
                              'Release keystore injected from secrets and used in CI.',
                        ),
                        _ProofRow(
                          icon: LucideIcons.packageSearch,
                          label: 'SBOM',
                          value:
                              'CycloneDX output generated from the Flutter dependency graph.',
                        ),
                        _ProofRow(
                          icon: LucideIcons.fileLock2,
                          label: 'Provenance',
                          value:
                              'GitHub attestation attached to the APK artifact.',
                        ),
                        _ProofRow(
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
                    child: _AttestationSection(
                      onLaunch: _launchUrl,
                      onCopy: _copy,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                    child: _SectionCard(
                      title: 'Pointers',
                      subtitle:
                          'These links should point to the same release lineage as the binary on your device.',
                      children: [
                        _LinkRow(
                          icon: LucideIcons.playCircle,
                          title: 'Google Play Store',
                          value: AppConfig.playStoreUrl,
                          onTap: () => _launchUrl(AppConfig.playStoreUrl),
                        ),
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
                          onTap: () => _copy(
                            context,
                            AppConfig.legalEmail,
                            'Legal email',
                          ),
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

class _AttestationSection extends ConsumerStatefulWidget {
  final Future<void> Function(String) onLaunch;
  final Future<void> Function(BuildContext, String, String) onCopy;

  const _AttestationSection({required this.onLaunch, required this.onCopy});

  @override
  ConsumerState<_AttestationSection> createState() =>
      _AttestationSectionState();
}

class _AttestationSectionState extends ConsumerState<_AttestationSection> {
  bool _isLoading = false;
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _verify();
    });
  }

  Future<void> _verify() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final supabase = ref.read(supabaseClientProvider);
      final supabaseToken = supabase.auth.currentSession?.accessToken;

      final api = ref.read(apiServiceProvider);
      final response = await api.fetchAttestationDetails(supabaseToken);

      if (response.statusCode == 200) {
        if (mounted) setState(() => _data = response.data);
      } else {
        if (mounted) {
          setState(
            () => _error = 'Verification failed: ${response.statusCode}',
          );
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _showStatusGuide(
    BuildContext context, {
    required String title,
    required String summary,
    required List<String> details,
    required String status,
    required bool isSuccess,
    String? error,
  }) async {
    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.78),
      builder: (dialogContext) {
        final theme = Theme.of(dialogContext);
        final ghostColors = theme.extension<GhostColors>();
        final accent = ghostColors?.brandPrimary ?? theme.colorScheme.primary;
        final statusColor = isSuccess
            ? (ghostColors?.successGreen ?? Colors.green)
            : (ghostColors?.dangerRed ?? Colors.red);

        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.08),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.28),
                  blurRadius: 34,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(LucideIcons.info, size: 16, color: accent),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: GoogleFonts.manrope(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            summary,
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
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: statusColor.withValues(alpha: 0.15),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        isSuccess
                            ? LucideIcons.checkCircle2
                            : LucideIcons.alertCircle,
                        size: 14,
                        color: statusColor,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Current Result: $status',
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: theme.colorScheme.error.withValues(alpha: 0.15),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Diagnostic Message',
                          style: GoogleFonts.manrope(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: theme.colorScheme.error,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          error,
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.error.withValues(
                              alpha: 0.9,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Text(
                  'About this check',
                  style: GoogleFonts.manrope(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: theme.colorScheme.onSurface,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 10),
                ...details.map(
                  (line) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 6),
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.4),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            line,
                            style: GoogleFonts.manrope(
                              fontSize: 12.5,
                              height: 1.45,
                              fontWeight: FontWeight.w500,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: Text(
                      'Close',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return _SectionCard(
      title: 'Live Attestation',
      subtitle:
          'Dynamic verification of the app instance against Google Play Integrity.',
      children: [
        const SizedBox(height: 14),
        if (_isLoading)
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              _error!,
              style: GoogleFonts.manrope(
                fontSize: 12,
                color: theme.colorScheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        if (_data != null) ...[
          _StatusItem(
            label: 'App License',
            status:
                _data!['details']?['accountIntegrity']?['appLicensingVerdict'] ==
                    'LICENSED'
                ? 'VERIFIED'
                : 'UNRECOGNIZED',
            isSuccess:
                _data!['details']?['accountIntegrity']?['appLicensingVerdict'] ==
                'LICENSED',
            onInfoTap: () {
              final status =
                  _data!['details']?['accountIntegrity']?['appLicensingVerdict'] ==
                      'LICENSED'
                  ? 'VERIFIED'
                  : 'UNRECOGNIZED';
              final isSuccess =
                  _data!['details']?['accountIntegrity']?['appLicensingVerdict'] ==
                  'LICENSED';
              _showStatusGuide(
                context,
                title: 'App License',
                status: status,
                isSuccess: isSuccess,
                summary:
                    'Confirms that your Google account is licensed to use this application. Prevents unauthorized sideloading and ensures the app was legitimately acquired from the Play Store.',
                details: const [
                  'LICENSED: Google Play considers this installation valid for your account.',
                  'UNRECOGNIZED: The app/account combination is not considered licensed.',
                ],
              );
            },
          ),
          _StatusItem(
            label: 'Integrity Level',
            status:
                (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict']
                        as List?)
                    ?.join(', ') ??
                'NONE',
            isSuccess:
                (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict']
                        as List?)
                    ?.contains('MEETS_DEVICE_INTEGRITY') ??
                false,
            onInfoTap: () {
              final status =
                  (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict']
                          as List?)
                      ?.join(', ') ??
                  'NONE';
              final isSuccess =
                  (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict']
                          as List?)
                      ?.contains('MEETS_DEVICE_INTEGRITY') ??
                  false;
              _showStatusGuide(
                context,
                title: 'Integrity Level',
                status: status,
                isSuccess: isSuccess,
                error: _data!['playIntegrityError']?.toString(),
                summary:
                    'Hardware and software-backed verification of the device environment.',
                details: const [
                  'MEETS_BASIC_INTEGRITY: Device has a valid Android stack but may be rooted or have an unlocked bootloader.',
                  'MEETS_DEVICE_INTEGRITY: Device is a certified Android device that passes compatibility tests.',
                  'MEETS_STRONG_INTEGRITY: Highest security level. Requires hardware-backed attestation (TEE or Secure Element) to prove the OS is unmodified and the bootloader is locked.',
                ],
              );
            },
          ),
          _StatusItem(
            label: 'App Check',
            status: _data!['appCheck'] == true ? 'SECURE' : 'FAILED',
            isSuccess: _data!['appCheck'] == true,
            onInfoTap: () {
              final status = _data!['appCheck'] == true ? 'SECURE' : 'FAILED';
              final isSuccess = _data!['appCheck'] == true;
              _showStatusGuide(
                context,
                title: 'App Check',
                status: status,
                isSuccess: isSuccess,
                error: _data!['appCheckError']?.toString(),
                summary:
                    'Protects backend resources from scrapers, bots, and tampered app instances.',
                details: const [
                  'Uses Firebase App Check to generate a unique "proof of genuineness" for network requests.',
                  'Leverages the Play Integrity API on Android to attest to app identity and device state.',
                  'SECURE: Firebase accepted the attestation token for this specific app instance.',
                ],
              );
            },
          ),
          _StatusItem(
            label: 'Recognition',
            status:
                _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ??
                'UNKNOWN',
            isSuccess:
                _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ==
                'PLAY_RECOGNIZED',
            onInfoTap: () {
              final status =
                  _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ??
                  'UNKNOWN';
              final isSuccess =
                  _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ==
                  'PLAY_RECOGNIZED';
              _showStatusGuide(
                context,
                title: 'Recognition',
                status: status,
                isSuccess: isSuccess,
                summary:
                    'Verifies the application package name and signing identity against Google Play.',
                details: const [
                  'PLAY_RECOGNIZED: Google Play recognizes this build and its developer signature.',
                  'UNRECOGNIZED_VERSION: Build might be a debug version or one not yet indexed by Play.',
                  'UNEVALUATED: Play Integrity did not return a recognition verdict for this request.',
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          Text(
            'Last verified: ${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
            style: GoogleFonts.manrope(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusItem extends StatelessWidget {
  final String label;
  final String status;
  final bool isSuccess;
  final VoidCallback? onInfoTap;

  const _StatusItem({
    required this.label,
    required this.status,
    required this.isSuccess,
    this.onInfoTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ghostColors = theme.extension<GhostColors>();
    final color = isSuccess
        ? (ghostColors?.successGreen ?? Colors.green)
        : (ghostColors?.dangerRed ?? Colors.red);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onInfoTap,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: color.withValues(alpha: 0.15)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      status,
                      style: GoogleFonts.manrope(
                        fontSize: 10.2,
                        fontWeight: FontWeight.w900,
                        color: color,
                      ),
                    ),
                    if (onInfoTap != null) ...[
                      const SizedBox(width: 6),
                      Icon(LucideIcons.info, size: 12, color: color),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _PillButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.1),
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

  const _StatusBanner({
    required this.title,
    required this.subtitle,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          colors: [
            accent.withValues(alpha: 0.15),
            theme.colorScheme.surface.withValues(alpha: 0.95),
          ],
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
                decoration: BoxDecoration(
                  color: accent,
                  shape: BoxShape.circle,
                ),
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
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.accent,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
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

  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.08),
        ),
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

  const _ProofRow({
    required this.icon,
    required this.label,
    required this.value,
  });

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

  const _LinkRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
  });

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
              Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: theme.colorScheme.onSecondary,
              ),
            ],
          ),
        ),
      ),
    );
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
        boxShadow: [BoxShadow(color: color, blurRadius: 70, spreadRadius: 20)],
      ),
    );
  }
}
