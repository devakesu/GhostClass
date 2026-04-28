import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';

class AestheticRefreshIndicator extends StatefulWidget {
  final Widget child;
  final RefreshCallback onRefresh;
  final String? loadingMessage;
  final bool useOverlay;

  const AestheticRefreshIndicator({
    super.key,
    required this.child,
    required this.onRefresh,
    this.loadingMessage,
    this.useOverlay = true,
  });

  @override
  State<AestheticRefreshIndicator> createState() =>
      _AestheticRefreshIndicatorState();
}

class _AestheticRefreshIndicatorState extends State<AestheticRefreshIndicator> {
  double _pullDistance = 0.0;
  bool _isRefreshing = false;

  void _safeSetState(VoidCallback fn) {
    if (mounted) {
      setState(fn);
    }
  }

  Future<void> _handleRefresh() async {
    if (_isRefreshing) return;

    // Check if context is still valid before showing overlay
    if (!mounted) {
      return;
    }

    _safeSetState(() {
      _isRefreshing = true;
      _pullDistance = 0.0;
    });

    // Capture the RootNavigator state BEFORE any async gaps.
    // This solves the 'unmounted context' crash if the provider state reloading
    // causes this widget to be destroyed while we are still waiting for EzyGo.
    final rootNavigator = Navigator.of(context, rootNavigator: true);

    try {
      if (widget.useOverlay) {
        LoadingOverlay.show(
          context,
          message: widget.loadingMessage ?? 'Syncing with EzyGo... 👻',
        );
      }

      // We wrap the callback in a slightly longer delay if it returned too fast,
      // to ensure the overlay actually registered in the navigator.
      final startTime = DateTime.now();
      await widget.onRefresh();
      final endTime = DateTime.now();

      // If it finished in less than 500ms, wait a bit to ensure overlay stability
      final duration = endTime.difference(startTime);
      if (duration.inMilliseconds < 500 && widget.useOverlay) {
        await Future.delayed(
          Duration(milliseconds: 500 - duration.inMilliseconds),
        );
      }
    } catch (e) {
      debugPrint('AestheticRefreshIndicator: Refresh failed: $e');
    } finally {
      if (widget.useOverlay) {
        try {
          if (rootNavigator.canPop()) {
            rootNavigator.pop();
          }
        } catch (e) {
          debugPrint('AestheticRefreshIndicator: Failed to hide overlay: $e');
        }
      }
      _safeSetState(() => _isRefreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.depth != 0) return false;

        if (notification is ScrollUpdateNotification && !_isRefreshing) {
          final metrics = notification.metrics;

          // CRITICAL GUARD: Only allow refresh if the user is at the top AND moving downwards.
          // If we have scrolled down at all (pixels > 0), kill any pull active.
          if (metrics.pixels >= 0) {
            if (_pullDistance > 0) {
              _safeSetState(() => _pullDistance = 0.0);
            }
            return false;
          }

          // EXTREME STICKINESS: Only allow the pull animation if we are in an overscroll state.
          // This ensures that the Glow Icon only appears when the user is explicitly pulling
          // beyond the edge.
          if (metrics.pixels < 0) {
            _safeSetState(() {
              // Threshold 140px for very high tension - native feel
              _pullDistance = (metrics.pixels.abs() / 140).clamp(0.0, 1.0);
            });
          }
        }

        // When the user stops dragging or starts scrolling up, reset the pull distance
        if (notification is UserScrollNotification) {
          if (notification.direction == ScrollDirection.reverse ||
              notification.direction == ScrollDirection.idle) {
            if (_pullDistance > 0 && !_isRefreshing) {
              _safeSetState(() => _pullDistance = 0.0);
            }
          }
        }
        return false;
      },
      child: Stack(
        children: [
          RefreshIndicator(
            onRefresh: _handleRefresh,
            displacement: 0.0, // We handle the visual position with our Stack
            edgeOffset: 0.0,
            color: Colors.transparent,
            backgroundColor: Colors.transparent,
            strokeWidth: 0,
            triggerMode: RefreshIndicatorTriggerMode.anywhere,
            notificationPredicate: (notification) {
              // ONLY allow if we are truly overscrolling (pulling past the edge)
              // This is the absolute atomic guard.
              if (notification.metrics.pixels < -40 &&
                  notification is ScrollUpdateNotification) {
                return true;
              }
              return false;
            },
            child: widget.child,
          ),

          if (_pullDistance > 0.05 && !_isRefreshing)
            Positioned(
              top: 40,
              left: 0,
              right: 0,
              child: Center(
                child: RefreshGlowIcon(pullDistance: _pullDistance),
              ),
            ),
        ],
      ),
    );
  }
}

class RefreshGlowIcon extends StatelessWidget {
  final double pullDistance;

  const RefreshGlowIcon({super.key, required this.pullDistance});

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;

    // Subtle glow (reduced shadows)
    // Adding a slight border effect as a "different" aesthetic
    return Opacity(
      opacity: (pullDistance * 1.5).clamp(0.0, 1.0),
      child: Transform.scale(
        scale: 0.9 + (pullDistance * 0.25),
        child: Transform.rotate(
          angle: pullDistance * 2 * math.pi,
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: primary.withValues(alpha: 0.12),
              border: Border.all(
                color: primary.withValues(alpha: 0.3 * pullDistance),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: primary.withValues(alpha: 0.15 * pullDistance),
                  blurRadius: 10 * pullDistance,
                  spreadRadius: 1 * pullDistance,
                ),
              ],
            ),
            child: Icon(LucideIcons.refreshCw, color: primary, size: 20),
          ),
        ),
      ),
    );
  }
}
