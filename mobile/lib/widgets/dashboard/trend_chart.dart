import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';

class TrendChartSection extends StatefulWidget {
  const TrendChartSection({
    required this.stats,
    required this.targetPercentage,
    super.key,
    this.disabledCodes = const {},
    this.courseTargets = const <String, int>{},
  });
  final DashboardStats stats;
  final double targetPercentage;
  final Set<String> disabledCodes;
  final Map<String, int> courseTargets;

  @override
  State<TrendChartSection> createState() => _TrendChartSectionState();
}

class _TrendChartSectionState extends State<TrendChartSection> {
  final GlobalKey _chartKey = GlobalKey();
  List<CourseStat> _courses = [];
  int _touchedIndex = -1;
  Offset? _touchedOffset;

  double _calculateYMin() {
    final nonZero = _courses
        .expand((s) => [s.percentage, s.officialPercentage])
        .where((p) => p > 0)
        .toList();

    var minRef = widget.targetPercentage;
    if (nonZero.isNotEmpty) {
      final absMin = nonZero.reduce((a, b) => a < b ? a : b);
      minRef = absMin < widget.targetPercentage
          ? absMin
          : widget.targetPercentage;
    }

    // Also account for any custom course-target lines so they are always visible
    for (final v in widget.courseTargets.values) {
      if (v < minRef) minRef = v.toDouble();
    }

    return ((minRef / 5).floor() * 5.0 - 5.0).clamp(0, 95);
  }

  void _hideTooltip() {
    if (_touchedIndex != -1) {
      setState(() => _touchedIndex = -1);
    }
  }

  void _onTouch(FlTouchEvent event, BarTouchResponse? response) {
    if (event is FlTapUpEvent ||
        event is FlPointerExitEvent ||
        event is FlLongPressEnd ||
        event is FlPanEndEvent) {
      _hideTooltip();
      return;
    }

    final spot = response?.spot;
    if (spot == null) {
      _hideTooltip();
      return;
    }

    final idx = spot.touchedBarGroupIndex;
    if (idx < 0 || idx >= _courses.length) return;

    final box = _chartKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    // Calculate fixed vertical position at the top of the bar
    final yMinVal = _calculateYMin();
    const maxYVal = 100;
    final chartSize = box.size;
    const bottomReserved = 80;
    final dataAreaHeight = chartSize.height - bottomReserved;

    final barValue = spot.touchedRodData.toY;
    final barHeightRatio = (barValue - yMinVal) / (maxYVal - yMinVal);
    final barPixelHeight = barHeightRatio * dataAreaHeight;
    final localBarTopY = chartSize.height - bottomReserved - barPixelHeight;

    setState(() {
      _touchedIndex = idx;
      // We want the X to be the center of the bar
      _touchedOffset = Offset(spot.offset.dx, localBarTopY);
    });
  }

  @override
  void initState() {
    super.initState();
    _updateCourses();
  }

