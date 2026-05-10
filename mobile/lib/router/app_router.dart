import 'dart:async';
import 'package:ghostclass/constants/static_content.dart';
import 'package:ghostclass/config/app_config.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/screens/about_screen.dart';
import 'package:ghostclass/screens/accept_terms_screen.dart';
import 'package:ghostclass/screens/attendance_calendar_screen.dart';
import 'package:ghostclass/screens/contact_screen.dart';
import 'package:ghostclass/screens/dashboard_screen.dart';
import 'package:ghostclass/screens/ghostclass_screen.dart';
import 'package:ghostclass/screens/help_screen.dart';
import 'package:ghostclass/screens/leaves_screen.dart';
import 'package:ghostclass/screens/login_screen.dart';
import 'package:ghostclass/screens/navigation_shell.dart';
import 'package:ghostclass/screens/notifications_screen.dart';
import 'package:ghostclass/screens/profile_dump_screen.dart';
import 'package:ghostclass/screens/profile_screen.dart';
import 'package:ghostclass/screens/scores_screen.dart';
import 'package:ghostclass/screens/splash_screen.dart';
import 'package:ghostclass/screens/static_screen.dart';
import 'package:ghostclass/screens/tracking_screen.dart';
import 'package:go_router/go_router.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final authRefreshNotifier = ValueNotifier<bool>(false);
  
  // Create a listener that triggers router refresh when terms acceptance status changes
  ref.listen(authProvider, (previous, next) {
    if (previous?.value?.termsAccepted != next.value?.termsAccepted) {
      authRefreshNotifier.value = !authRefreshNotifier.value;
    }
  });

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: Listenable.merge([
      GoRouterRefreshStream(Supabase.instance.client.auth.onAuthStateChange),
      authRefreshNotifier,
    ]),
    observers: [SentryNavigatorObserver()],
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
      final isPublic = isLegal || path == '/help' || path == '/contact' || path == '/about';
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
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/accept-terms',
        builder: (context, state) => const AcceptTermsScreen(),
      ),
      GoRoute(
        path: '/about',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const AboutScreen(),
          transitionDuration: const Duration(milliseconds: 380),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final slide = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic));
            return FadeTransition(opacity: animation, child: SlideTransition(position: slide, child: child));
          },
        ),
      ),
      
      // Bottom Navigation Shell
      ShellRoute(
        navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'shell'),
        builder: (context, state, child) => NavigationShell(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/calendar',
            builder: (context, state) => const AttendanceCalendarScreen(),
          ),
          GoRoute(
            path: '/tracking',
            builder: (context, state) => const TrackingScreen(),
          ),
          GoRoute(
            path: '/scores',
            builder: (context, state) => const ScoresScreen(),
          ),
          GoRoute(
            path: '/leaves',
            builder: (context, state) => const LeavesScreen(),
          ),
          GoRoute(
            path: '/ghostclass',
            builder: (context, state) => const GhostClassScreen(),
          ),
          GoRoute(
            path: '/notifications',
            builder: (context, state) => const NotificationsScreen(),
          ),
        ],
      ),

      // Profile Sub-pages
      GoRoute(
        path: '/profile-dump',
        builder: (context, state) => const ProfileDumpScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),

      // Static Pages
      GoRoute(
        path: '/legal',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: StaticPageScreen(
            title: 'Legal',
            body: getLegalPageContent(
              AppConfig.legalEffectiveDate,
              AppConfig.appVersion,
            ),
          ),
          transitionDuration: const Duration(milliseconds: 380),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final slide = Tween<Offset>(
              begin: const Offset(0, 0.06),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(position: slide, child: child),
            );
          },
        ),
      ),
      GoRoute(
        path: '/help',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const HelpScreen(),
          transitionDuration: const Duration(milliseconds: 380),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final slide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic));
            return FadeTransition(opacity: animation, child: SlideTransition(position: slide, child: child));
          },
        ),
      ),
      GoRoute(
        path: '/contact',
        pageBuilder: (context, state) {
          final Map<String, dynamic>? extra = (state.extra is Map)
              ? (state.extra as Map).cast<String, dynamic>()
              : null;
          final subject =
              extra?['subject'] as String? ?? state.uri.queryParameters['subject'];
          final message =
              extra?['message'] as String? ?? state.uri.queryParameters['message'];

          return CustomTransitionPage(
            key: state.pageKey,
            child: ContactScreen(
              prefilledSubject: subject,
              prefilledMessage: message,
            ),
            transitionDuration: const Duration(milliseconds: 380),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              final slide =
                  Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
                      .animate(
                CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
              );
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(position: slide, child: child),
              );
            },
          );
        },
      ),
    ],
  );
});
