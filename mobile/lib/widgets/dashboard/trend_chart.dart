import 'package:flutter/material.dart';

class TrendChartSection extends StatelessWidget {
  const TrendChartSection({super.key});

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        child: SizedBox(
          height: 120,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Center(child: Text('Trend chart')),
          ),
        ),
      ),
    );
  }
}
