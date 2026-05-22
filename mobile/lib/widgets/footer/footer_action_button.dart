import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FooterActionButton extends StatelessWidget {
  const FooterActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    super.key,
    this.uppercase = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
    this.borderRadius = 14.0,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool uppercase;
  final EdgeInsets padding;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(borderRadius),
      child: Container(
        padding: padding,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(borderRadius),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 10),
            Text(
              uppercase ? label.toUpperCase() : label,
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
