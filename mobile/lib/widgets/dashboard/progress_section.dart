import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';

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
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Attendance',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: (stats.percentage / 100).clamp(0, 1),
                ),
                const SizedBox(height: 8),
                Text('${stats.percentage}% • target $targetValue%'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
