import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/support_helper.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/providers/outage_provider.dart';
import 'package:ghostclass/providers/security_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/providers/ui_state_provider.dart';
import 'package:ghostclass/screens/notifications_screen.dart';
import 'package:ghostclass/screens/tracking_screen.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/add_attendance_dialog.dart';
import 'package:ghostclass/widgets/app_update_dialog.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class NavigationShell extends ConsumerStatefulWidget {
  const NavigationShell({required this.child, super.key});
  final Widget child;

  @override
  ConsumerState<NavigationShell> createState() => _NavigationShellState();
}

class _NavigationShellState extends ConsumerState<NavigationShell> {
  // Guards against duplicate forced-logout calls on rapid critical-security events.
  //
  // Design note: This flag is intentionally NOT reset after a failed logout attempt.
  // If `logout(force: true)` fails (e.g., a Supabase timeout), the security barrier
  // UI is still rendered by the securityFailureProvider, and pressing "Close App"
  // is the only correct escape path — matching the threat model for critical failures.
  // A fresh NavigationShell instance created on the next login resets it to false.
  bool _criticalSecurityLogoutStarted = false;
  final List<ProviderSubscription<Object?>> _subscriptions = [];

  // Tracks the timestamp of the first back-press on the dashboard tab,
  // used to implement double-back-to-exit behaviour.
  DateTime? _lastBackPressOnDashboard;

  AcademicState? _asyncValueOrNull(AsyncValue<AcademicState?> value) {
    return value.hasValue ? value.value : null;
  }

  Future<void> _prewarmCalendarData() async {
    try {
      await ref.read(trackingProvider.future);
    } on Object catch (e, st) {
      AppLogger.e('NavigationShell: Failed to prewarm tracking data', e, st);
    }

    try {
      await ref.read(dashboardProvider.future);
    } on Object catch (e, st) {
      AppLogger.e('NavigationShell: Failed to prewarm dashboard data', e, st);
    }
  }

  void _checkAndShowUpdateDialog() {
    if (!mounted) return;
    final updateState = ref.read(appUpdateProvider);
    if (updateState.checkResult != null && updateState.checkResult!.hasUpdate) {
      if (updateState.checkResult!.isForceUpdate) {
        AppLogger.safeUnawait(
          AppUpdateDialog.show(
            context,
            updateState.checkResult!.latestVersion,
            isForceUpdate: true,
          ).catchError(
            (Object e, StackTrace st) => AppLogger.e(
              'NavigationShell: Failed to show force update dialog',
              e,
              st,
            ),
          ),
          'NavigationShell: show force update dialog',
        );
      } else if (!updateState.dialogDismissed) {
        AppLogger.safeUnawait(
          AppUpdateDialog.show(
                context,
                updateState.checkResult!.latestVersion,
                isForceUpdate: false,
              )
              .then((_) {
                if (mounted) {
                  ref.read(appUpdateProvider.notifier).dismissDialog();
                }
              })
              .catchError(
                (Object e, StackTrace st) {
                  AppLogger.e(
                    'NavigationShell: Failed to show update dialog',
                    e,
                    st,
                  );
                },
              ),
          'NavigationShell: show update dialog',
        );
      }
    }
  }

