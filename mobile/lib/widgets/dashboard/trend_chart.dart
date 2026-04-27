import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:google_fonts/google_fonts.dart';

class TrendChartSection extends StatefulWidget {
  final DashboardStats stats;
  final double targetPercentage;

  const TrendChartSection({
    super.key,
    required this.stats,
    required this.targetPercentage,
  });

  @override
  State<TrendChartSection> createState() => _TrendChartSectionState();
}

class _TrendChartSectionState extends State<TrendChartSection> {
  OverlayEntry? _tooltipOverlay;
  final GlobalKey _chartKey = GlobalKey();
  List<CourseStat> _courses = [];

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
    final globalPos = box.localToGlobal(localPos);

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
    _courses = widget.stats.courseStats.values
        .where((s) => s.finalTotal > 0)
        .toList()
      ..sort((a, b) => a.percentage.compareTo(b.percentage));

    if (_courses.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final nonZero = _courses
        .expand((s) => [s.percentage, s.officialPercentage])
        .where((p) => p > 0)
        .toList();

    double minRef = widget.targetPercentage;
    if (nonZero.isNotEmpty) {
      final absMin = nonZero.reduce((a, b) => a < b ? a : b);
      minRef = absMin < widget.targetPercentage ? absMin : widget.targetPercentage;
    }

    final double yMin = (minRef / 5).floor() * 5.0 - 5.0;
    const double maxY = 100.0;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Container(
          height: 320,
          padding: const EdgeInsets.fromLTRB(12, 24, 20, 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 8, bottom: 20),
                child: Text(
                  'Attendance Overview',
                  style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w800),
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
                        getTooltipItem: (_, __, ___, ____) => null, // Disable built-in tooltip
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
                            if (index < 0 || index >= _courses.length) return const SizedBox.shrink();
                            final code = _courses[index].code;
                            final display = code.length > 10 ? '${code.substring(0, 8)}..' : code;
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
                                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
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
                                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                              ),
                            ),
                          ),
                        ),
                      ),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    ),
                    gridData: FlGridData(
                      show: true,
                      drawVerticalLine: false,
                      horizontalInterval: 5,
                      getDrawingHorizontalLine: (_) => FlLine(
                        color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.2),
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
                      final baseVal = s.percentage < s.officialPercentage ? s.percentage : s.officialPercentage;
                      final extraVal = (s.percentage - s.officialPercentage).abs();
                      final totalVal = baseVal + extraVal;
                      final Color color = isSafe ? const Color(0xFF10B981) : const Color(0xFFEF4444);
                      final double split = totalVal > 0 ? baseVal / totalVal : 1.0;

                      final colors = <Color>[];
                      final stops = <double>[];
                      colors.add(color); stops.add(0.0);
                      colors.add(color); stops.add(split);

                      if (extraVal > 0) {
                        const int n = 30;
                        final double seg = (1.0 - split) / n;
                        for (int j = 0; j < n; j++) {
                          final s0 = split + j * seg;
                          final mid = s0 + seg * 0.5;
                          final s1 = split + (j + 1) * seg;
                          colors.add(color.withValues(alpha: 0.6)); stops.add(s0);
                          colors.add(color.withValues(alpha: 0.6)); stops.add(mid);
                          colors.add(color.withValues(alpha: 0.1)); stops.add(mid);
                          colors.add(color.withValues(alpha: 0.1)); stops.add(s1);
                        }
                      }

                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: totalVal,
                            width: 18,
                            borderRadius: BorderRadius.vertical(top: Radius.circular(extraVal > 0 ? 1 : 4)),
                            gradient: LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: colors,
                              stops: stops,
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
    final screen = MediaQuery.of(context).size;
    // Appear above the touch point
    final double left = (touchGlobal.dx - w / 2).clamp(8.0, screen.width - w - 8);
    final double bottomFromScreen = screen.height - touchGlobal.dy + 16;

    return Positioned(
      left: left,
      bottom: bottomFromScreen,
      child: IgnorePointer(
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: w,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
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
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                    fontWeight: FontWeight.w500,
                    fontSize: 11,
                  ),
                ),
                Text(
                  'Adjusted: ${stat.percentage.toStringAsFixed(2)}% (${stat.finalPresent}/${stat.finalTotal})',
                  style: GoogleFonts.manrope(
                    color: stat.percentage >= targetPercentage ? Colors.green : Colors.red,
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
