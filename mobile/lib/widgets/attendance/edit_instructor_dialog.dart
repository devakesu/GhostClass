import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class EditInstructorDialog extends ConsumerStatefulWidget {
  const EditInstructorDialog({
    required this.courseCode,
    required this.courseName,
    super.key,
    this.initialName,
    this.className,
  });
  final String courseCode;
  final String courseName;
  final String? initialName;
  final String? className;

  @override
  ConsumerState<EditInstructorDialog> createState() =>
      _EditInstructorDialogState();
}

class _EditInstructorDialogState extends ConsumerState<EditInstructorDialog> {
  late final TextEditingController _controller;
  bool _isSaving = false;
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialName);
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    final name = utils.toTitleCase(_controller.text.trim());
    if (name.isEmpty) return;
    if (name.length > 60) return;

    setState(() => _isSaving = true);

    try {
      final academic = ref.read(academicProvider).value;
      final auth = ref.read(authProvider).value;
      if (academic == null || auth == null) throw Exception('Missing context');

      final client = supabase.Supabase.instance.client;

      await client.from('course_instructors').upsert({
        'class_id': auth.profile?.classField?.id,
        'course_code': widget.courseCode.toUpperCase().replaceAll(' ', ''),
        'semester': academic.semester,
        'academic_year': academic.year,
        'instructor_name': name,
        'updated_by': auth.supabaseUserId,
      }, onConflict: 'class_id, course_code, semester, academic_year');

      // Refresh dashboard to show new name
      await ref.read(dashboardProvider.notifier).refresh();

      if (mounted) Navigator.pop(context);
    } on Object catch (e, st) {
      AppLogger.eWithContext(
        'EditInstructorDialog: Save failed',
        error: e,
        stackTrace: st,
        tags: {'feature': 'attendance_instructor', 'action': 'save_instructor'},
        extras: {
          'course.code': widget.courseCode,
          'course.name': widget.courseName,
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'We encountered an error while saving the instructor. Please try again later. If the issue persists, please contact us.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;

    final hasChanged =
        _controller.text.trim() != (widget.initialName ?? '').trim();

    return Dialog(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
      elevation: 20,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(32),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header Graphic Section
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  vertical: 40,
                  horizontal: 24,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      primary.withValues(alpha: 0.1),
                      primary.withValues(alpha: 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: primary.withValues(alpha: 0.2),
                            blurRadius: 20,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                      child: Icon(
                        LucideIcons.userPlus,
                        size: 36,
                        color: primary,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Edit Instructor',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                        letterSpacing: -0.5,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${widget.courseCode} — ${widget.courseName}',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4),
                      ),
                    ),
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Accuracy Matters Alert
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: (ghostColors?.accentOrange ?? Colors.orange)
                            .withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: (ghostColors?.accentOrange ?? Colors.orange)
                              .withValues(alpha: 0.1),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(
                              LucideIcons.alertCircle,
                              color: ghostColors?.accentOrange ?? Colors.orange,
                              size: 18,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ACCURACY MATTERS',
                                  style: GoogleFonts.manrope(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w900,
                                    color:
                                        ghostColors?.accentOrange ??
                                        Colors.orange,
                                    letterSpacing: 1,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'This name is shared with your entire class${widget.className != null ? " ${widget.className}" : ""}. Please ensure it is accurate and respectful.',
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface
                                        .withValues(alpha: 0.5),
                                    fontWeight: FontWeight.w600,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),

                    Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextFormField(
                            controller: _controller,
                            maxLength: 60,
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700,
                            ),
                            autovalidateMode:
                                AutovalidateMode.onUserInteraction,
                            decoration: InputDecoration(
                              labelText: 'Instructor Name',
                              hintText: 'e.g. Dr. Jane Smith',
                              counterText: '',
                              prefixIcon: Icon(
                                LucideIcons.user,
                                size: 20,
                                color: Theme.of(
                                  context,
                                ).colorScheme.primary.withValues(alpha: 0.6),
                              ),
                              labelStyle: GoogleFonts.manrope(
                                fontWeight: FontWeight.w600,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.4),
                              ),
                              floatingLabelStyle: GoogleFonts.manrope(
                                fontWeight: FontWeight.w800,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide(
                                  color:
                                      Theme.of(
                                        context,
                                      ).colorScheme.onSurface.withValues(
                                        alpha: 0.1,
                                      ),
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide(
                                  color: Theme.of(context).colorScheme.primary,
                                  width: 2,
                                ),
                              ),
                              filled: true,
                              fillColor: Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.02),
                            ),
                            validator: (val) {
                              if (val == null || val.trim().isEmpty) {
                                return 'Required';
                              }
                              if (!RegExp(
                                r'^[a-zA-Z\s.]+$',
                              ).hasMatch(val.trim())) {
                                return 'Letters, spaces, and dots only';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 32),
                          Row(
                            children: [
                              Expanded(
                                child: TextButton(
                                  onPressed: _isSaving
                                      ? null
                                      : () => Navigator.pop(context),
                                  style: TextButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  child: Text(
                                    'CANCEL',
                                    style: GoogleFonts.manrope(
                                      fontWeight: FontWeight.w800,
                                      color:
                                          Theme.of(
                                            context,
                                          ).colorScheme.onSurface.withValues(
                                            alpha: 0.4,
                                          ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                flex: 2,
                                child: ElevatedButton(
                                  onPressed: (_isSaving || !hasChanged)
                                      ? null
                                      : () {
                                          if (_formKey.currentState
                                                  ?.validate() ??
                                              false) {
                                            final _ = _handleSave();
                                          }
                                        },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: primary,
                                    foregroundColor: Colors.white,
                                    elevation: 8,
                                    shadowColor: primary.withValues(alpha: 0.4),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  child: _isSaving
                                      ? const SizedBox(
                                          height: 20,
                                          width: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : Text(
                                          'SAVE CHANGES',
                                          style: GoogleFonts.manrope(
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
