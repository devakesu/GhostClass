import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class AddCourseDialog extends ConsumerStatefulWidget {
  const AddCourseDialog({super.key});

  @override
  ConsumerState<AddCourseDialog> createState() => _AddCourseDialogState();
}

class _AddCourseDialogState extends ConsumerState<AddCourseDialog> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _codeController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    try {
      final auth = ref.read(authProvider).value;
      if (auth?.profile?.classField?.id == null) throw Exception('Class context not found');

      final client = supabase.Supabase.instance.client;
      
      final code = _codeController.text.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
      final name = utils.toTitleCase(_nameController.text.trim());

      final dashboard = ref.read(dashboardProvider).value;
      if (dashboard == null) throw Exception('Dashboard data not available');

      await client.from('class_courses').insert({
        'class_id': auth!.profile!.classField!.id,
        'course_code': code,
        'course_name': name,
        'academic_year': dashboard.selectedYear,
        'semester': dashboard.selectedSemester,
        'created_by': auth.supabaseUserId,
      });

      // Refresh dashboard
      await ref.read(dashboardProvider.notifier).refresh();
      
      if (mounted) Navigator.pop(context);
    } catch (e, st) {
      AppLogger.eWithContext(
        'AddCourseDialog: Save failed',
        error: e,
        stackTrace: st,
        tags: {
          'feature': 'attendance_course',
          'action': 'add_course',
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'We encountered an error while adding the course. Please try again later. If the issue persists, please contact us.',
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
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;

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
                padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
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
                      child: Icon(LucideIcons.library, size: 36, color: primary),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Add Shared Course',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                        letterSpacing: -0.5,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ref.watch(dashboardProvider).when(
                          data: (dash) => Text(
                            'Adding this course will make it available to everyone in ${ref.watch(authProvider).value?.profile?.classField?.name ?? 'your class'} for the ${dash.selectedSemester.toUpperCase()} ${dash.selectedYear} semester.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.manrope(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                              height: 1.5,
                            ),
                          ),
                          loading: () => const SizedBox(
                            width: 100,
                            child: LinearProgressIndicator(minHeight: 2),
                          ),
                          error: (_, _) => const Text('Expand your class curriculum.'),
                        ),
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      // Accuracy Matters Alert
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: (ghostColors?.accentOrange ?? Colors.orange).withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: (ghostColors?.accentOrange ?? Colors.orange).withValues(alpha: 0.1),
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
                                      color: ghostColors?.accentOrange ?? Colors.orange,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Please enter valid course data. It helps your classmates stay organized.',
                                    style: GoogleFonts.manrope(
                                      fontSize: 12,
                                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
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
                      
                      _DialogTextField(
                        controller: _codeController,
                        label: 'Course Code',
                        hint: 'e.g. CS101',
                        icon: LucideIcons.hash,
                        maxLength: 10,
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) return 'Required';
                          final clean = val.trim().replaceAll(RegExp(r'\s+'), '');
                          if (clean.length < 2) return 'Too short';
                          if (!RegExp(r'^[a-zA-Z0-9]+$').hasMatch(clean)) {
                            return 'Alphanumeric only';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 20),
                      _DialogTextField(
                        controller: _nameController,
                        label: 'Course Name',
                        hint: 'e.g. Intro to Algorithms',
                        icon: LucideIcons.bookOpen,
                        maxLength: 60,
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) return 'Required';
                          if (val.trim().length < 3) return 'Too short';
                          if (!RegExp(r'^[a-zA-Z0-9\s]+$').hasMatch(val.trim())) {
                            return 'Alphanumeric and spaces only';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 32),
                      
                      Row(
                        children: [
                          Expanded(
                            child: TextButton(
                              onPressed: _isSaving ? null : () => Navigator.pop(context),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: Text(
                                'CANCEL',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w800,
                                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              onPressed: _isSaving ? null : _handleSave,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: primary,
                                foregroundColor: Colors.white,
                                elevation: 8,
                                shadowColor: primary.withValues(alpha: 0.4),
                                padding: const EdgeInsets.symmetric(vertical: 16),
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
                                    'ADD COURSE',
                                    style: GoogleFonts.manrope(fontWeight: FontWeight.w900),
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DialogTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final int maxLength;
  final String? Function(String?)? validator;

  const _DialogTextField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    required this.maxLength,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      maxLength: maxLength,
      style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        counterText: '',
        prefixIcon: Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.6)),
        labelStyle: GoogleFonts.manrope(fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)),
        floatingLabelStyle: GoogleFonts.manrope(fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Theme.of(context).colorScheme.error.withValues(alpha: 0.4)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Theme.of(context).colorScheme.error, width: 2),
        ),
        filled: true,
        fillColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.02),
      ),
      validator: validator,
    );
  }
}
