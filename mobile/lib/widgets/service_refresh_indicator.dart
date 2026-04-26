import 'package:flutter/material.dart';
import 'package:ghostclass/widgets/aesthetic_refresh_indicator.dart';

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
    return AestheticRefreshIndicator(
      onRefresh: onRefresh,
      useOverlay: useOverlay,
      child: child,
    );
  }
}
