import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AttendanceDialogLabel extends StatelessWidget {
  const AttendanceDialogLabel({required this.text, super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 4),
      child: Text(
        text.toUpperCase(),
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}

class AttendanceStatusToggleButton extends StatelessWidget {
  const AttendanceStatusToggleButton({
    required this.value,
    required this.isSelected,
    required this.color,
    required this.onTap,
    super.key,
    this.label,
  });
  final String value;
  final String? label;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Semantics(
        button: true,
        label: label ?? value,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: isSelected
                  ? color.withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected
                    ? color
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.1),
                width: 1.5,
              ),
            ),
            child: Center(
              child: Text(
                label ?? value,
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: isSelected
                      ? color
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