  @override
  void initState() {
    super.initState();

    // Run update dialog check after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        _checkAndShowUpdateDialog();
      } on Object catch (e, st) {
        AppLogger.e('NavigationShell: update dialog check failed', e, st);
      }
    });

    // Subscribe to academic changes and security failures. We keep the
    // returned ProviderSubscription objects so we can close them in dispose.
    _subscriptions.addAll([
      ref.listenManual<AsyncValue<AcademicState?>>(academicProvider, (
        previous,
        next,
      ) {
        final previousAcademic = previous == null
            ? null
            : _asyncValueOrNull(previous);
        final nextAcademic = _asyncValueOrNull(next);

        if (nextAcademic == null || next.isLoading) return;
        if (previousAcademic == nextAcademic) return;

        // Keep calendar dependencies warm in the background whenever the
        // academic context changes, even if the calendar screen is not open.
        AppLogger.safeUnawait(
          _prewarmCalendarData().catchError(
            (Object e, StackTrace st) {
              AppLogger.e('NavigationShell: Prewarm calendar failed', e, st);
            },
          ),
          'NavigationShell: prewarm calendar',
        );
      }),

      ref.listenManual<SecurityFailureState?>(securityFailureProvider, (
        previous,
        next,
      ) {
        if (next?.criticalRisk == true &&
            !_criticalSecurityLogoutStarted &&
            previous?.criticalRisk != true) {
          _criticalSecurityLogoutStarted = true;
          AppLogger.safeUnawait(
            ref.read(authProvider.notifier).logout(force: true).catchError(
              (Object e, StackTrace st) {
                AppLogger.e(
                  'NavigationShell: Forced logout failed',
                  e,
                  st,
                );
              },
            ),
            'NavigationShell: forced logout',
          );
        }
      }),
    ]);
  }

  @override
  void dispose() {
    for (final sub in _subscriptions) {
      sub.close();
    }
    _subscriptions.clear();
    super.dispose();
  }

  /// Handles back-button presses intercepted by [BackButtonListener].
  ///
  /// [BackButtonListener] registers a [ChildBackButtonDispatcher] that takes
  /// PRIORITY over go_router's [RootBackButtonDispatcher], so this callback
  /// fires before go_router attempts to pop any navigator — reliably on all
  /// Android versions including predictive back (Android 13+).
  ///
  /// Returns `true`  → back consumed (app stays open, we navigate ourselves).
  /// Returns `false` → delegate to go_router's default back handling.
  Future<bool> _handleBackPress(int selectedIndex) async {
    AppLogger.i(
      'NavigationShell: _handleBackPress called with selectedIndex=$selectedIndex',
    );
    if (selectedIndex != 0) {
      AppLogger.i(
        'NavigationShell: selectedIndex != 0, navigating to /dashboard',
      );
      context.go('/dashboard');
      return true;
    }

    // Dashboard → double-back-to-exit.
    final now = DateTime.now();
    final last = _lastBackPressOnDashboard;
    if (last != null && now.difference(last) < const Duration(seconds: 2)) {
      // Second back within 2 s → exit.
      await SystemNavigator.pop();
      return true;
    }
    _lastBackPressOnDashboard = now;

    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text(
            'Press back again to exit',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w600),
          ),
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 90),
        ),
      );
    return true;
  }

  int _calculateSelectedIndex(String location) {
    if (location.startsWith('/dashboard')) return 0;
    if (location.startsWith('/calendar')) return 1;
    if (location.startsWith('/scores')) return 2;
    if (location.startsWith('/leaves')) return 3;
    if (location.startsWith('/ghostclass') ||
        location.startsWith('/profile-dump')) {
      return 4;
    }
    return 0;
  }

  void _onTabTapped(int index) {
    switch (index) {
      case 0:
        context.go('/dashboard');
      case 1:
        context.go('/calendar');
      case 2:
        context.go('/scores');
      case 3:
        context.go('/leaves');
      case 4:
        context.go('/ghostclass');
    }
  }

  Future<void> _showTrackingOverlay() async {
    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      builder: (context) => const TrackingScreen(),
    );
    if (mounted) {
      ref.read(uiModalOpenProvider.notifier).setOpen(false);
    }
  }

  Future<void> _showNotificationsOverlay() async {
    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      builder: (context) => const NotificationsScreen(),
    );
    if (mounted) {
      ref.read(uiModalOpenProvider.notifier).setOpen(false);
    }
  }

  Future<void> _showAddAttendanceDialog() async {
    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showDialog<void>(
      context: context,
      builder: (context) => const AddAttendanceDialog(),
    );
    if (mounted) {
      ref.read(uiModalOpenProvider.notifier).setOpen(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final primary = Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;
    final bg = Theme.of(context).scaffoldBackgroundColor;

    final authAsync = ref.watch(authProvider);
    final user = authAsync.value;

    final notificationsState = ref.watch(notificationsProvider).value;
    final unreadCount = notificationsState?.unreadCount ?? 0;

    final isModalOpen = ref.watch(uiModalOpenProvider);

    final location = GoRouterState.of(context).uri.path;

    final selectedIndex = _calculateSelectedIndex(location);

    final bottomPadding = MediaQuery.of(context).padding.bottom;

    // --- OUTAGE BARRIER ---
    final dashboardError = ref.watch(
      dashboardProvider.select((state) => state.error),
    );
    final trackingError = ref.watch(
      trackingProvider.select((state) => state.error),
    );

    // Reactive provider confirms an outage (Global Barrier)
    final showOutageBarrier = ref.watch(outageProvider);

    // --- SECURITY BARRIER ---
    final securityFailure = ref.watch(securityFailureProvider);
    final showSecurityBarrier = securityFailure != null;
    final securityMessage = securityFailure?.message ?? '';
    final isCriticalSecurityFailure = securityFailure?.criticalRisk ?? false;

    final mainScaffold = Scaffold(
      backgroundColor: bg,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(80),
        child: SafeArea(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Wide Logo
                SizedBox(
                  width: MediaQuery.of(context).size.width * 0.42,
                  child: Image.asset(
                    'assets/images/logo.png',
                    alignment: Alignment.centerLeft,
                    fit: BoxFit.fitWidth,
                  ),
                ),

                const SizedBox(width: 8),

                // Header Actions
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Notifications Icon
                    Semantics(
                      button: true,
                      label: 'Notifications',
                      child: InkWell(
                        onTap: _showNotificationsOverlay,
                        splashColor: Colors.transparent,
                        highlightColor: Colors.transparent,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: Theme.of(
                                  context,
                                ).colorScheme.surface.withValues(alpha: 0.8),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .outlineVariant
                                      .withValues(alpha: 0.1),
                                ),
                              ),
                              child: Icon(
                                LucideIcons.bell,
                                size: 18,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.85),
                              ),
                            ),
                            if (unreadCount > 0)
                              Positioned(
                                top: -2,
                                right: -2,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 5,
                                    vertical: 2,
                                  ),
                                  constraints: const BoxConstraints(
                                    minWidth: 16,
                                    minHeight: 16,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.primary,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    unreadCount > 9
                                        ? '9+'
                                        : unreadCount.toString(),
                                    style: GoogleFonts.manrope(
                                      fontSize: 8,
                                      fontWeight: FontWeight.w900,
                                      color: Theme.of(
                                        context,
                                      ).colorScheme.onPrimary,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Tracking Icon Overlay
                    Semantics(
                      button: true,
                      label: 'Tracking',
                      child: InkWell(
                        onTap: _showTrackingOverlay,
                        splashColor: Colors.transparent,
                        highlightColor: Colors.transparent,
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: surface.withValues(alpha: 0.8),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Theme.of(context)
                                  .colorScheme
                                  .outlineVariant
                                  .withValues(alpha: 0.1),
                            ),
                          ),
                          child: Icon(
                            LucideIcons.listTodo,
                            size: 18,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Service Avatar with Gradient Border
                    Semantics(
                      button: true,
                      label: 'Profile',
                      child:
                          InkWell(
                                onTap: () => context.go('/ghostclass'),
                                splashColor: Colors.transparent,
                                highlightColor: Colors.transparent,
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: SweepGradient(
                                      colors: [
                                        Theme.of(context).colorScheme.primary,
                                        Theme.of(context)
                                                .extension<GhostColors>()
                                                ?.accentBlue ??
                                            Colors.blue,
                                        Theme.of(context)
                                                .extension<GhostColors>()
                                                ?.accentOrange ??
                                            Colors.orange,
                                        Theme.of(context).colorScheme.primary,
                                      ],
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary
                                            .withValues(alpha: 0.15),
                                        blurRadius: 10,
                                        spreadRadius: 1,
                                      ),
                                    ],
                                  ),
                                  child: Container(
                                    padding: const EdgeInsets.all(2),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Theme.of(
                                        context,
                                      ).scaffoldBackgroundColor,
                                    ),
                                    child: CircleAvatar(
                                      radius: 22,
                                      backgroundColor: Theme.of(
                                        context,
                                      ).colorScheme.surfaceContainer,
                                      backgroundImage:
                                          user?.profile?.avatarUrl != null
                                          ? CachedNetworkImageProvider(
                                              user!.profile!.avatarUrl!,
                                              headers: {
                                                'Origin':
                                                    AppConfig.supabaseOrigin,
                                              },
                                            )
                                          : null,
                                      child: user?.profile?.avatarUrl == null
                                          ? Icon(
                                              LucideIcons.user,
                                              size: 20,
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .onSurface
                                                  .withValues(alpha: 0.65),
                                            )
                                          : null,
                                    ),
                                  ),
                                ),
                              )
                              .animate()
                              .fadeIn(duration: 600.ms, delay: 200.ms)
                              .scale(begin: const Offset(0.8, 0.8)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      body: widget.child,
      bottomNavigationBar: BottomAppBar(
        height: 75,
        color: bg,
        padding: EdgeInsets.zero,
        notchMargin: 0,
        child: Container(
          padding: const EdgeInsets.only(
            bottom: 6,
            top: 6,
            left: 12,
            right: 12,
          ),
          decoration: BoxDecoration(
            color: surface.withValues(alpha: 0.6),
            border: Border(
              top: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withValues(alpha: 0.1),
              ),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _NavButton(
                  icon: LucideIcons.layoutDashboard,
                  label: 'Dashboard',
                  isSelected: selectedIndex == 0,
                  onTap: () => _onTabTapped(0),
                ),
              ),
              Expanded(
                child: _NavButton(
                  icon: LucideIcons.calendar,
                  label: 'Calendar',
                  isSelected: selectedIndex == 1,
                  onTap: () => _onTabTapped(1),
                ),
              ),
              Expanded(
                child: _NavButton(
                  icon: LucideIcons.graduationCap,
                  label: 'Scores',
                  isSelected: selectedIndex == 2,
                  onTap: () => _onTabTapped(2),
                ),
              ),
              Expanded(
                child: _NavButton(
                  icon: LucideIcons.clipboardList,
                  label: 'Leaves',
                  isSelected: selectedIndex == 3,
                  onTap: () => _onTabTapped(3),
                ),
              ),
              Expanded(
                child: _NavButton(
                  icon: LucideIcons.ghost,
                  label: 'GhostClass',
                  isSelected: selectedIndex == 4,
                  onTap: () => _onTabTapped(4),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        AppLogger.i(
          'NavigationShell: onPopInvokedWithResult called with didPop=$didPop',
        );
        if (didPop) return;
        unawaited(_handleBackPress(selectedIndex));
      },
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          ExcludeSemantics(
            excluding: showSecurityBarrier,
            child: mainScaffold,
          ),
          // The Semicircle Button (Positioned at bottom center, above everything)
          Positioned(
            bottom: 75 + bottomPadding, // Account for bottom safe area/notch
            child: ExcludeSemantics(
              excluding:
                  isModalOpen ||
                  (selectedIndex > 1) ||
                  showOutageBarrier ||
                  showSecurityBarrier,
              child: IgnorePointer(
                ignoring:
                    isModalOpen ||
                    (selectedIndex > 1) ||
                    showOutageBarrier ||
                    showSecurityBarrier,
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity:
                      (isModalOpen ||
                          (selectedIndex > 1) ||
                          showOutageBarrier ||
                          showSecurityBarrier)
                      ? 0
                      : 1,
                  child: Material(
                    type: MaterialType.transparency,
                    child: InkWell(
                      onTap: _showAddAttendanceDialog,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(72),
                      ),
                      child: Container(
                        width: 72,
                        height: 34,
                        decoration: BoxDecoration(
                          color: primary,
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(72),
                          ),
                        ),
                        child: Icon(
                          LucideIcons.plus,
                          color: Theme.of(context).colorScheme.onPrimary,
                          size: 24,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ).animate().slideY(begin: 3.5, end: 0, curve: Curves.easeOutBack),

          // --- GLOBAL OUTAGE OVERLAY ---
          if (showOutageBarrier)
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                child: ColoredBox(
                  color: bg.withValues(alpha: 0.9), // More opaque background
                  child: ServiceErrorView(
                    error: dashboardError ?? trackingError,
                    onRetry: () async {
                      ref.read(apiServiceProvider).clearCaches();
                      ref
                        ..invalidate(dashboardProvider)
                        ..invalidate(trackingProvider)
                        ..invalidate(academicProvider);

                      // Wait for critical providers to finish (success or new error)
                      // We add a 10s timeout so the UI doesn't feel 'stuck' if network hangs
                      AppLogger.d(
                        'NavigationShell: Starting outage recovery retry...',
                      );
                      try {
                        await Future.wait([
                          ref.read(dashboardProvider.future),
                          ref.read(trackingProvider.future),
                        ]).timeout(AppConfig.defaultTimeout);
                        AppLogger.i(
                          'NavigationShell: Outage recovery wait completed (or partial success).',
                        );
                      } on Object catch (e) {
                        AppLogger.e(
                          'NavigationShell: Outage recovery wait timed out or failed ($e). Re-enabling UI.',
                        );
                      }
                    },
                  ),
                ),
              ),
            ).animate().fadeIn(duration: 300.ms),

          // --- GLOBAL SECURITY BARRIER ---
          if (showSecurityBarrier)
            Positioned.fill(
              child: Semantics(
                container: true,
                liveRegion: true,
                label: securityMessage.isEmpty
                    ? 'Security verification failed.'
                    : 'Security verification failed. $securityMessage',
                child: Stack(
                  children: [
                    const ModalBarrier(
                      dismissible: false,
                      color: Colors.black,
                      semanticsLabel: 'Security verification failed',
                    ),
                    BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.5),
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                                  padding: const EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    color: Colors.red.withValues(alpha: 0.1),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: Colors.red.withValues(alpha: 0.3),
                                    ),
                                  ),
                                  child: const Icon(
                                    LucideIcons.shieldAlert,
                                    size: 48,
                                    color: Colors.red,
                                  ),
                                )
                                .animate(
                                  onPlay: (controller) =>
                                      controller.repeat(reverse: true),
                                )
                                .scale(
                                  begin: const Offset(1, 1),
                                  end: const Offset(1.1, 1.1),
                                  duration: 1000.ms,
                                ),
                            const SizedBox(height: 32),
                            Text(
                              'Security Verification Failed',
                              style: GoogleFonts.manrope(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              securityMessage,
                              style: GoogleFonts.manrope(
                                fontSize: 15,
                                color: Colors.white.withValues(alpha: 0.7),
                                height: 1.5,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 48),
                            if (!Platform.isIOS || !isCriticalSecurityFailure)
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.white,
                                    foregroundColor: Colors.black,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  onPressed: () async {
                                    if (isCriticalSecurityFailure) {
                                      if (Platform.isAndroid) {
                                        await SystemNavigator.pop();
                                      }
                                      return;
                                    }

                                    // Clear lock and retry
                                    ref.read(apiServiceProvider).clearCaches();
                                    ref
                                        .read(securityFailureProvider.notifier)
                                        .clearFailure();
                                    try {
                                      await ref
                                          .read(authProvider.notifier)
                                          .refreshProfile(force: true);
                                    } on Object {
                                      // The 401 interceptor will catch it again if it still fails
                                    }
                                  },
                                  child: Text(
                                    isCriticalSecurityFailure
                                        ? 'Close App'
                                        : 'Restart App',
                                    style: GoogleFonts.manrope(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.black,
                                    ),
                                  ),
                                ),
                              )
                            else
                              Text(
                                'Please close the app manually.',
                                style: GoogleFonts.manrope(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white.withValues(alpha: 0.6),
                                ),
                                textAlign: TextAlign.center,
                              ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  side: BorderSide(
                                    color: Colors.white.withValues(alpha: 0.3),
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 16,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                ),
                                onPressed: () => SupportHelper.contactViaEmail(
                                  subject:
                                      'Security Failure Report [v${AppConfig.appVersion}]',
                                  customBody:
                                      'Hi Support,\n\nI encountered a security failure while using the app.\n\n'
                                      '-- SUMMARY --\n'
                                      'Message: $securityMessage\n\n'
                                      '-- PERSISTENCE --\n'
                                      '${SupportHelper.persistenceMessage}\n',
                                ),
                                icon: const Icon(LucideIcons.mail, size: 18),
                                label: Text(
                                  'Contact Support',
                                  style: GoogleFonts.manrope(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            if (!isCriticalSecurityFailure) ...[
                              const SizedBox(height: 16),
                              TextButton(
                                onPressed: () =>
                                    ref.read(authProvider.notifier).logout(),
                                child: Text(
                                  'Logout of GhostClass',
                                  style: GoogleFonts.manrope(
                                    color: Colors.red,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 400.ms),
        ],
      ), // Stack
    ); // PopScope
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;

    return Semantics(
      button: true,
      label: '$label tab',
      selected: isSelected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected
                ? primary.withValues(alpha: 0.1)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                    icon,
                    size: 22,
                    color: isSelected
                        ? primary
                        : Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.45),
                  )
                  .animate(target: isSelected ? 1 : 0)
                  .scale(
                    begin: const Offset(1, 1),
                    end: const Offset(1.1, 1.1),
                  ),
              const SizedBox(height: 2),
              if (isSelected)
                Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: primary,
                  ),
                ).animate().fade(duration: 200.ms),
            ],
          ),
        ),
      ),
    );
  }
}
