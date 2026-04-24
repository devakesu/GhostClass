import 'package:flutter/material.dart';

class ServiceRefreshIndicator extends StatelessWidget {
  final Widget child;
  final Future<void> Function() onRefresh;
  final bool useOverlay;

  const ServiceRefreshIndicator({
    super.key,
    required this.child,
    required this.onRefresh,
    this.useOverlay = true,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: Theme.of(context).colorScheme.primary,
      onRefresh: onRefresh,
      child: child,
    );
  }
}
