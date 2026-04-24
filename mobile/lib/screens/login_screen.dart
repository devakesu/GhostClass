import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/security_guard.dart';
import 'package:ghostclass/widgets/app_footer.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with ErrorHandlerMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;

  late final SecurityGuard _securityGuard;

  @override
  void initState() {
    super.initState();
    _securityGuard = ref.read(securityGuardProvider);
    // Enable screen protection only for the Login screen
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _securityGuard.setSecureScreen(true);
    });
  }

  @override
  void dispose() {
    // Disable screen protection when leaving the Login screen
    _securityGuard.setSecureScreen(false);
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // Removed internal _showErrorDialog in favor of ErrorHandlerMixin.handleError

  Future<void> _handleLogin() async {
    FocusScope.of(context).unfocus();

    final errors = <String>[];
    if (_usernameController.text.trim().isEmpty) {
      errors.add('Username, email, or phone number is required.');
    }
    if (_passwordController.text.isEmpty) {
      errors.add('Password is required.');
    }
    if (errors.isNotEmpty) {
      await handleError(errors.join('\n'), title: 'Missing Fields');
      return;
    }

    setState(() => _isLoading = true);
    LoadingOverlay.show(context, message: 'Waking up EzyGo...');

    try {
      await ref
          .read(authProvider.notifier)
          .login(_usernameController.text.trim(), _passwordController.text);

      if (mounted) {
        LoadingOverlay.hide(context);
        context.go('/');
      }
    } on LoginException catch (e) {
      if (!mounted) return;
      LoadingOverlay.hide(context);
      await handleError(e.message, title: 'Login Failed');
    } catch (e) {
      if (!mounted) return;
      LoadingOverlay.hide(context);
      await handleError(e);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: 24.0,
                vertical: 24.0,
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
                        child: Image.asset(
                          'assets/logo.png',
                          width: MediaQuery.of(context).size.width * 0.75,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ).animate().fade().scale(
                          duration: 600.ms,
                          curve: Curves.easeOutBack,
                        ),
                    const SizedBox(height: 20),

                    Text(
                      "Drop your ezygo credentials - we're just the service upgrade you deserved.",
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: Theme.of(context)
                            .colorScheme
                            .onSecondary
                            .withValues(alpha: 0.85),
                        letterSpacing: -0.3,
                        height: 1.4,
                      ),
                    ).animate().fade(delay: 100.ms).slideY(begin: 0.1),

                    const SizedBox(height: 18),

                    Center(
                      child: TransparencyBadge(
                        onTap: () => context.push('/about'),
                      ).animate().fadeIn(delay: 140.ms).slideY(begin: 0.08),
                    ),

                    const SizedBox(height: 24),

                    // Username label
                    SizedBox(
                      width: double.infinity,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8.0, left: 4.0, right: 4.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                'Username, Email, or Phone',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.manrope(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(context).colorScheme.onSurface,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Row(
                              children: [
                                Icon(LucideIcons.user, size: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
                                const SizedBox(width: 8),
                                Icon(LucideIcons.mail, size: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
                                const SizedBox(width: 8),
                                Icon(LucideIcons.phone, size: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    // No validator — errors shown via dialog
                    TextFormField(
                      controller: _usernameController,
                      decoration: InputDecoration(
                        hintText: 'cooked_fr@attendance.edu',
                        hintStyle: TextStyle(
                          fontSize: 13,
                          color: Theme.of(context)
                              .colorScheme
                              .onSecondary
                              .withValues(alpha: 0.7),
                          overflow: TextOverflow.ellipsis,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      keyboardType: TextInputType.text,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [
                        AutofillHints.username,
                        AutofillHints.email,
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Password label
                    SizedBox(
                      width: double.infinity,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8.0, left: 4.0, right: 4.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Password',
                              style: GoogleFonts.manrope(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(context).colorScheme.onSurface,
                              ),
                            ),
                            GestureDetector(
                              onTap: () async {
                                final url = Uri.parse(AppConfig.ezygoOrigin);
                                if (await canLaunchUrl(url)) {
                                  await launchUrl(url, mode: LaunchMode.externalApplication);
                                }
                              },
                              child: Text(
                                'Forgot password?',
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85),
                                ),
                              ),
                            ),
                          ],
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
                          color: Theme.of(context)
                              .colorScheme
                              .onSecondary
                              .withValues(alpha: 0.7),
                          overflow: TextOverflow.ellipsis,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12)),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? LucideIcons.eye
                                : LucideIcons.eyeOff,
                            color:
                                Theme.of(context).colorScheme.onSecondary,
                            size: 20,
                          ),
                          onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _handleLogin(),
                    ),
                    const SizedBox(height: 24),

                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isLoading ? null : _handleLogin,
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Text(
                              'Login',
                              style: TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.w500),
                            ),
                    )
                        .animate()
                        .fade(delay: 200.ms)
                        .slideY(begin: 0.1, curve: Curves.easeOutQuad),

                    const SizedBox(height: 32),

                    // Disclaimer
                    Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                            border: Border.all(
                                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2)),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(LucideIcons.lock,
                                  size: 12, color: Theme.of(context).colorScheme.primary),
                              const SizedBox(width: 6),
                              Text(
                                "GHOSTS DON'T SNOOP 😁",
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1.2,
                                  color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.95),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Your EzyGo password is safe. We strictly do not read, store, or share your login password. GhostClass is just here to help you skip. 👻',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context)
                                .colorScheme
                                .onSecondary
                                .withValues(alpha: 0.95),
                            fontStyle: FontStyle.italic,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ).animate().fade(delay: 500.ms).slideY(begin: 0.1),

                    const SizedBox(height: 32),
                    const AppFooter(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
}
