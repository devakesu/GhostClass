import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ContactScreen extends ConsumerStatefulWidget {
  final String? prefilledSubject;
  final String? prefilledMessage;

  const ContactScreen({this.prefilledSubject, this.prefilledMessage, super.key});

  @override
  ConsumerState<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends ConsumerState<ContactScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _emailController;
  late final TextEditingController _subjectController;
  late final TextEditingController _messageController;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Initialize controllers with pre-filled values from constructor
    _nameController = TextEditingController();
    _emailController = TextEditingController();
    _subjectController =
        TextEditingController(text: widget.prefilledSubject);
    _messageController =
        TextEditingController(text: widget.prefilledMessage);

    // Pre-fill name/email if logged in using our custom authProvider
    final authAsync = ref.read(authProvider);
    final user = authAsync.value;
    if (user != null) {
      _nameController.text = user.profile?.fullName ?? user.username ?? '';
      _emailController.text = user.profile?.email ?? '';
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  // ─── Dialog ──────────────────────────────────────────────────────────────────

  Future<void> _showDialog(
    String title,
    String message, {
    bool success = false,
  }) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: BorderRadius.circular(20),
            border: Theme.of(context).brightness == Brightness.dark ? Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1)) : null,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 40,
                offset: const Offset(0, 16),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: (success ? Colors.green : Colors.redAccent).withValues(
                    alpha: 0.12,
                  ),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  success ? LucideIcons.checkCircle : LucideIcons.alertCircle,
                  color: success ? Colors.green : Colors.redAccent,
                  size: 26,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: GoogleFonts.manrope(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: Theme.of(context).colorScheme.onSurface,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: (success ? Colors.green : Colors.redAccent)
                        .withValues(alpha: 0.15),
                    foregroundColor: success ? Colors.green : Colors.redAccent,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: (success ? Colors.green : Colors.redAccent)
                            .withValues(alpha: 0.3),
                      ),
                    ),
                  ),
                  child: Text(
                    'Got it',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  Future<void> _handleSend() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final subject = _subjectController.text.trim();
    final message = _messageController.text.trim();

    // Client-side quick validation
    if (name.isEmpty || email.isEmpty || subject.isEmpty || message.isEmpty) {
      await _showDialog(
        'Missing Fields',
        'Please fill in your name, email, subject, and message before sending.',
      );
      return;
    }

    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      await _showDialog('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (message.length < 10) {
      await _showDialog(
        'Message Too Short',
        'Please write at least 10 characters.',
      );
      return;
    }

    setState(() => _sending = true);

    try {
      final apiService = ref.read(apiServiceProvider);
      final response = await apiService.submitContact(
        name: name,
        email: email,
        subject: subject,
        message: message,
        supabaseToken: Supabase.instance.client.auth.currentSession?.accessToken,
      );

      if (!mounted) return;

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Clear form
        _nameController.clear();
        _emailController.clear();
        _subjectController.clear();
        _messageController.clear();

        await _showDialog(
          'Message Sent!',
          "We've received your message and will get back to you within 24–48 hours. A confirmation has been sent to your email.",
          success: true,
        );
      } else {
        await _showDialog(
          'Could Not Send',
          'We encountered an error while sending your message. Please try again later. If the issue persists, please contact us.',
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final apiService = ref.read(apiServiceProvider);
      final appEx = apiService.mapDioError(e);
      AppLogger.eWithContext(
        'ContactScreen: Contact form request failed',
        error: e,
        stackTrace: e.stackTrace,
        tags: {
          'feature': 'contact',
          'action': 'submit_contact',
        },
      );
      await _showDialog(
        'Could Not Send',
        appEx.message.isNotEmpty
            ? appEx.message
            : 'We encountered an error while sending your message. Please try again later. If the issue persists, please contact us.',
      );
    } catch (e) {
      if (!mounted) return;
      AppLogger.e('ContactScreen: Unexpected contact form failure', e);
      await _showDialog(
        'Could Not Send',
        'We encountered an unexpected error while sending your message. Please try again later. If the issue persists, please contact us.',
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  // ─── Form Field ───────────────────────────────────────────────────────────────

  Widget _field({
    required String label,
    required TextEditingController controller,
    required String hint,
    TextInputType keyboardType = TextInputType.text,
    TextInputAction action = TextInputAction.next,
    int maxLines = 1,
    Iterable<String>? autofillHints,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85),
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          textInputAction: action,
          maxLines: maxLines,
          autofillHints: autofillHints,
          style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurface),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
            contentPadding: EdgeInsets.symmetric(
              horizontal: 16,
              vertical: maxLines > 1 ? 14 : 13,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha:0.1),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.5),
            ),
            filled: true,
            fillColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.04),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Scaffold(
      body: GestureDetector(
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: 160,
              backgroundColor: Theme.of(context).scaffoldBackgroundColor,
              surfaceTintColor: Colors.transparent,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 16),
                onPressed: () => Navigator.of(context).pop(),
              ),
              flexibleSpace: FlexibleSpaceBar(
                collapseMode: CollapseMode.parallax,
                background: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [primary.withValues(alpha: 0.12), Colors.transparent],
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 48, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF7C3AED).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          LucideIcons.send,
                          color: primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Contact Us',
                        style: GoogleFonts.manrope(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(context).colorScheme.onSurface,
                          letterSpacing: -0.6,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  Text(
                    "Our team is happy to help. Fill in the form below and we'll get back to you within 24–48 hours.",
                    style: TextStyle(
                      fontSize: 13,
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  _field(
                    label: 'Name',
                    controller: _nameController,
                    hint: 'Your full name',
                    autofillHints: [AutofillHints.name],
                  ),
                  _field(
                    label: 'Email',
                    controller: _emailController,
                    hint: 'cooked_fr@attendance.edu',
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: [AutofillHints.email],
                  ),
                  _field(
                    label: 'Subject',
                    controller: _subjectController,
                    hint: 'How can we help?',
                  ),
                  _field(
                    label: 'Message',
                    controller: _messageController,
                    hint: 'Describe your issue or question...',
                    keyboardType: TextInputType.multiline,
                    action: TextInputAction.newline,
                    maxLines: 5,
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _sending ? null : _handleSend,
                      icon: _sending
                        ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                        : const Icon(LucideIcons.send, size: 15),
                      label: Text(_sending ? 'Sending...' : 'Send Message'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: primary.withValues(alpha: 0.5),
                        disabledForegroundColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        textStyle: GoogleFonts.manrope(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
