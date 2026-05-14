import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/about/about_widgets.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class AttestationSection extends ConsumerStatefulWidget {
  const AttestationSection({
    required this.onLaunch,
    required this.onCopy,
    super.key,
  });
  final Future<void> Function(String) onLaunch;
  final Future<void> Function(BuildContext, String, String) onCopy;

  @override
  ConsumerState<AttestationSection> createState() => _AttestationSectionState();
}

class _AttestationSectionState extends ConsumerState<AttestationSection> {
  bool _isLoading = false;
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final _ = _verify();
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
        if (mounted) {
          setState(() => _data = response.data as Map<String, dynamic>?);
        }
      } else {
        if (mounted) {
          setState(
            () => _error = 'Verification failed: ${response.statusCode}',
          );
        }
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      title: 'Live Attestation',
      subtitle:
          'Dynamic verification of the app instance against Google Play Integrity.',
      children: [
        const SizedBox(height: 8),
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
          Builder(
            builder: (context) {
              final details = _data!['details'] as Map<String, dynamic>? ?? {};
              final provider = details['provider']?.toString() ?? 'Unknown';
              final issuer = details['issuer']?.toString() ?? '';
              final isDebug = provider == 'debug' || issuer.contains('debug');
              final statusStr = _data!['verified'] == true
                  ? (isDebug ? 'DEBUG' : 'GENUINE')
                  : 'FAILED';

              return _StatusItem(
                label: 'Hardware Attestation',
                status: statusStr,
                isSuccess: _data!['verified'] == true,
                onInfoTap: () => _showStatusGuide(
                  context,
                  title: 'Hardware Attestation',
                  status: statusStr,
                  isSuccess: _data!['verified'] == true,
                  summary:
                      "Cloud-verified integrity check based on the project's security policy.",
                  technicalDetails: details,
                  details: [
                    'Enforces the integrity policy configured in the Firebase Console.',
                    'Validates build authenticity and protection against automated abuse.',
                    'GENUINE: Compliance with the developer-defined security threshold.',
                    'DEBUG: Verification using a development-only testing provider.',
                    'Note: Specific integrity levels (Basic vs Strong) are managed in the Cloud.',
                    'Attestation: $provider',
                    'Policy: Managed via Firebase Console',
                  ],
                ),
              );
            },
          ),
          _StatusItem(
            label: 'App Identity',
            status: _data!['appCheck'] == true ? 'OFFICIAL' : 'UNVERIFIED',
            isSuccess: _data!['appCheck'] == true,
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'App Identity',
              status: _data!['appCheck'] == true ? 'OFFICIAL' : 'UNVERIFIED',
              isSuccess: _data!['appCheck'] == true,
              summary:
                  'Cryptographic proof that this is an unmodified build of GhostClass.',
              technicalDetails: {'AppId': _data!['appId']},
              details: [
                'Verifies the application signature matches the official developer key.',
                'Ensures the app package has not been repackaged or "cloned".',
                'Application ID: ${_data!['appId']?.toString().split(':').last ?? 'Verified'}',
                if (_data!['appCheckError'] != null)
                  'Diagnostic: ${_data!['appCheckError']}',
              ],
            ),
          ),
          _StatusItem(
            label: 'Security Handshake',
            status: _data!['verified'] == true ? 'ESTABLISHED' : 'BLOCKED',
            isSuccess: _data!['verified'] == true,
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'Security Handshake',
              status: _data!['verified'] == true ? 'ESTABLISHED' : 'BLOCKED',
              isSuccess: _data!['verified'] == true,
              summary:
                  'Zero-Trust handshake between the app and GhostClass servers.',
              details: [
                'Every request is signed with a unique, non-replayable attestation token.',
                'The server rejects any traffic that lacks a valid hardware-attested proof.',
                if (_data!['action'] != null) 'Next Step: ${_data!['action']}',
                if (_data!['criticalRisk'] == true)
                  'Risk Level: CRITICAL - Access Restricted',
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(
                LucideIcons.shieldCheck,
                size: 10,
                color: theme.colorScheme.onSecondary,
              ),
              const SizedBox(width: 4),
              Text(
                'Last verified: ${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSecondary,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  void _showStatusGuide(
    BuildContext context, {
    required String title,
    required String summary,
    required List<String> details,
    required String status,
    required bool isSuccess,
    String? error,
    Map<String, dynamic>? technicalDetails,
  }) {
    final _ = showDialog<void>(
      context: context,
      builder: (context) {
        final theme = Theme.of(context);
        final ghostColors = theme.extension<GhostColors>();
        final accent = ghostColors?.brandPrimary ?? theme.colorScheme.primary;
        final statusColor = isSuccess
            ? (ghostColors?.successGreen ?? Colors.green)
            : (ghostColors?.dangerRed ?? Colors.red);

        return Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.manrope(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    summary,
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      color: theme.colorScheme.onSecondary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'Result: $status',
                      style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Error: $error',
                      style: TextStyle(
                        color: theme.colorScheme.error,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ...details.map(
                    (d) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 5),
                            child: Icon(
                              Icons.circle,
                              size: 6,
                              color: accent.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              d,
                              style: GoogleFonts.manrope(
                                fontSize: 12,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (technicalDetails != null &&
                      technicalDetails.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Technical Claims',
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest
                            .withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant,
                          width: 0.5,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: technicalDetails.entries
                            .map(
                              (e) => Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 2,
                                ),
                                child: Text(
                                  '${e.key}: ${e.value}',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 10,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _StatusItem extends StatelessWidget {
  const _StatusItem({
    required this.label,
    required this.status,
    required this.isSuccess,
    required this.onInfoTap,
  });
  final String label;
  final String status;
  final bool isSuccess;
  final VoidCallback onInfoTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ghostColors = theme.extension<GhostColors>();
    final color = isSuccess
        ? (ghostColors?.successGreen ?? Colors.green)
        : (ghostColors?.dangerRed ?? Colors.red);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
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
          InkWell(
            onTap: onInfoTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    status,
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(LucideIcons.info, size: 12, color: color),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
