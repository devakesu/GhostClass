import 'package:flutter/material.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:google_fonts/google_fonts.dart';

class GhostClassVersionFooter extends StatelessWidget {
  const GhostClassVersionFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: const Column(
        children: [
          _VersionText(),
        ],
      ),
    );
  }
}

class _VersionText extends StatelessWidget {
  const _VersionText();

  @override
  Widget build(BuildContext context) {
    return Text(
      'GHOSTCLASS v${AppConfig.appVersion}',
      style: GoogleFonts.manrope(
        fontSize: 9,
        fontWeight: FontWeight.w900,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
        letterSpacing: 5,
      ),
    );
  }
}
