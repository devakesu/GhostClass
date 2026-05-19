import 'package:flutter/material.dart';

class IconBadge extends StatelessWidget {
  const IconBadge({
    required this.icon,
    required this.color,
    super.key,
    this.size = 20,
    this.padding = const EdgeInsets.all(10),
    this.radius = 14.0,
    this.bgAlpha = 0.1,
    this.borderColor,
  });

  final IconData icon;
  final Color color;
  final double size;
  final EdgeInsets padding;
  final double radius;
  final double bgAlpha;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withValues(alpha: bgAlpha),
        borderRadius: BorderRadius.circular(radius),
        border: borderColor != null ? Border.all(color: borderColor!) : null,
      ),
      child: Icon(icon, size: size, color: color),
    );
  }
}
