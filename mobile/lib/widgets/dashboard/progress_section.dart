import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:google_fonts/google_fonts.dart';

class OverallProgressSection extends StatelessWidget {
  final DashboardStats stats;
  final double targetValue;

  const OverallProgressSection({
    super.key,
    required this.stats,
    required this.targetValue,
  });

  @override
  Widget build(BuildContext context) {
    final bool isBelowTarget = stats.rawPercentage < targetValue;
    final bool showChange = stats.rawOfficialPercentage != stats.rawPercentage;
    final bool isGain = stats.rawPercentage >= stats.rawOfficialPercentage;
    final double diffPercentage =
        (stats.rawPercentage - stats.rawOfficialPercentage).abs();

    final diffPresent = stats.finalPresent - stats.officialPresent;
    final diffTotal = stats.finalTotal - stats.officialTotal;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isBelowTarget
                  ? [
                      const Color(0xFFEF4444), // Red 500
                      const Color(0xFFB91C1C), // Red 700
                    ]
                  : [
                      const Color(0xFF0EA5E9), // Sky 500 (True Light Blue)
                      const Color(0xFF2563EB), // Blue 600
                    ],
            ),
            borderRadius: BorderRadius.circular(32),
            boxShadow: [
              BoxShadow(
                color: (isBelowTarget ? Colors.red : const Color(0xFF2563EB))
                    .withValues(alpha: 0.3),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              // Subtle background icon - now placed in the empty bottom-right space
              Positioned(
                right: -5,
                bottom: -35,
                child: Opacity(
                  opacity: 0.1,
                  child: Icon(
                    Icons.trending_up_rounded,
                    size:
                        110, // Sized to fit perfectly below the progress bar line
                    color: Colors.white,
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Total Attendance',
                            style: GoogleFonts.manrope(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Overall Standing',
                              style: GoogleFonts.manrope(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Colors.white.withValues(alpha: 0.9),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                children: [
                                  if (showChange) ...[
                                    Text(
                                      '${stats.rawOfficialPercentage.toStringAsFixed(2)}%',
                                      style: GoogleFonts.manrope(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white.withValues(alpha: 0.4),
                                        decoration: TextDecoration.lineThrough,
                                        decorationColor: Colors.white.withValues(
                                          alpha: 0.4,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                  ],
                                  Text(
                                    stats.rawPercentage.toStringAsFixed(2),
                                    style: GoogleFonts.manrope(
                                      fontSize: 36,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                    ),
                                  ),
                                  Text(
                                    '%',
                                    style: GoogleFonts.manrope(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white.withValues(alpha: 0.8),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Premium Progress Bar
                  Container(
                    height: 14,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final totalWidth = constraints.maxWidth;
                        final officialWidth =
                            totalWidth * (stats.rawOfficialPercentage / 100);
                        final currentWidth =
                            totalWidth * (stats.rawPercentage / 100);

                        return Stack(
                          children: [
                            // Base progress (Purple)
                            SizedBox(
                              width: (isGain ? officialWidth : currentWidth)
                                  .clamp(0.0, totalWidth),
                              child: Stack(
                                children: [
                                  Container(
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        colors: [
                                          Color(0xFFA855F7), // Purple 500
                                          Color(0xFF9333EA), // Purple 600
                                        ],
                                      ),
                                      borderRadius: const BorderRadius.horizontal(
                                        left: Radius.circular(9),
                                      ),
                                    ),
                                  ),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: Container(
                                      width: 1.5,
                                      height: 14,
                                      color: Colors.white.withValues(alpha: 0.25),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Diff highlight (Green for gain, Red for loss)
                            Positioned(
                              top: 0,
                              left:
                                  ((isGain ? officialWidth : currentWidth) -
                                          1.0)
                                      .clamp(0.0, totalWidth),
                              child: SizedBox(
                                width: (diffPercentage / 100 * totalWidth + 1.0)
                                    .clamp(
                                      0.0,
                                      totalWidth -
                                          (isGain
                                              ? officialWidth - 1.0
                                              : currentWidth - 1.0),
                                    ),
                                height: 14,
                                child: ClipRRect(
                                  borderRadius: const BorderRadius.horizontal(
                                    right: Radius.circular(9),
                                  ),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: isGain
                                          ? const Color(0xFF22C55E) // Green 500
                                          : const Color(0xFFB91C1C), // Deep Red 700
                                      borderRadius: const BorderRadius.horizontal(
                                        right: Radius.circular(9),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: 20),

                  Row(
                    children: [
                      _WhiteCountBadge(
                        value: stats.officialPresent,
                        label: 'Present',
                        diff: diffPresent,
                      ),
                      Container(
                        height: 20,
                        width: 1,
                        margin: const EdgeInsets.symmetric(horizontal: 16),
                        color: Colors.white.withValues(alpha: 0.2),
                      ),
                      _WhiteCountBadge(
                        value: stats.officialTotal,
                        label: 'Total',
                        diff: diffTotal,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WhiteCountBadge extends StatelessWidget {
  final int value;
  final String label;
  final int diff;

  const _WhiteCountBadge({
    required this.value,
    required this.label,
    required this.diff,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$value',
              style: GoogleFonts.manrope(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            if (diff != 0)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text(
                  '${diff > 0 ? "+" : ""}$diff',
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: diff > 0
                        ? const Color(0xFF4ADE80) // Vibrant Green
                        : Colors.white.withValues(alpha: 0.7),
                  ),
                ),
              ),
          ],
        ),
        Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}

