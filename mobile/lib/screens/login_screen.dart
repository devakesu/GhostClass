import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/providers/app_update_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/analytics_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/security_guard.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/app_footer.dart';
import 'package:ghostclass/widgets/app_update_dialog.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with ErrorHandlerMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;

  int _consecutiveFailures = 0;
  Timer? _cooldownTimer;
  int _cooldownSecondsRemaining = 0;

  late final SecurityGuard _securityGuard;

  void _startCooldown() {
    // Exponential backoff cooldown: 30s -> 60s -> 120s -> 300s (max 5 minutes)
    final attemptCount = (_consecutiveFailures - 2).clamp(1, 10);
    var cooldown = 30 * (1 << (attemptCount - 1));
    if (cooldown > 300) cooldown = 300;

    _cooldownSecondsRemaining = cooldown;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_cooldownSecondsRemaining > 1) {
          _cooldownSecondsRemaining--;
        } else {
          _cooldownSecondsRemaining = 0;
          _cooldownTimer?.cancel();
          _cooldownTimer = null;
        }
      });
    });
  }

  void _checkAndShowUpdateDialog() {
    final updateState = ref.read(appUpdateProvider);
    if (updateState.checkResult != null &&
        updateState.checkResult!.hasUpdate &&
        !updateState.checkResult!.isForceUpdate &&
        !updateState.dialogDismissed) {
      AppLogger.safeUnawait(
        AppUpdateDialog.show(
          context,
          updateState.checkResult!.latestVersion,
          isForceUpdate: false,
        ).then((_) {
          if (mounted) {
            ref.read(appUpdateProvider.notifier).dismissDialog();
          }
        }),
        'LoginScreen: show update dialog',
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _securityGuard = ref.read(securityGuardProvider);
    // Enable screen protection only for the Login screen
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final _ = _securityGuard.setSecureScreen(enabled: true);
      _checkAndShowUpdateDialog();
    });
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    // Disable screen protection when leaving the Login screen
    final _ = _securityGuard.setSecureScreen(enabled: false);
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    FocusScope.of(context).unfocus();

    if (_cooldownSecondsRemaining > 0) return;

    if (!kDebugMode && !kIsWeb && Platform.isAndroid) {
      const channel = MethodChannel('com.devakesu.apps.ghostclass/security');
      try {
        final isDebuggerAttached =
            await channel.invokeMethod<bool>('isDebuggerAttached') ?? false;
        if (isDebuggerAttached) {
          await _securityGuard.wipeAndExit();
          return;
        }

        final isWindowObscured =
            await channel.invokeMethod<bool>('isWindowObscured') ?? false;
        if (isWindowObscured) {
          if (mounted) {
            await handleError(
              'An active overlay was detected. Please close any floating apps before logging in.',
              title: 'Security Alert',
            );
          }
          return;
        }
      } on Object catch (_) {
        // Silently ignore
      }
    }

    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    if (!mounted) return;
    setState(() => _isLoading = true);
    LoadingOverlay.show(context, message: 'Waking up EzyGo...');

    try {
      AppLogger.safeUnawait(
        AnalyticsService.instance
            .logCustom('login_attempt', {
              'username_length': _usernameController.text.trim().length,
            })
            .catchError(
              (Object e, StackTrace st) => AppLogger.e(
                'LoginScreen: Analytics login_attempt failed',
                e,
                st,
              ),
            ),
        'LoginScreen: analytics login_attempt',
      );

      await ref
          .read(authProvider.notifier)
          .login(_usernameController.text.trim(), _passwordController.text);

      _consecutiveFailures = 0;

      if (mounted) {
        LoadingOverlay.hide(context);
        context.go('/');
      }
    } on LoginException catch (e) {
      if (!mounted) return;
      LoadingOverlay.hide(context);
      _consecutiveFailures++;
      if (_consecutiveFailures >= 3) {
        _startCooldown();
      }
      AppLogger.safeUnawait(
        AnalyticsService.instance
            .logCustom('login_failed', {
              'reason': e.message,
            })
            .catchError(
              (Object e, StackTrace st) => AppLogger.e(
                'LoginScreen: Analytics login_failed failed',
                e,
                st,
              ),
            ),
        'LoginScreen: analytics login_failed',
      );
      await handleError(e.message, title: 'Login Failed');
    } on Object catch (e) {
      if (!mounted) return;
      LoadingOverlay.hide(context);
      _consecutiveFailures++;
      if (_consecutiveFailures >= 3) {
        _startCooldown();
      }
      AppLogger.safeUnawait(
        AnalyticsService.instance
            .logError(e.toString())
            .catchError(
              (Object e, StackTrace st) => AppLogger.e(
                'LoginScreen: Analytics logError failed',
                e,
                st,
              ),
            ),
        'LoginScreen: analytics logError',
      );
      await handleError(e);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;
    final ghostColors = theme.extension<GhostColors>();
    final amber = ghostColors?.accentOrange ?? const Color(0xFFF59E0B);

    return Scaffold(
      body: Stack(
        children: [
          // Dynamic Background Blobs
          Positioned(
            top: -120,
            right: -60,
            child: RepaintBoundary(
              child: _GlowBlob(
                color: primaryColor.withValues(alpha: 0.1),
                size: 320,
              ),
            ),
          ),
          Positioned(
            bottom: -60,
            left: -100,
            child: RepaintBoundary(
              child: _GlowBlob(
                color: amber.withValues(alpha: 0.08),
                size: 280,
              ),
            ),
          ),
          Positioned(
            top: 200,
            left: -80,
            child: RepaintBoundary(
              child: _GlowBlob(
                color: primaryColor.withValues(alpha: 0.04),
                size: 200,
              ),
            ),
          ),

          InkWell(
            onTap: () => FocusScope.of(context).unfocus(),
            splashColor: Colors.transparent,
            highlightColor: Colors.transparent,
            child: SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  child: AutofillGroup(
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(
                            child: Hero(
                              tag: 'app_logo',
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 300,
                                ),
                                child: Image.asset(
                                  'assets/images/logo.png',
                                  width:
                                      MediaQuery.of(context).size.width * 0.7,
                                  fit: BoxFit.contain,
                                  semanticLabel: 'GhostClass Logo',
                                ),
                              ),
                            ),
                          ).animate().fade().scale(
                            duration: 600.ms,
                            curve: Curves.easeOutBack,
                          ),
                          const SizedBox(height: 8),

                          Text(
                            "Drop your ezygo credentials - we're just the service upgrade you deserved.",
                            textAlign: TextAlign.center,
                            style: GoogleFonts.manrope(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: theme.colorScheme.onSecondary.withValues(
                                alpha: 0.85,
                              ),
                              letterSpacing: -0.3,
                              height: 1.3,
                            ),
                          ).animate().fade(delay: 100.ms).slideY(begin: 0.1),

                          const SizedBox(height: 24),

                          // Username Field
                          const _FieldLabel(
                            label: 'Username, Email, or Phone',
                            icons: [
                              LucideIcons.user,
                              LucideIcons.mail,
                              LucideIcons.phone,
                            ],
                          ),
                          TextFormField(
                            controller: _usernameController,
                            decoration: InputDecoration(
                              hintText: 'cooked_fr@attendance.edu',
                              hintStyle: TextStyle(
                                fontSize: 13,
                                color: theme.colorScheme.onSecondary.withValues(
                                  alpha: 0.5,
                                ),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                              filled: true,
                              fillColor: theme.colorScheme.surface.withValues(
                                alpha: 0.5,
                              ),
                            ),
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [
                              AutofillHints.username,
                              AutofillHints.email,
                            ],
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Username, email, or phone number is required.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),

                          // Password Field
                          _FieldLabel(
                            label: 'Password',
                            trailing: Semantics(
                              button: true,
                              label: 'Forgot password',
                              hint:
                                  'Opens EzyGo website to reset your password',
                              child: InkWell(
                                onTap: () async {
                                  final url = Uri.parse(AppConfig.ezygoOrigin);
                                  if (await canLaunchUrl(url)) {
                                    await launchUrl(
                                      url,
                                      mode: LaunchMode.externalApplication,
                                    );
                                  }
                                },
                                borderRadius: BorderRadius.circular(4),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 2,
                                  ),
                                  child: Text(
                                    'Forgot password?',
                                    style: GoogleFonts.manrope(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: primaryColor,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            decoration: InputDecoration(
                              hintText: '*************',
                              hintStyle: TextStyle(
                                fontSize: 12,
                                color: theme.colorScheme.onSecondary.withValues(
                                  alpha: 0.5,
                                ),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                              filled: true,
                              fillColor: theme.colorScheme.surface.withValues(
                                alpha: 0.5,
                              ),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscurePassword
                                      ? LucideIcons.eye
                                      : LucideIcons.eyeOff,
                                  color: theme.colorScheme.onSecondary,
                                  size: 20,
                                ),
                                onPressed: () => setState(
                                  () => _obscurePassword = !_obscurePassword,
                                ),
                              ),
                            ),
                            textInputAction: TextInputAction.done,
                            autofillHints: const [AutofillHints.password],
                            onFieldSubmitted: (_) => _handleLogin(),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Password is required.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 24),

                          // Login Button with Pink-Amber Gradient
                          Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  gradient: LinearGradient(
                                    colors: [primaryColor, amber],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: primaryColor.withValues(
                                        alpha: 0.35,
                                      ),
                                      blurRadius: 15,
                                      offset: const Offset(0, 8),
                                    ),
                                  ],
                                ),
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    shadowColor: Colors.transparent,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  onPressed:
                                      (_isLoading ||
                                          _cooldownSecondsRemaining > 0)
                                      ? null
                                      : _handleLogin,
                                  child: _isLoading
                                      ? const SizedBox(
                                          height: 22,
                                          width: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: Colors.white,
                                          ),
                                        )
                                      : Text(
                                          _cooldownSecondsRemaining > 0
                                              ? 'Retry in ${_cooldownSecondsRemaining}s'
                                              : 'Login',
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                ),
                              )
                              .animate()
                              .fade(delay: 200.ms)
                              .slideY(begin: 0.1, curve: Curves.easeOutQuad),

                          const SizedBox(height: 16),
                          const AppFooter(),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, this.icons, this.trailing})
    : assert(
        icons == null || trailing == null,
        'Cannot provide both icons and trailing widget',
      );
  final String label;
  final List<IconData>? icons;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 4, right: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.8),
            ),
          ),
          if (icons case final i?)
            Row(
              children: i
                  .map(
                    (icon) => Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Icon(
                        icon,
                        size: 14,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ...[trailing].nonNulls,
        ],
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: [
          BoxShadow(color: color, blurRadius: 100, spreadRadius: 40),
        ],
      ),
    );
  }
}
