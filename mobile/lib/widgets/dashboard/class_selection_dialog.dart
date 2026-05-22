import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ClassSelectionDialog extends ConsumerStatefulWidget {
  const ClassSelectionDialog({super.key});

  @override
  ConsumerState<ClassSelectionDialog> createState() =>
      _ClassSelectionDialogState();
}

class _ClassSelectionDialogState extends ConsumerState<ClassSelectionDialog> {
  String? _selectedClassId;
  String? _selectedClassName;
  late final List<Map<String, dynamic>> _classes = [];

  bool _isLoadingClasses = false;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetchClasses());
  }

  Future<void> _fetchClasses() async {
    setState(() {
      _isLoadingClasses = true;
      _errorMessage = null;
    });

    try {
      final academic = ref.read(academicProvider).value;
      final currentSemester = academic?.semester ?? '';
      final currentYear = academic?.year ?? '';

      final response = await Supabase.instance.client
          .from('classes')
          .select('id, name')
          .eq('sem', currentSemester)
          .eq('year', currentYear)
          .order('name', ascending: true);

      final rawList = response as List<dynamic>;
      final parsedClasses = rawList
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      setState(() {
        _classes
          ..clear()
          ..addAll(parsedClasses);
        _isLoadingClasses = false;
        if (parsedClasses.isEmpty) {
          _errorMessage =
              'No classes found in the database for the current term ($currentSemester $currentYear).';
        }
      });
    } on Object catch (e, st) {
      AppLogger.e('ClassSelectionDialog: Fetching classes failed', e, st);
      setState(() {
        _errorMessage = 'Failed to load classes. Please try again.';
        _isLoadingClasses = false;
      });
    }
  }

  Future<void> _handleConfirm() async {
    if (_selectedClassId == null) return;

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final supabaseToken =
          Supabase.instance.client.auth.currentSession?.accessToken;
      if (supabaseToken == null) {
        throw Exception('Session expired. Please log in again.');
      }

      final api = ref.read(apiServiceProvider);
      final response = await api.updateProfile(supabaseToken, {
        'class_id': _selectedClassId,
      });

      if (response.statusCode != 200) {
        throw Exception(response.statusMessage ?? 'Failed to update profile.');
      }

      await ref.read(authProvider.notifier).syncProfile();

      if (mounted) {
        Navigator.of(context).pop();
        ServiceToast.show(context, 'Class assigned successfully! 🎓');
      }
    } on Object catch (e, st) {
      AppLogger.e('ClassSelectionDialog: Save failed', e, st);
      setState(() {
        _errorMessage = formatApiError(e, 'class selection');
        _isSaving = false;
      });
    }
  }

  Future<void> _showClassPicker() async {
    if (_classes.isEmpty) return;

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.6,
          ),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Select Class',
                style: GoogleFonts.manrope(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Divider(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.05),
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  itemCount: _classes.length,
                  itemBuilder: (context, index) {
                    final item = _classes[index];
                    final classId = item['id']?.toString() ?? '';
                    final className =
                        item['name']?.toString() ?? 'Unnamed Class';
                    final isSelected = classId == _selectedClassId;

                    return ListTile(
                      title: Text(
                        className,
                        style: GoogleFonts.manrope(
                          fontWeight: isSelected
                              ? FontWeight.w800
                              : FontWeight.w600,
                          color: isSelected
                              ? Theme.of(context).colorScheme.primary
                              : null,
                        ),
                      ),
                      trailing: isSelected
                          ? Icon(
                              LucideIcons.check,
                              color: Theme.of(context).colorScheme.primary,
                            )
                          : null,
                      onTap: () {
                        setState(() {
                          _selectedClassId = classId;
                          _selectedClassName = className;
                        });
                        Navigator.pop(ctx);
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final surfaceColor = Theme.of(context).colorScheme.surface;
    final primaryColor = Theme.of(context).colorScheme.primary;
    final onSurfaceColor = Theme.of(context).colorScheme.onSurface;

    return PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 400),
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: surfaceColor,
            borderRadius: BorderRadius.circular(32),
            border: Border.all(
              color: onSurfaceColor.withValues(alpha: 0.08),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.4),
                blurRadius: 40,
                spreadRadius: 10,
                offset: const Offset(0, 20),
              ),
            ],
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: primaryColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    LucideIcons.graduationCap,
                    color: primaryColor,
                    size: 32,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Select Your Class',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: onSurfaceColor,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Before you can access the dashboard or track attendance, please assign your academic class cohort.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    color: onSurfaceColor.withValues(alpha: 0.7),
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 24),
                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).colorScheme.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          LucideIcons.alertCircle,
                          color: Theme.of(context).colorScheme.error,
                          size: 18,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: GoogleFonts.manrope(
                              fontSize: 12,
                              color: Theme.of(context).colorScheme.error,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                InkWell(
                  onTap: _isLoadingClasses || _isSaving
                      ? null
                      : _showClassPicker,
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: onSurfaceColor.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: onSurfaceColor.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(LucideIcons.users, size: 18, color: primaryColor),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _isLoadingClasses
                                ? 'Loading classes...'
                                : (_selectedClassName != null
                                      ? _selectedClassName!
                                      : 'Select Class'),
                            style: GoogleFonts.manrope(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: _selectedClassName != null
                                  ? onSurfaceColor
                                  : onSurfaceColor.withValues(alpha: 0.4),
                            ),
                          ),
                        ),
                        if (_isLoadingClasses)
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        else
                          Icon(
                            LucideIcons.chevronDown,
                            size: 16,
                            color: onSurfaceColor.withValues(alpha: 0.4),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    'If your class is not listed, please wait until someone else in your class syncs it or until EzyGo is initialized.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      color: onSurfaceColor.withValues(alpha: 0.72),
                      height: 1.4,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _selectedClassId == null || _isSaving
                        ? null
                        : _handleConfirm,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryColor,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    child: _isSaving
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(
                            'Confirm & Proceed',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _isSaving
                      ? null
                      : () async {
                          await ref.read(authProvider.notifier).logout();
                          if (context.mounted) {
                            Navigator.of(context).pop();
                          }
                        },
                  style: TextButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: Text(
                    'Logout',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
