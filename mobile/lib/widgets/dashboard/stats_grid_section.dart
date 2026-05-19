import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/widgets/common/icon_badge.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class StatsGridSection extends StatelessWidget {
  const StatsGridSection({
    required this.stats,
    required this.activeCount,
    super.key,
  });
  final DashboardStats stats;
  final int activeCount;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // 2x2 Grid for Attendance Stats
          GridView.count(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.8,
            children: [
              _StatCard(
                title: 'Present (+DL)',
                value: stats.officialPresent,
                icon: LucideIcons.checkCircle,
                color: Colors.green,
                corrections: [
                  if (stats.corrPresent > 0)
                    _Correction(
                      value: stats.corrPresent,
                      color: const Color(0xFFF97316),
                    ),
                  if (stats.extraPresent > 0)
                    _Correction(value: stats.extraPresent, color: Colors.blue),
                ],
              ),
              _StatCard(
                title: 'Absent',
                value: stats.officialAbsent,
                icon: LucideIcons.xCircle,
                color: Colors.red,
                corrections: [
                  if (stats.savedAbsent > 0)
                    _Correction(
                      value: stats.savedAbsent,
                      color: const Color(0xFFF97316),
                      isNegative: true,
                    ),
                  if (stats.extraAbsent > 0)
                    _Correction(value: stats.extraAbsent, color: Colors.blue),
                ],
              ),
              _StatCard(
                title: 'Duty Leave(s)',
                value: stats.officialDL,
                icon: LucideIcons.calendarCheck,
                color: Colors.amber,
                corrections: [
                  if (stats.corrDL > 0)
                    _Correction(
                      value: stats.corrDL,
                      color: const Color(0xFFF97316),
                    ),
                  if (stats.extraDL > 0)
                    _Correction(value: stats.extraDL, color: Colors.blue),
                ],
              ),
              _StatCard(
                title: 'Special Leave(s)',
                value: stats.specialLeaveCount,
                icon: LucideIcons.star,
                color: Colors.teal,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Full Width Active Courses Card
          _StatCard(
            title: 'Active Courses',
            value: stats.activeCourses,
            subtitle: '/ ${stats.totalCoursesCount}',
            icon: LucideIcons.bookOpen,
            color: Theme.of(context).colorScheme.primary,
            isFullWidth: true,
          ),
        ]),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.title,
    required this.value,
    required this.color,
    required this.icon,
    this.subtitle,
    this.corrections = const [],
    this.isFullWidth = false,
  });
  final String title;
  final int value;
  final String? subtitle;
  final List<_Correction> corrections;
  final Color color;
  final IconData icon;
  final bool isFullWidth;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: color.withValues(alpha: 0.4),
          width: 2,
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Subtle background icon
          Positioned(
            right: -8,
            bottom: -8,
            child: Opacity(
              opacity: 0.08,
              child: Icon(
                icon,
                size: isFullWidth ? 80 : 60,
                color: color,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                IconBadge(
                  icon: icon,
                  color: color,
                  radius: 12,
                  bgAlpha: 0.2,
                  borderColor: color.withValues(alpha: 0.3),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.7),
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '$value',
                            style: GoogleFonts.manrope(
                              fontSize: isFullWidth ? 24 : 18,
                              fontWeight: FontWeight.w900,
                              color: color,
                            ),
                          ),
                          if (subtitle != null) ...[
                            const SizedBox(width: 4),
                            Text(
                              subtitle!,
                              style: GoogleFonts.manrope(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.4),
                              ),
                            ),
                          ],
                          ...corrections.map(
                            (c) => Padding(
                              padding: const EdgeInsets.only(left: 4),
                              child: Text(
                                '${c.isNegative ? "-" : "+"}${c.value}',
                                style: GoogleFonts.manrope(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                  color: c.color,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Correction {
  _Correction({
    required this.value,
    required this.color,
    this.isNegative = false,
  });
  final int value;
  final Color color;
  final bool isNegative;
}
