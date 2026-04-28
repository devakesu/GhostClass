import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';

class TrendChartSection extends StatefulWidget {
  final DashboardStats stats;
  final double targetPercentage;
  final Set<String> disabledCodes;

  const TrendChartSection({
    super.key,
    required this.stats,
    required this.targetPercentage,
    this.disabledCodes = const {},
  });

  @override
  State<TrendChartSection> createState() => _TrendChartSectionState();
}

class _TrendChartSectionState extends State<TrendChartSection> {
  OverlayEntry? _tooltipOverlay;
  final GlobalKey _chartKey = GlobalKey();
  List<CourseStat> _courses = [];

  double _calculateYMin() {
    final nonZero = _courses
        .expand((s) => [s.percentage, s.officialPercentage])
        .where((p) => p > 0)
        .toList();

    double minRef = widget.targetPercentage;
    if (nonZero.isNotEmpty) {
      final absMin = nonZero.reduce((a, b) => a < b ? a : b);
      minRef = absMin < widget.targetPercentage
          ? absMin
          : widget.targetPercentage;
    }

    return ((minRef / 5).floor() * 5.0 - 5.0).clamp(0, 95);
  }

  @override
  void dispose() {
    _hideTooltip();
    super.dispose();
  }

  void _hideTooltip() {
    _tooltipOverlay?.remove();
    _tooltipOverlay = null;
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
    final stat = _courses[idx];

    Offset? localPos;
    if (event is FlPanStartEvent) localPos = event.localPosition;
    if (event is FlPanUpdateEvent) localPos = event.localPosition;
    if (event is FlTapDownEvent) localPos = event.localPosition;
    if (event is FlLongPressStart) localPos = event.localPosition;
    if (event is FlLongPressMoveUpdate) localPos = event.localPosition;

    if (localPos == null) return;

    final box = _chartKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    // Calculate fixed vertical position at the top of the bar
    final yMinVal = _calculateYMin();
    const double maxYVal = 100.0;
    final chartSize = box.size;
    const bottomReserved =
        80.0; // Based on titlesData.bottomTitles.reservedSize
    final dataAreaHeight = chartSize.height - bottomReserved;

    final barValue = spot.touchedRodData.toY;
    final barHeightRatio = (barValue - yMinVal) / (maxYVal - yMinVal);
    final barPixelHeight = barHeightRatio * dataAreaHeight;
    final localBarTopY = chartSize.height - bottomReserved - barPixelHeight;

    final globalPos = box.localToGlobal(Offset(localPos.dx, localBarTopY));

    _hideTooltip();
    _tooltipOverlay = OverlayEntry(
      builder: (_) => _ChartTooltip(
        stat: stat,
        targetPercentage: widget.targetPercentage,
        touchGlobal: globalPos,
      ),
    );
    Overlay.of(context).insert(_tooltipOverlay!);
  }