  @override
  void didUpdateWidget(TrendChartSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stats != widget.stats ||
        oldWidget.disabledCodes != widget.disabledCodes ||
        oldWidget.courseTargets != widget.courseTargets) {
      _updateCourses();
    }
  }

  void _updateCourses() {
    _courses = widget.stats.courseStats.values.where((s) {
      final isTracked = s.finalTotal > 0;
      final isDisabled = widget.disabledCodes.contains(s.code);
      return isTracked && !isDisabled;
    }).toList()..sort((a, b) => a.percentage.compareTo(b.percentage));
  }

  @override
  Widget build(BuildContext context) {
    if (_courses.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final yMin = _calculateYMin();
    const maxY = 100.0;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Container(
          height: 320,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Theme.of(
                context,
              ).colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 20, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(left: 8, bottom: 28),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Attendance Overview',
                              style: GoogleFonts.manrope(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              "See where you've been keeping up!",
                              style: GoogleFonts.manrope(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.4),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: BarChart(
                          key: _chartKey,
                          duration: Duration
                              .zero, // Prevent blinking on state changes
                          BarChartData(
                            alignment: BarChartAlignment.spaceAround,
                            maxY: maxY,
                            minY: yMin.clamp(0, 95),
                            barTouchData: BarTouchData(
                              enabled: true,
                              touchTooltipData: BarTouchTooltipData(
                                getTooltipItem: (_, _, _, _) =>
                                    null, // Disable built-in tooltip
                                getTooltipColor: (_) => Colors.transparent,
                              ),
                              touchCallback: _onTouch,
                            ),
                            titlesData: FlTitlesData(
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  reservedSize: 80,
                                  getTitlesWidget: (value, meta) {
                                    final index = value.toInt();
                                    if (index < 0 || index >= _courses.length) {
                                      return const SizedBox.shrink();
                                    }
                                    final code = _courses[index].code;
                                    final display = code.length > 10
                                        ? '${code.substring(0, 8)}..'
                                        : code;
                                    return SideTitleWidget(
                                      meta: meta,
                                      space: 12,
                                      child: RotatedBox(
                                        quarterTurns: 3,
                                        child: Text(
                                          display,
                                          style: GoogleFonts.manrope(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .onSurface
                                                .withValues(alpha: 0.75),
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              leftTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  reservedSize: 32,
                                  interval: 5,
                                  getTitlesWidget: (value, meta) =>
                                      SideTitleWidget(
                                        meta: meta,
                                        space: 4,
                                        child: Text(
                                          '${value.toInt()}',
                                          style: GoogleFonts.manrope(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w600,
                                            color:
                                                Theme.of(
                                                      context,
                                                    ).colorScheme.onSurface
                                                    .withValues(alpha: 0.8),
                                          ),
                                        ),
                                      ),
                                ),
                              ),
                              topTitles: const AxisTitles(),
                              rightTitles: const AxisTitles(),
                            ),
                            gridData: FlGridData(
                              drawVerticalLine: false,
                              horizontalInterval: 5,
                              getDrawingHorizontalLine: (_) => FlLine(
                                color:
                                    Theme.of(
                                      context,
                                    ).colorScheme.outlineVariant.withValues(
                                      alpha: 0.2,
                                    ),
                                strokeWidth: 1,
                              ),
                            ),
                            borderData: FlBorderData(show: false),
                            extraLinesData: ExtraLinesData(
                              horizontalLines: [
                                // Global target line (amber)
                                HorizontalLine(
                                  y: widget.targetPercentage,
                                  color: Colors.amber.shade700,
                                  dashArray: [5, 5],
                                  label: HorizontalLineLabel(
                                    show: true,
                                    alignment: Alignment.centerRight,
                                    padding: const EdgeInsets.only(right: 40),
                                    style: GoogleFonts.manrope(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                      background: Paint()
                                        ..color = Colors.amber.shade700
                                        ..strokeWidth = 30
                                        ..strokeCap = StrokeCap.round
                                        ..style = PaintingStyle.fill,
                                    ),
                                    labelResolver: (line) =>
                                        '\u00A0\u00A0\u00A0\u00A0Target: ${widget.targetPercentage.toInt()}%\u00A0\u00A0\u00A0\u00A0',
                                  ),
                                ),
                              ],
                            ),
                            barGroups: _courses.asMap().entries.map((entry) {
                              final i = entry.key;
                              final s = entry.value;
                              final stdCode = DashboardStats.standardize(
                                s.code,
                              );
                              final targetVal =
                                  widget.courseTargets[stdCode] ??
                                  widget.courseTargets[s.code] ??
                                  widget.courseTargets[s.id];
                              final effectiveTarget =
                                  (targetVal ?? widget.targetPercentage)
                                      .toDouble();
                              final isSafe = s.percentage >= effectiveTarget;
                              final isLoss =
                                  s.percentage < s.officialPercentage;
                              final displayedBase = isLoss
                                  ? s.percentage
                                  : s.officialPercentage;
                              final displayedExtra =
                                  (s.percentage - s.officialPercentage).abs();
                              final totalVal = displayedBase + displayedExtra;

                              final ghostColors = Theme.of(
                                context,
                              ).extension<GhostColors>();

                              final baseColor = isSafe
                                  ? (ghostColors?.successGreen ??
                                        const Color(0xFF10B981))
                                  : (ghostColors?.dangerRed ??
                                        const Color(0xFFEF4444));

                              final extraIsDanger = isLoss || !isSafe;
                              final extraColor = extraIsDanger
                                  ? (ghostColors?.dangerRed ??
                                        const Color(0xFFEF4444))
                                  : (ghostColors?.successGreen ??
                                        const Color(0xFF10B981));

                              final brightLine = extraColor.withValues(
                                alpha: 0.75,
                              );
                              final faintGap = extraColor.withValues(
                                alpha: 0.15,
                              );

                              // Pre-calculate stops to avoid recreating them in the loop
                              final hatchColors = <Color>[];
                              final hatchStops = <double>[];
                              const n = 16; // Optimized frequency
                              for (var j = 0; j < n; j++) {
                                final s0 = j / n;
                                final mid = (j + 0.25) / n;
                                final s1 = (j + 1) / n;
                                hatchColors.addAll([
                                  brightLine,
                                  brightLine,
                                  faintGap,
                                  faintGap,
                                ]);
                                hatchStops.addAll([s0, mid, mid, s1]);
                              }

                              // Whether this bar has a custom target distinct from the global one
                              final hasCustomTarget =
                                  targetVal != null &&
                                  effectiveTarget != widget.targetPercentage;

                              // Height of the purple target band in data-units (~0.4 percentage unit)
                              const targetBandHalf = 0.2;
                              final targetBandBottom =
                                  (effectiveTarget - targetBandHalf).clamp(
                                    0.0,
                                    double.infinity,
                                  );
                              final targetBandTop =
                                  effectiveTarget + targetBandHalf;

                              // Extend the rod to reach the target band when it's above the bar
                              final rodToY = hasCustomTarget
                                  ? math.max(totalVal, targetBandTop)
                                  : totalVal;

                              return BarChartGroupData(
                                x: i,
                                barRods: [
                                  BarChartRodData(
                                    toY: rodToY,
                                    width: 18,
                                    color: Colors.transparent,
                                    borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(3),
                                      bottom: Radius.circular(1),
                                    ),
                                    rodStackItems: [
                                      BarChartRodStackItem(
                                        0,
                                        displayedBase,
                                        baseColor,
                                      ),
                                      if (hasCustomTarget)
                                        BarChartRodStackItem(
                                          targetBandBottom,
                                          targetBandTop,
                                          Colors.amber.shade700,
                                        ),
                                    ],
                                    backDrawRodData: BackgroundBarChartRodData(
                                      show: totalVal > 0,
                                      toY: totalVal,
                                      gradient: LinearGradient(
                                        begin: Alignment.bottomLeft,
                                        end: Alignment.topRight,
                                        colors: hatchColors,
                                        stops: hatchStops,
                                      ),
                                    ),
                                  ),
                                ],
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_touchedIndex != -1 && _touchedOffset != null)
                  _LocalChartTooltip(
                    stat: _courses[_touchedIndex],
                    targetPercentage: () {
                      final s = _courses[_touchedIndex];
                      final stdCode = DashboardStats.standardize(s.code);
                      final targetVal =
                          widget.courseTargets[stdCode] ??
                          widget.courseTargets[s.code] ??
                          widget.courseTargets[s.id];
                      return (targetVal ?? widget.targetPercentage).toDouble();
                    }(),
                    chartOffset: _touchedOffset!,
                    // Offset of chart inside the card (padding is 12, 12, 20, 12)
                    chartOriginInCard: const Offset(12, 12),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LocalChartTooltip extends StatelessWidget {
  const _LocalChartTooltip({
    required this.stat,
    required this.targetPercentage,
    required this.chartOffset,
    required this.chartOriginInCard,
  });
  final CourseStat stat;
  final double targetPercentage;
  final Offset chartOffset;
  final Offset chartOriginInCard;

  @override
  Widget build(BuildContext context) {
    const double w = 220;
    const double h = 85;

    // The touch position in card coordinates
    final centerX = chartOriginInCard.dx + chartOffset.dx;
    final barTopY = chartOriginInCard.dy + chartOffset.dy;

    // Card constraints: 320 height, width is screen.width - 40
    final screenWidth = MediaQuery.of(context).size.width;
    final cardWidth = screenWidth - 40;
    const cardHeight = 320.0;

    // Horizontal positioning clamped inside the card
    final left = (centerX - w / 2).clamp(8.0, cardWidth - w - 8);

    // Vertical positioning: Prefer above the bar top
    var top = barTopY - h - 12;
    if (top < 8) {
      // Flip below if not enough space at top of card
      top = barTopY + 12;
    }
    // Final vertical clamp to stay inside card
    top = top.clamp(8.0, cardHeight - h - 8);

    final ghostColors = Theme.of(context).extension<GhostColors>();
    final successColor = ghostColors?.successGreen ?? const Color(0xFF10B981);
    final dangerColor = ghostColors?.dangerRed ?? const Color(0xFFEF4444);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tooltipBg = isDark
        ? Colors.white
        : Theme.of(context).colorScheme.surfaceContainerHigh;
    final onTooltipSurface = isDark
        ? const Color(0xFF1A1A2E)
        : Theme.of(context).colorScheme.onSurface;

    return Positioned(
      left: left,
      top: top,
      child: IgnorePointer(
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: w,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: tooltipBg,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  stat.name.isNotEmpty ? stat.name : stat.code,
                  maxLines: 2,
                  overflow: TextOverflow.visible,
                  style: GoogleFonts.manrope(
                    color: onTooltipSurface,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: 'Official: ',
                        style: TextStyle(color: onTooltipSurface),
                      ),
                      TextSpan(
                        text: '${stat.officialPercentage.toStringAsFixed(2)}%',
                        style: TextStyle(
                          color: stat.officialPercentage >= targetPercentage
                              ? successColor
                              : dangerColor,
                        ),
                      ),
                      TextSpan(
                        text:
                            ' (${stat.officialPresent}/${stat.officialTotal})',
                        style: TextStyle(color: onTooltipSurface),
                      ),
                    ],
                  ),
                  style: GoogleFonts.manrope(
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
                if ((stat.percentage - stat.officialPercentage).abs() > 0.01 ||
                    stat.finalTotal != stat.officialTotal) ...[
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'Adjusted (',
                          style: TextStyle(color: onTooltipSurface),
                        ),
                        TextSpan(
                          text: stat.percentage > stat.officialPercentage + 0.01
                              ? 'Gain'
                              : (stat.percentage <
                                        stat.officialPercentage - 0.01
                                    ? 'Loss'
                                    : 'Neutral'),
                          style: TextStyle(
                            color:
                                stat.percentage > stat.officialPercentage + 0.01
                                ? successColor
                                : (stat.percentage <
                                          stat.officialPercentage - 0.01
                                      ? dangerColor
                                      : onTooltipSurface),
                          ),
                        ),
                        TextSpan(
                          text: '): ',
                          style: TextStyle(color: onTooltipSurface),
                        ),
                        TextSpan(
                          text: '${stat.percentage.toStringAsFixed(2)}%',
                          style: TextStyle(
                            color: stat.percentage >= targetPercentage
                                ? successColor
                                : dangerColor,
                          ),
                        ),
                        TextSpan(
                          text: ' (${stat.finalPresent}/${stat.finalTotal})',
                          style: TextStyle(color: onTooltipSurface),
                        ),
                      ],
                    ),
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      fontSize: 11,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
