import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// AestheticRefreshIndicator
/// -------------------------
/// A custom, high-fidelity refresh indicator that provides smooth visual feedback
/// and ensures reliable sync state across different platforms.
class AestheticRefreshIndicator extends StatefulWidget {
  const AestheticRefreshIndicator({
    required this.child,
    required this.onRefresh,
    super.key,
    this.loadingMessage,
    this.useOverlay = true,
  });
  final Widget child;
  final RefreshCallback onRefresh;
  final String? loadingMessage;
  final bool useOverlay;

  @override
  State<AestheticRefreshIndicator> createState() =>
      _AestheticRefreshIndicatorState();
}

class _AestheticRefreshIndicatorState extends State<AestheticRefreshIndicator> {
  double _pullDistance = 0;
  bool _isRefreshing = false;

  /// True only when the current drag gesture started while the list was
  /// already at (or above) the very top. This prevents fast upward flings
  /// from the middle/bottom of the list accidentally triggering a refresh
  /// when they overshoot past pixels = 0.
  bool _dragStartedAtTop = false;

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
        await Future<void>.delayed(
          Duration(milliseconds: 500 - duration.inMilliseconds),
        );
      }
    } on Object catch (e) {
      AppLogger.e('AestheticRefreshIndicator: Refresh failed', e);
    } finally {
      if (widget.useOverlay) {
        try {
          if (rootNavigator.canPop()) {
            rootNavigator.pop();
          }
        } on Object catch (e) {
          AppLogger.e('AestheticRefreshIndicator: Failed to hide overlay', e);
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

        final metrics = notification.metrics;

        // Track whether each new drag gesture started from the very top of the
        // scroll view. Only gestures that begin at the top are eligible to
        // trigger pull-to-refresh. A fast upward fling from the middle/bottom
        // may overshoot past pixels=0, but _dragStartedAtTop will be false, so
        // the overscroll is ignored.
        if (notification is ScrollStartNotification) {
          _dragStartedAtTop = metrics.pixels <= 0;
        }

        if (notification is ScrollUpdateNotification && !_isRefreshing) {
          if (_dragStartedAtTop && metrics.pixels < 0) {
            // Divisor 160 → full progress at 160 px; threshold 0.85 → triggers at ~136 px.
            final distance = (metrics.pixels.abs() / 160).clamp(0.0, 1.0);
            _safeSetState(() => _pullDistance = distance);

            // Trigger refresh exactly when user releases (dragDetails becomes null)
            // and we are past the threshold.
            if (notification.dragDetails == null && distance >= 0.85) {
              _dragStartedAtTop = false;
              final _ = _handleRefresh();
            }
          } else if (_pullDistance > 0) {
            _safeSetState(() => _pullDistance = 0.0);
          }
        }

        if (notification is OverscrollNotification && !_isRefreshing) {
          if (_dragStartedAtTop && metrics.pixels < 0) {
            final distance = (metrics.pixels.abs() / 160).clamp(0.0, 1.0);
            _safeSetState(() => _pullDistance = distance);

            if (notification.dragDetails == null && distance >= 0.85) {
              _dragStartedAtTop = false;
              final _ = _handleRefresh();
            }
          }
        }

        if (notification is UserScrollNotification &&
            notification.direction == ScrollDirection.idle) {
          if (!_isRefreshing) {
            _dragStartedAtTop = false;
            _safeSetState(() => _pullDistance = 0.0);
          }
        }

        if (notification is ScrollEndNotification) {
          if (!_isRefreshing) {
            _dragStartedAtTop = false;
            _safeSetState(() => _pullDistance = 0.0);
          }
        }

        return false;
      },
      child: Stack(
        children: [
          widget.child,
          if (_pullDistance > 0.1 && !_isRefreshing)
            Positioned(
              top: 40,
              left: 0,
              right: 0,
              child: Center(
                child: Visibility(
                  visible: _pullDistance > 0.1,
                  child: RefreshGlowIcon(pullDistance: _pullDistance),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// RefreshGlowIcon
/// ---------------
/// Visual representation of the refresh pull action.
class RefreshGlowIcon extends StatelessWidget {
  const RefreshGlowIcon({required this.pullDistance, super.key});
  final double pullDistance;

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
              color: primary.withValues(alpha: 0.12 * pullDistance),
              border: Border.all(
                color: primary.withValues(alpha: 0.3 * pullDistance),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: primary.withValues(alpha: 0.1 * pullDistance),
                  blurRadius: 12 * pullDistance,
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
