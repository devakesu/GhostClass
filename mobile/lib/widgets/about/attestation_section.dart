import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'about_widgets.dart';

class AttestationSection extends ConsumerStatefulWidget {
  final Future<void> Function(String) onLaunch;
  final Future<void> Function(BuildContext, String, String) onCopy;

  const AttestationSection({
    super.key,
    required this.onLaunch,
    required this.onCopy,
  });

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
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'App License',
              status: _data!['details']?['accountIntegrity']?['appLicensingVerdict'] == 'LICENSED' ? 'VERIFIED' : 'UNRECOGNIZED',
              isSuccess: _data!['details']?['accountIntegrity']?['appLicensingVerdict'] == 'LICENSED',
              summary: 'Confirms that your Google account is licensed to use this application.',
              details: const [
                'LICENSED: Google Play considers this installation valid for your account.',
                'UNRECOGNIZED: The app/account combination is not considered licensed.',
              ],
            ),
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
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'Integrity Level',
              status: (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict'] as List?)?.join(', ') ?? 'NONE',
              isSuccess: (_data!['details']?['deviceIntegrity']?['deviceRecognitionVerdict'] as List?)?.contains('MEETS_DEVICE_INTEGRITY') ?? false,
              error: _data!['playIntegrityError']?.toString(),
              summary: 'Hardware and software-backed verification of the device environment.',
                details: const [
                  'NONE: Device does not meet integrity standards (root, emulator, or unlocked bootloader).',
                  'MEETS_BASIC_INTEGRITY: Device has a valid Android stack.',
                  'MEETS_DEVICE_INTEGRITY: Device is a certified Android device.',
                  'MEETS_STRONG_INTEGRITY: Highest security level with hardware-backed attestation.',
                ],
            ),
          ),
          _StatusItem(
            label: 'App Check',
            status: _data!['appCheck'] == true ? 'SECURE' : 'FAILED',
            isSuccess: _data!['appCheck'] == true,
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'App Check',
              status: _data!['appCheck'] == true ? 'SECURE' : 'FAILED',
              isSuccess: _data!['appCheck'] == true,
              error: _data!['appCheckError']?.toString(),
              summary: 'Protects backend resources from scrapers, bots, and tampered instances.',
              details: const [
                'Uses Firebase App Check to generate a unique "proof of genuineness".',
                'SECURE: Firebase accepted the attestation token.',
              ],
            ),
          ),
          _StatusItem(
            label: 'Recognition',
            status:
                _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ??
                'UNKNOWN',
            isSuccess:
                _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ==
                'PLAY_RECOGNIZED',
            onInfoTap: () => _showStatusGuide(
              context,
              title: 'Recognition',
              status: _data!['details']?['appIntegrity']?['appRecognitionVerdict'] ?? 'UNKNOWN',
              isSuccess: _data!['details']?['appIntegrity']?['appRecognitionVerdict'] == 'PLAY_RECOGNIZED',
              summary: 'Verifies the application package name and signing identity against Google Play.',
              details: const [
                'PLAY_RECOGNIZED: Google Play recognizes this build and its developer signature.',
                'UNRECOGNIZED_VERSION: Build might be a debug version or one not yet indexed by Play.',
                'UNEVALUATED: Play Integrity did not return a recognition verdict for this request.',
              ],
            ),
          ),
          const SizedBox(height: 4),
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

  void _showStatusGuide(
    BuildContext context, {
    required String title,
    required String summary,
    required List<String> details,
    required String status,
    required bool isSuccess,
    String? error,
  }) {
    showDialog<void>(
      context: context,
      builder: (context) {
        final theme = Theme.of(context);
        final ghostColors = theme.extension<GhostColors>();
        final accent = ghostColors?.brandPrimary ?? theme.colorScheme.primary;
        final statusColor = isSuccess
            ? (ghostColors?.successGreen ?? Colors.green)
            : (ghostColors?.dangerRed ?? Colors.red);

        return Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(summary, style: GoogleFonts.manrope(fontSize: 13, color: theme.colorScheme.onSecondary)),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('Result: $status', style: TextStyle(color: statusColor, fontWeight: FontWeight.bold)),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text('Error: $error', style: TextStyle(color: theme.colorScheme.error, fontSize: 12)),
                ],
                const SizedBox(height: 16),
                ...details.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 5),
                        child: Icon(Icons.circle, size: 6, color: accent.withValues(alpha: 0.5)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(d, style: GoogleFonts.manrope(fontSize: 12, height: 1.4))),
                    ],
                  ),
                )),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StatusItem extends StatelessWidget {
  final String label;
  final String status;
  final bool isSuccess;
  final VoidCallback onInfoTap;

  const _StatusItem({
    required this.label,
    required this.status,
    required this.isSuccess,
    required this.onInfoTap,
  });

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
