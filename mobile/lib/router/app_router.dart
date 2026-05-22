import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/constants/static_content.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/screens/about_screen.dart';
import 'package:ghostclass/screens/accept_terms_screen.dart';
import 'package:ghostclass/screens/attendance_calendar_screen.dart';
import 'package:ghostclass/screens/contact_screen.dart';
import 'package:ghostclass/screens/dashboard_screen.dart';
import 'package:ghostclass/screens/ghostclass_screen.dart';
import 'package:ghostclass/screens/help_screen.dart';
import 'package:ghostclass/screens/leaves_screen.dart';
import 'package:ghostclass/screens/legal_screen.dart';
import 'package:ghostclass/screens/login_screen.dart';
import 'package:ghostclass/screens/navigation_shell.dart';
import 'package:ghostclass/screens/notifications_screen.dart';
import 'package:ghostclass/screens/profile_dump_screen.dart';
import 'package:ghostclass/screens/profile_screen.dart';
import 'package:ghostclass/screens/scores_screen.dart';
import 'package:ghostclass/screens/splash_screen.dart';
import 'package:ghostclass/screens/tracking_screen.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:go_router/go_router.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>(
  debugLabel: 'root',
);

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _subscription;

  @override
  void dispose() {
    try {
      AppLogger.safeUnawait(
        _subscription.cancel(),
        'GoRouterRefreshStream.cancel',
      );
    } on Object catch (e) {
      debugPrint('GoRouterRefreshStream: cancel threw: $e');
    }
    super.dispose();
  }
}

