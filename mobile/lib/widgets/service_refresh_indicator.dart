import 'package:flutter/material.dart';
import 'package:ghostclass/widgets/aesthetic_refresh_indicator.dart';

class ServiceRefreshIndicator extends StatelessWidget {

  const ServiceRefreshIndicator({
    required this.child, required this.onRefresh, super.key,
    this.useOverlay = true,
  });
  final Widget child;
  final Future<void> Function() onRefresh;
  final bool useOverlay;

  @override
  Widget build(BuildContext context) {
    return AestheticRefreshIndicator(
      onRefresh: onRefresh,
      useOverlay: useOverlay,
      child: child,
    );
  }
}
