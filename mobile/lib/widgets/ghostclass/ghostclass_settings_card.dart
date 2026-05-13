import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class GhostClassSettingsCard extends StatelessWidget {

  const GhostClassSettingsCard({
    required this.icon, required this.label, required this.value, required this.color, required this.onTap, super.key,
    this.isActive = true,
    this.isFullWidth = false,
    this.showToggle = false,
    this.toggleValue,
    this.onToggle,
    this.isDisabled = false,
  });
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final bool isActive;
  final VoidCallback onTap;
  final bool isFullWidth;
  final bool showToggle;
  final bool? toggleValue;
  final ValueChanged<bool>? onToggle;
  final bool isDisabled;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = Theme.of(context).scaffoldBackgroundColor;

    return Semantics(
      label: 'Settings Card: $label, Current Value: $value',
      button: true,
      onTap: isDisabled ? null : onTap,
      child: AbsorbPointer(
        absorbing: isDisabled,
        child: Opacity(
          opacity: isDisabled ? 0.5 : 1.0,
          child: GestureDetector(
            onTap: onTap,
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isActive ? color : surface,
                borderRadius: BorderRadius.circular(20),
                border: isDark && !isActive ? Border.all(
                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
                ) : null,
                boxShadow: isDark ? null : [
                  BoxShadow(
                    color: (isActive ? color : Colors.black).withValues(alpha: isActive ? 0.2 : 0.02),
                    blurRadius: 15,
                    offset: const Offset(0, 8),
                  )
                ],
              ),
              child: isFullWidth
                  ? Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: (isActive ? Colors.white : color).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(icon, size: 20, color: isActive ? Colors.white : color),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                label,
                                style: GoogleFonts.manrope(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                  color: isActive ? Colors.white.withValues(alpha: 0.6) : color,
                                  letterSpacing: 1.2,
                                ),
                              ),
                              Text(
                                value,
                                style: GoogleFonts.manrope(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w900,
                                  color: isActive ? Colors.white : Theme.of(context).colorScheme.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          size: 20,
                          color: isActive ? Colors.white.withValues(alpha: 0.5) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: (isActive ? Colors.white : color).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(icon, size: 18, color: isActive ? Colors.white : color),
                            ),
                            if (showToggle)
                              RotatedBox(
                                quarterTurns: 1, // Vertical toggle
                                child: SizedBox(
                                  width: 32,
                                  height: 20,
                                  child: Transform.scale(
                                    scale: 0.7,
                                    child: Switch.adaptive(
                                      value: toggleValue ?? false,
                                      onChanged: onToggle,
                                      activeThumbColor: Colors.white,
                                      activeTrackColor: Colors.white.withValues(alpha: 0.3),
                                      inactiveTrackColor: isDark 
                                          ? Colors.white.withValues(alpha: 0.05) 
                                          : Colors.black.withValues(alpha: 0.1),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              label,
                              style: GoogleFonts.manrope(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                color: isActive ? Colors.white.withValues(alpha: 0.6) : color,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              value,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.manrope(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: isActive ? Colors.white : Theme.of(context).colorScheme.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