/// Standardizes smooth transitions across all top-level pages.
Page<dynamic> _smoothPage(GoRouterState state, Widget child) {
  return CustomTransitionPage(
    key: state.pageKey,
    child: child,
    reverseTransitionDuration: const Duration(milliseconds: 250),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final slide =
          Tween<Offset>(
            begin: const Offset(0, 0.04),
            end: Offset.zero,
          ).animate(
            CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
          );
      return FadeTransition(
        opacity: animation,
        child: SlideTransition(position: slide, child: child),
      );
    },
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final authRefreshNotifier = ValueNotifier<bool>(false);

  // Create a listener that triggers router refresh when terms acceptance status changes
  ref.listen(authProvider, (previous, next) {
    if (previous?.value?.termsAccepted != next.value?.termsAccepted) {
      authRefreshNotifier.value = !authRefreshNotifier.value;
    }
  });

  final refreshStream = GoRouterRefreshStream(
    Supabase.instance.client.auth.onAuthStateChange,
  );
  ref.onDispose(() {
    refreshStream.dispose();
    authRefreshNotifier.dispose();
  });

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: Listenable.merge([
      refreshStream,
      authRefreshNotifier,
    ]),
    observers: [SentryNavigatorObserver(), AnalyticsService.instance.observer],
    redirect: (context, state) {
      final path = state.uri.path;
      final isSplash = path == '/splash';
      final isRoot = path == '/';

      // 1. Always allow Splash and Root to load without triggering auth hydration.
      // This ensures SplashScreen can perform its security handshake first.
      if (isSplash || isRoot) return null;

      final session = Supabase.instance.client.auth.currentSession;
      final isAuth = session != null;
      final authAsync = ref.read(authProvider);
      final authResolved = !authAsync.isLoading;
      final hydratedUser = authAsync.value;

      final isLogin = path == '/login';
      final isLegal = path == '/legal';
      final isPublic =
          isLegal || path == '/help' || path == '/contact' || path == '/about';
      final isAcceptTerms = path == '/accept-terms';

      // Handle Public pages - always accessible
      if (isPublic) return null;

      // Auth protection - force login if no session
      if (!isAuth && !isLogin) {
        return '/login';
      }

      // Authenticated users must hydrate through splash before entering app routes.
      if (isAuth && (isLogin || isRoot)) {
        return '/splash';
      }

      // Keep authenticated users on splash until auth bootstrap finishes.
      if (isAuth && !authResolved && !isSplash) {
        return '/splash';
      }

      // Once auth is hydrated, splash becomes the single decision point.
      if (isAuth && authResolved && isSplash) {
        if (hydratedUser == null) {
          return '/login';
        }
        return (hydratedUser.termsAccepted) ? '/dashboard' : '/accept-terms';
      }

      // ─── Terms Acceptance Redirection ───
      // If user is logged in but hasn't accepted current terms, force them to accept-terms page
      if (isAuth && !isAcceptTerms && !isPublic) {
        if (hydratedUser != null && !hydratedUser.termsAccepted) {
          return '/accept-terms';
        }
      }

      // If user is on accept-terms but already accepted, go to dashboard
      if (isAuth && isAcceptTerms) {
        if (hydratedUser != null && hydratedUser.termsAccepted) {
          return '/dashboard';
        }
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        name: 'root',
        pageBuilder: (context, state) =>
            _smoothPage(state, const SplashScreen()),
      ),
      GoRoute(
        path: '/splash',
        name: 'splash',
        pageBuilder: (context, state) =>
            _smoothPage(state, const SplashScreen()),
      ),
      GoRoute(
        path: '/login',
        name: 'login',
        pageBuilder: (context, state) =>
            _smoothPage(state, const LoginScreen()),
      ),
      GoRoute(
        path: '/accept-terms',
        name: 'accept-terms',
        pageBuilder: (context, state) =>
            _smoothPage(state, const AcceptTermsScreen()),
      ),
      GoRoute(
        path: '/about',
        name: 'about',
        pageBuilder: (context, state) =>
            _smoothPage(state, const AboutScreen()),
      ),

      // Bottom Navigation Shell
      ShellRoute(
        navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'shell'),
        builder: (context, state, child) => NavigationShell(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            pageBuilder: (context, state) =>
                _smoothPage(state, const DashboardScreen()),
          ),
          GoRoute(
            path: '/calendar',
            name: 'calendar',
            pageBuilder: (context, state) =>
                _smoothPage(state, const AttendanceCalendarScreen()),
          ),
          GoRoute(
            path: '/tracking',
            name: 'tracking',
            pageBuilder: (context, state) =>
                _smoothPage(state, const TrackingScreen()),
          ),
          GoRoute(
            path: '/scores',
            name: 'scores',
            pageBuilder: (context, state) =>
                _smoothPage(state, const ScoresScreen()),
          ),
          GoRoute(
            path: '/leaves',
            name: 'leaves',
            pageBuilder: (context, state) =>
                _smoothPage(state, const LeavesScreen()),
          ),
          GoRoute(
            path: '/ghostclass',
            name: 'ghostclass',
            pageBuilder: (context, state) =>
                _smoothPage(state, const GhostClassScreen()),
          ),
          GoRoute(
            path: '/notifications',
            name: 'notifications',
            pageBuilder: (context, state) =>
                _smoothPage(state, const NotificationsScreen()),
          ),
        ],
      ),

      // Profile Sub-pages
      GoRoute(
        path: '/profile-dump',
        name: 'profile-dump',
        pageBuilder: (context, state) =>
            _smoothPage(state, const ProfileDumpScreen()),
      ),
      GoRoute(
        path: '/profile',
        name: 'profile',
        pageBuilder: (context, state) =>
            _smoothPage(state, const ProfileScreen()),
      ),

      // Static Pages
      GoRoute(
        path: '/legal',
        name: 'legal',
        pageBuilder: (context, state) => _smoothPage(
          state,
          LegalScreen(title: 'Legal', body: getLegalPageContent()),
        ),
      ),
      GoRoute(
        path: '/help',
        name: 'help',
        pageBuilder: (context, state) => _smoothPage(state, const HelpScreen()),
      ),
      GoRoute(
        path: '/contact',
        name: 'contact',
        pageBuilder: (context, state) {
          final extra = (state.extra is Map)
              ? (state.extra! as Map).cast<String, dynamic>()
              : null;
          final subject =
              extra?['subject'] as String? ??
              state.uri.queryParameters['subject'];
          final message =
              extra?['message'] as String? ??
              state.uri.queryParameters['message'];

          return _smoothPage(
            state,
            ContactScreen(prefilledSubject: subject, prefilledMessage: message),
          );
        },
      ),
    ],
  );
});
