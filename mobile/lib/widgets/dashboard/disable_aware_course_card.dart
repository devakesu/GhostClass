import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/models/course_instructor.dart';
import 'package:ghostclass/models/dashboard_stats.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/dashboard/course_card.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';

class DisableAwareCourseCard extends ConsumerStatefulWidget {

  const DisableAwareCourseCard({
    required this.course, required this.stat, required this.bunkResult, required this.bunkEnabled, required this.selectedSemester, required this.selectedYear, required this.instructors, this.className, super.key,
  });
  final CourseDetails course;
  final CourseStat stat;
  final utils.AttendanceResult bunkResult;
  final bool bunkEnabled;
  final String selectedSemester;
  final String selectedYear;
  final List<CourseInstructor> instructors;
  final String? className;

  @override
  ConsumerState<DisableAwareCourseCard> createState() =>
      _DisableAwareCourseCardState();
}

class _DisableAwareCourseCardState
    extends ConsumerState<DisableAwareCourseCard> {
  String? get _courseCode => widget.course.code?.toUpperCase();

  String? get _semesterKey {
    if (widget.selectedSemester.isEmpty || widget.selectedYear.isEmpty) {
      return null;
    }
    return '${widget.selectedYear}-${widget.selectedSemester}';
  }

  bool get _isDisabled {
    final semKey = _semesterKey;
    final code = _courseCode;
    if (semKey == null || code == null) return false;
    final disabled =
        ref.read(authProvider).value?.settings.disabledCourses[semKey] ?? {};
    final stdCode = DashboardStats.standardize(code);
    return disabled.keys.any((key) => DashboardStats.standardize(key) == stdCode);
  }

  String? get _disableReason {
    final semKey = _semesterKey;
    final code = _courseCode;
    if (semKey == null || code == null) return null;
    final disabled =
        ref.read(authProvider).value?.settings.disabledCourses[semKey] ?? {};
    for (final entry in disabled.entries) {
      if (entry.key.toUpperCase() == code) {
        return entry.value;
      }
    }
    return null;
  }

  static const List<String> _disableReasons = [
    'Challenge passed',
    'Course not offered this semester',
    'Already completed/Exempted',
    'External/Non-Portal course',
    'Incorrectly imported',
    'Dropped course',
    'Other',
  ];

  Future<void> _disableCourse(String reason) async {
    final currentUser = ref.read(authProvider).value;
    final semKey = _semesterKey;
    final code = _courseCode;
    if (currentUser == null || semKey == null || code == null) {
      throw Exception('Semester context not loaded yet. Please try again.');
    }

    final nextDisabled = <String, Map<String, String>>{};
    for (final entry in currentUser.settings.disabledCourses.entries) {
      nextDisabled[entry.key] = Map<String, String>.from(entry.value);
    }
    nextDisabled.putIfAbsent(semKey, () => <String, String>{});
    nextDisabled[semKey]![code] = reason;

    await ref
        .read(authProvider.notifier)
        .updateSettings(disabledCourses: nextDisabled);
  }

  Future<void> _enableCourse() async {
    final currentUser = ref.read(authProvider).value;
    final semKey = _semesterKey;
    final code = _courseCode;
    if (currentUser == null || semKey == null || code == null) {
      throw Exception('Semester context not loaded yet. Please try again.');
    }

    final nextDisabled = <String, Map<String, String>>{};
    for (final entry in currentUser.settings.disabledCourses.entries) {
      nextDisabled[entry.key] = Map<String, String>.from(entry.value);
    }

    final semesterMap = nextDisabled[semKey];
    if (semesterMap != null) {
      final keys = semesterMap.keys.toList();
      for (final key in keys) {
        if (key == code) {
          semesterMap.remove(key);
        }
      }
      if (semesterMap.isEmpty) {
        nextDisabled.remove(semKey);
      }
    }

    await ref
        .read(authProvider.notifier)
        .updateSettings(disabledCourses: nextDisabled);
  }

  Future<void> _showDisableDialog() async {
    final code = _courseCode;
    if (code == null) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return DisableDialogContent(
          courseCode: code,
          semesterKey: _semesterKey,
          onDisable: _disableCourse,
          reasons: _disableReasons,
        );
      },
    );
  }

  Future<void> _showEnableDialog() async {
    final code = _courseCode;
    if (code == null) return;
    var isSaving = false;
    final reason = _disableReason ?? 'N/A';

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              backgroundColor: Theme.of(context).colorScheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              title: Text(
                'Enable $code?',
                style: GoogleFonts.manrope(
                  color: Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w900,
                ),
              ),
              content: Text.rich(
                TextSpan(
                  style: GoogleFonts.manrope(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.7),
                    height: 1.4,
                  ),
                  children: [
                    const TextSpan(
                      text: 'This course was disabled with reason: ',
                    ),
                    TextSpan(
                      text: '"$reason".',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const TextSpan(
                      text:
                          ' Enabling it will include it back in your total attendance calculations.',
                    ),
                  ],
                ),
              ),
              actionsPadding: const EdgeInsets.only(right: 16, bottom: 16),
              actions: [
                TextButton(
                  onPressed: isSaving
                      ? null
                      : () => Navigator.pop(dialogContext),
                  child: Text(
                    'CANCEL',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                  ),
                ),
                ElevatedButton(
                  onPressed: isSaving || _semesterKey == null
                      ? null
                      : () async {
                          setDialogState(() => isSaving = true);
                          try {
                            await _enableCourse();
                            if (!mounted) return;
                            if (!dialogContext.mounted) return;
                            Navigator.pop(dialogContext);
                            ServiceToast.show(context, '$code enabled');
                          } on Object catch (e) {
                            if (!mounted) return;
                            if (dialogContext.mounted) {
                              setDialogState(() => isSaving = false);
                              ServiceToast.show(
                                context,
                                'Failed: $e',
                                isError: true,
                              );
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor:
                        Theme.of(
                          context,
                        ).extension<GhostColors>()?.successGreen ??
                        Colors.green,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: isSaving
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          'ENABLE',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(authProvider);
    return Opacity(
      opacity: _isDisabled ? 0.62 : 1,
      child: CourseCard(
        course: widget.course,
        stat: widget.stat,
        bunkResult: widget.bunkResult,
        bunkEnabled: widget.bunkEnabled,
        isEnabled: !_isDisabled,
        onToggleTap: _courseCode == null
            ? null
            : () async {
                if (_isDisabled) {
                  await _showEnableDialog();
                } else {
                  await _showDisableDialog();
                }
              },
        instructors: widget.instructors,
        className: widget.className,
      ),
    );
  }
}

class DisableDialogContent extends StatefulWidget {

  const DisableDialogContent({
    required this.courseCode, required this.semesterKey, required this.reasons, required this.onDisable, super.key,
  });
  final String courseCode;
  final String? semesterKey;
  final List<String> reasons;
  final Future<void> Function(String reason) onDisable;

  @override
  State<DisableDialogContent> createState() => _DisableDialogContentState();
}

class _DisableDialogContentState extends State<DisableDialogContent> {
  late String selectedReason;
  late final TextEditingController customController;
  bool isSaving = false;

  @override
  void initState() {
    super.initState();
    selectedReason = widget.reasons.first;
    customController = TextEditingController();
  }

  @override
  void dispose() {
    customController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isOtherReason = selectedReason == 'Other';
    final ghostColors = Theme.of(context).extension<GhostColors>()!;

    return AlertDialog(
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: Text(
        'Disable ${widget.courseCode}?',
        style: GoogleFonts.manrope(
          color: Theme.of(context).colorScheme.onSurface,
          fontWeight: FontWeight.w900,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Disabling this course will exclude it from your total attendance, stat cards, and the attendance chart. It will still appear on the course grid and calendar.',
            style: GoogleFonts.manrope(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.7),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Reason',
            style: GoogleFonts.manrope(
              color: Theme.of(context).colorScheme.onSurface,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: selectedReason,
            dropdownColor: Theme.of(context).colorScheme.surface,
            decoration: InputDecoration(
              filled: true,
              fillColor: Theme.of(
                context,
              ).colorScheme.secondaryContainer.withValues(alpha: 0.5),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
            style: GoogleFonts.manrope(
              color: Theme.of(context).colorScheme.onSurface,
            ),
            items: widget.reasons
                .map(
                  (reason) => DropdownMenuItem<String>(
                    value: reason,
                    child: Text(reason),
                  ),
                )
                .toList(),
            onChanged: isSaving
                ? null
                : (value) {
                    if (value == null) return;
                    setState(() {
                      selectedReason = value;
                      if (value != 'Other') {
                        customController.clear();
                      }
                    });
                  },
          ),
          if (isOtherReason) ...[
            const SizedBox(height: 12),
            TextField(
              controller: customController,
              autofocus: true,
              style: GoogleFonts.manrope(
                color: Theme.of(context).colorScheme.onSurface,
              ),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Enter your reason',
                hintStyle: GoogleFonts.manrope(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.3),
                ),
                filled: true,
                fillColor: Theme.of(
                  context,
                ).colorScheme.secondaryContainer.withValues(alpha: 0.5),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ],
      ),
      actionsPadding: const EdgeInsets.only(right: 16, bottom: 16),
      actions: [
        TextButton(
          onPressed: isSaving ? null : () => Navigator.pop(context),
          child: Text(
            'CANCEL',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w800,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
        ),
        ElevatedButton(
          onPressed:
              isSaving ||
                  widget.semesterKey == null ||
                  (isOtherReason && customController.text.trim().isEmpty)
              ? null
              : () async {
                  final reason = isOtherReason
                      ? customController.text.trim()
                      : selectedReason;
                  setState(() => isSaving = true);
                  try {
                    await widget.onDisable(reason);
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    ServiceToast.show(
                      context,
                      '${widget.courseCode} disabled: $reason',
                    );
                  } on Object catch (e, st) {
                    AppLogger.eWithContext(
                      'DisableAwareCourseCard: Disable action failed',
                      error: e,
                      stackTrace: st,
                      tags: {
                        'feature': 'attendance_course',
                        'action': 'disable_course',
                      },
                      extras: {
                        'course.code': widget.courseCode,
                        'semester.key': widget.semesterKey,
                      },
                    );
                    if (!context.mounted) return;
                    setState(() => isSaving = false);
                    ServiceToast.show(
                      context,
                      'We encountered an error while disabling this course. Please try again later. If the issue persists, please contact us.',
                      isError: true,
                    );
                  }
                },
          style: ElevatedButton.styleFrom(
            backgroundColor: ghostColors.dangerRed ?? Colors.red,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: isSaving
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Text(
                  'DISABLE',
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                ),
        ),
      ],
    );
  }
}
