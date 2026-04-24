import 'package:flutter/material.dart';
import 'package:ghostclass/models/dashboard_stats.dart';

class StatsGridSection extends StatelessWidget {
  final DashboardStats stats;
  final int activeCount;

  const StatsGridSection({
    super.key,
    required this.stats,
    required this.activeCount,
  });

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        child: Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _StatChip(label: 'Active', value: activeCount.toString()),
            _StatChip(label: 'Present', value: stats.finalPresent.toString()),
            _StatChip(label: 'Total', value: stats.finalTotal.toString()),
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;

  const _StatChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }
}