  @override
  Widget build(BuildContext context) {
    _courses =
        widget.stats.courseStats.values.where((s) {
          final isTracked = s.finalTotal > 0;
          final isDisabled = widget.disabledCodes.contains(s.code);
          return isTracked && !isDisabled;
        }).toList()
          ..sort((a, b) => a.percentage.compareTo(b.percentage));

    if (_courses.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final double yMin = _calculateYMin();
    const double maxY = 100.0;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Container(
          height: 320,
          padding: const EdgeInsets.fromLTRB(12, 12, 20, 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Theme.of(
                context,
              ).colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
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
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.4),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: BarChart(
                  key: _chartKey,
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
                      show: true,
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
                                        .withValues(alpha: 0.6),
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
                          getTitlesWidget: (value, meta) => SideTitleWidget(
                            meta: meta,
                            space: 4,
                            child: Text(
                              '${value.toInt()}',
                              style: GoogleFonts.manrope(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.7),
                              ),
                            ),
                          ),
                        ),
                      ),
                      topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                    ),
                    gridData: FlGridData(
                      show: true,
                      drawVerticalLine: false,
                      horizontalInterval: 5,
                      getDrawingHorizontalLine: (_) => FlLine(
                        color: Theme.of(
                          context,
                        ).colorScheme.outlineVariant.withValues(alpha: 0.2),
                        strokeWidth: 1,
                      ),
                    ),
                    borderData: FlBorderData(show: false),
                    extraLinesData: ExtraLinesData(
                      horizontalLines: [
                        HorizontalLine(
                          y: widget.targetPercentage,
                          color: Colors.amber.shade700,
                          strokeWidth: 2,
                          dashArray: [5, 5],
                          label: HorizontalLineLabel(
                            show: true,
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 4),
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
                      final isSafe = s.percentage >= widget.targetPercentage;
                      final baseVal = s.percentage < s.officialPercentage
                          ? s.percentage
                          : s.officialPercentage;
                      final extraVal = (s.percentage - s.officialPercentage)
                          .abs();
                      final totalVal = baseVal + extraVal;
                      final ghostColors = Theme.of(
                        context,
                      ).extension<GhostColors>();
                      final Color color = isSafe
                          ? (ghostColors?.successGreen ??
                                const Color(0xFF10B981))
                          : (ghostColors?.dangerRed ?? const Color(0xFFEF4444));
                      final double split = totalVal > 0
                          ? baseVal / totalVal
                          : 1.0;

                      final colors = <Color>[];
                      final stops = <double>[];
                      colors.add(color);
                      stops.add(0.0);
                      colors.add(color);
                      stops.add(split);

                      final bool isDark = Theme.of(context).brightness == Brightness.dark;
                      // Keep the base color but make it stand out slightly
                      final Color brightLine = Color.lerp(color, Colors.white, isDark ? 0.15 : 0.05)!;
                      final Color faintGap = color.withValues(alpha: isDark ? 0.1 : 0.2);
                      
                      final List<Color> hatchColors = [faintGap, faintGap];
                      final List<double> hatchStops = [0.0, 1.0];
                      
                      if (extraVal > 0) {
                        // Moderate frequency for better distinctness
                        final int n = 24; 
                        for (int j = 0; j < n; j++) {
                          final double s0 = j / n;
                          final double mid = (j + 0.5) / n;
                          final double s1 = (j + 1) / n;
                          hatchColors.add(brightLine);
                          hatchStops.add(s0);
                          hatchColors.add(brightLine);
                          hatchStops.add(mid);
                          hatchColors.add(faintGap);
                          hatchStops.add(mid);
                          hatchColors.add(faintGap);
                          hatchStops.add(s1);
                        }
                      }

                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: baseVal,
                            width: 18,
                            color: color,
                            borderRadius: BorderRadius.vertical(
                              top: Radius.circular(extraVal > 0 ? 0 : 3),
                              bottom: const Radius.circular(1),
                            ),
                            backDrawRodData: BackgroundBarChartRodData(
                              show: extraVal > 0,
                              toY: totalVal,
                              gradient: LinearGradient(
                                begin: Alignment.bottomLeft,
                                end: Alignment.topRight,
                                colors: hatchColors,
                                stops: hatchStops,
                                tileMode: TileMode.repeated,
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
      ),
    );
  }
}

class _ChartTooltip extends StatelessWidget {
  final CourseStat stat;
  final double targetPercentage;
  final Offset touchGlobal;

  const _ChartTooltip({
    required this.stat,
    required this.targetPercentage,
    required this.touchGlobal,
  });

  @override
  Widget build(BuildContext context) {
    const double w = 220;
    const double h = 85; // Estimated height for safety
    final screen = MediaQuery.of(context).size;
    final double safeTop = MediaQuery.of(context).padding.top + 60; // Margin for header

    // Calculate ideal horizontal position
    final double left = (touchGlobal.dx - w / 2).clamp(
      8.0,
      screen.width - w - 8,
    );

    // Dynamic vertical positioning: flip below if no space at top
    double top = touchGlobal.dy - h - 12;
    if (top < safeTop) {
      // Flip below the bar top
      top = touchGlobal.dy + 12;
    }

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
              color: Theme.of(context).colorScheme.surfaceContainerHigh,
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
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Official: ${stat.officialPercentage.toStringAsFixed(2)}% (${stat.officialPresent}/${stat.officialTotal})',
                  style: GoogleFonts.manrope(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.8),
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
                if ((stat.percentage - stat.officialPercentage).abs() > 0.01 ||
                    stat.finalTotal != stat.officialTotal)
                  Text(
                    'Adjusted: ${stat.percentage.toStringAsFixed(2)}% (${stat.finalPresent}/${stat.finalTotal})',
                    style: GoogleFonts.manrope(
                      color: stat.percentage >= targetPercentage
                          ? Colors.green
                          : Colors.red,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
