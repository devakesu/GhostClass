import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';

class AddAttendanceDialog extends ConsumerStatefulWidget {
  const AddAttendanceDialog({super.key});

  @override
  ConsumerState<AddAttendanceDialog> createState() =>
      _AddAttendanceDialogState();
}

class _AddAttendanceDialogState extends ConsumerState<AddAttendanceDialog> {
  DateTime _selectedDate = DateTime.now();
  String? _selectedSession;
  String? _selectedCourseId;
  String _status = 'Present'; // Present, Absent, Duty Leave
  final TextEditingController _reasonController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _sessions = ['1', '2', '3', '4', '5', '6', '7'];

  String _canonicalTrackerCourseCode(CourseDetails course) {
    final code = course.code?.trim();
    final source = (code != null && code.isNotEmpty) ? code : course.safeId;
    return source.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  }

  @override
  void initState() {
    super.initState();
    // Initial prefill logic will be handled after build or via a post-frame callback
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _prefillDefaults();
    });
  }

  void _prefillDefaults() {
    final dashboardAsync = ref.read(dashboardProvider);
    if (dashboardAsync.value == null) return;
    final data = dashboardAsync.value!;

    // Academic Range Clamping (Single-Semester Enforcement)
    final academicAsync = ref.read(academicProvider);
    final academic = academicAsync.value;
    final startDate = academic?.startDate ?? DateTime(2020);
    final endDate = academic?.endDate ?? DateTime(2030);

    if (_selectedDate.isBefore(startDate)) {
      setState(() => _selectedDate = startDate);
    } else if (_selectedDate.isAfter(endDate)) {
      setState(() => _selectedDate = endDate);
    }

    final dateKey = DateFormat('yyyyMMdd').format(_selectedDate);

    // 1. Find occupied sessions
    final occupiedSessions = <String>{};

    // Official data
    final officialDay = data.attendance.studentAttendanceData[dateKey];
    if (officialDay != null) {
      officialDay.forEach((key, sessionObj) {
        if (sessionObj.course != null && sessionObj.course != 0) {
          final sessionName = sessionObj.session?.toString() ?? key;
          occupiedSessions.add(utils.normalizeSession(sessionName));
        }
      });
    }

    // Tracking data
    final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);
    for (final record in data.tracking) {
      if (record.date == dbDate) {
        occupiedSessions.add(utils.normalizeSession(record.session));
      }
    }

    // 2. Set first free session
    final firstFree = _sessions.firstWhere(
      (s) => !occupiedSessions.contains(utils.normalizeSession(s)),
      orElse: () => '',
    );

    if (firstFree.isNotEmpty) {
      setState(() {
        _selectedSession = firstFree;
      });
      _prefillCourse(firstFree);
    }
  }

  void _prefillCourse(String session) {
    final dashboardAsync = ref.read(dashboardProvider);
    if (dashboardAsync.value == null) return;

    final data = dashboardAsync.value!;
    final dayOfWeek = _selectedDate.weekday;
    final frequencyMap = <String, int>{};
    final target = utils.normalizeSession(session);

    data.attendance.studentAttendanceData.forEach((dStr, sessions) {
      try {
        if (dStr.length != 8) return;
        final y = int.parse(dStr.substring(0, 4));
        final m = int.parse(dStr.substring(4, 6));
        final d = int.parse(dStr.substring(6, 8));
        final date = DateTime(y, m, d);
        if (date.weekday == dayOfWeek) {
          sessions.forEach((key, sessionObj) {
            if (sessionObj.course != null && sessionObj.course != 0) {
              final sessionName = sessionObj.session?.toString() ?? key;
              if (utils.normalizeSession(sessionName) == target) {
                final cid = sessionObj.course.toString();
                frequencyMap[cid] = (frequencyMap[cid] ?? 0) + 1;
              }
            }
          });
        }
      } catch (e) {
        AppLogger.w('AddAttendanceDialog: Failed to prefill course from date key', e);
      }
    });

    String? bestCourse;
    int maxCount = 0;
    frequencyMap.forEach((cid, count) {
      if (count > maxCount) {
        maxCount = count;
        bestCourse = cid;
      }
    });

    if (bestCourse != null) {
      final course = data.courses.firstWhere(
        (c) =>
            c.id.toString() == bestCourse ||
            c.code?.toUpperCase() == bestCourse?.toUpperCase(),
        orElse: () => data.courses.first,
      );

      setState(() {
        _selectedCourseId = course.safeId;
      });
    } else if (_selectedCourseId == null && data.courses.isNotEmpty) {
      // Fallback to the first available course if no best match is found
      setState(() {
        _selectedCourseId = data.courses.first.safeId;
      });
    }
  }

  bool _isSessionBlocked() {
    if (_selectedSession == null) return false;

    final dashboardAsync = ref.read(dashboardProvider).value;
    if (dashboardAsync == null) return false;

    final target = utils.normalizeSession(_selectedSession!);
    final dateKey = DateFormat('yyyyMMdd').format(_selectedDate);
    final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);

    // Official Check
    final officialDay =
        dashboardAsync.attendance.studentAttendanceData[dateKey];
    if (officialDay != null) {
      for (var entry in officialDay.entries) {
        final sessionObj = entry.value;
        if (sessionObj.course != null && sessionObj.course != 0) {
          final sessionName = sessionObj.session?.toString() ?? entry.key;
          if (utils.normalizeSession(sessionName) == target) return true;
        }
      }
    }

    // Tracking Check
    for (final record in dashboardAsync.tracking) {
      if (record.date == dbDate &&
          utils.normalizeSession(record.session) == target) {
        return true;
      }
    }

    return false;
  }

  Future<void> _handleSubmit() async {
    if (_selectedCourseId == null || _selectedSession == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please fill all fields')));
      return;
    }

    if (_isSessionBlocked()) {
      ServiceToast.show(
        context,
        'This session is already marked!',
        isError: true,
      );
      return;
    }

    final data = ref.read(dashboardProvider).value;
    if (data == null) return;

    setState(() => _isSubmitting = true);

    int loggedAttendanceCode = 110;
    String loggedTrackerCourseCode = '';

    try {
      int attCode = 110; // Present
      if (_status == 'Absent') attCode = 111;
      if (_status == 'Duty Leave') attCode = 225;
      loggedAttendanceCode = attCode;

      final sanitizedReason = _reasonController.text.trim().substring(
        0,
        _reasonController.text.trim().length > 255
            ? 255
            : _reasonController.text.trim().length,
      );

      final remarks = _status == 'Duty Leave'
          ? (sanitizedReason.isEmpty ? 'Duty Leave' : sanitizedReason)
          : sanitizedReason;

      // Extract the actual ID (Safe ID for custom courses)
      final data = ref.read(dashboardProvider).value;
      if (data == null) return;

      final matchingCourse = data.courses.firstWhere(
        (c) => c.safeId == _selectedCourseId,
        orElse: () => data.courses.first,
      );

      final String trackerCourseCode = _canonicalTrackerCourseCode(
        matchingCourse,
      );
      loggedTrackerCourseCode = trackerCourseCode;

      await ref
          .read(trackingProvider.notifier)
          .insertRecord(
            date: DateFormat('yyyy-MM-dd').format(_selectedDate),
            session: utils.toRoman(_selectedSession!),
            status: 'extra',
            attendance: attCode,
            courseId: trackerCourseCode,
            remarks: remarks,
          );

      // The dashboard automatically refreshes because it watches trackingProvider

      if (mounted) {
        Navigator.of(context).pop();
        ServiceToast.show(context, 'Record added successfully');
      }
    } catch (e, st) {
      AppLogger.eWithContext(
        'AddAttendanceDialog: Failed to insert record',
        error: e,
        stackTrace: st,
        tags: {
          'feature': 'attendance_tracking',
          'action': 'insert_extra_record',
        },
        extras: {
          'attendance.date': DateFormat('yyyy-MM-dd').format(_selectedDate),
          'attendance.session': utils.toRoman(_selectedSession!),
          'attendance.course_id': loggedTrackerCourseCode,
          'attendance.status': loggedAttendanceCode,
        },
      );
      if (mounted) {
        ServiceToast.show(
          context,
          'We encountered an error while adding this record. Please try again later. If the issue persists, please contact us.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dashboardAsync = ref.watch(dashboardProvider);
    final data = dashboardAsync.value;
    final blocked = _isSessionBlocked();

    final primary =
        Theme.of(context).extension<GhostColors>()?.brandPrimary ??
        Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.1),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: Theme.of(context).brightness == Brightness.dark
                    ? 0.5
                    : 0.05,
              ),
              blurRadius: 40,
              offset: const Offset(0, 20),
            ),
          ],
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(LucideIcons.plus, color: primary, size: 20),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Add Extra Class',
                        style: GoogleFonts.manrope(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                      Text(
                        'Record a custom class session',
                        style: GoogleFonts.manrope(
                          fontSize: 12,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: _isSubmitting
                        ? null
                        : () => Navigator.pop(context),
                    icon: Icon(
                      LucideIcons.x,
                      color: _isSubmitting
                          ? Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.1)
                          : Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.4),
                      size: 20,
                    ),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    splashRadius: 20,
                  ),
                ],
              ),
              const SizedBox(height: 32),

              // Date Picker
              _buildLabel('Date'),
              GestureDetector(
                onTap: () async {
                  final academicAsync = ref.read(academicProvider);
                  final academic = academicAsync.value;
                  final startDate = academic?.startDate ?? DateTime(2020);
                  final endDate = academic?.endDate ?? DateTime(2030);

                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _selectedDate.isBefore(startDate)
                        ? startDate
                        : (_selectedDate.isAfter(endDate)
                              ? endDate
                              : _selectedDate),
                    firstDate: startDate,
                    lastDate: endDate,
                    builder: (context, child) {
                      return Theme(
                        data: Theme.of(context).copyWith(
                          colorScheme: Theme.of(context).colorScheme.copyWith(
                            primary: primary,
                            surface: Theme.of(context).colorScheme.surface,
                            onSurface: Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null) {
                    setState(() => _selectedDate = picked);
                    _prefillDefaults();
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: surface.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.1),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        LucideIcons.calendar,
                        size: 18,
                        color: Colors.grey,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        DateFormat('MMMM d, yyyy').format(_selectedDate),
                        style: GoogleFonts.manrope(
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Session Picker
              _buildLabel('Session'),
              DropdownButtonFormField<String>(
                key: ValueKey('session_$_selectedSession'),
                initialValue: _selectedSession,
                dropdownColor: Theme.of(context).colorScheme.surface,
                decoration: _inputDecoration(LucideIcons.clock),
                style: GoogleFonts.manrope(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                items: _sessions.map((s) {
                  return DropdownMenuItem(
                    value: s,
                    child: Text(utils.formatSessionName(s)),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedSession = val);
                    _prefillCourse(val);
                  }
                },
              ),
              if (blocked)
                Padding(
                  padding: const EdgeInsets.only(top: 6, left: 4),
                  child: Text(
                    'Session occupied',
                    style: GoogleFonts.manrope(
                      color: Colors.redAccent,
                      fontSize: 11,
                    ),
                  ),
                ),
              const SizedBox(height: 20),

              // Subject Picker
              _buildLabel('Subject'),
              DropdownButtonFormField<String>(
                key: ValueKey('course_$_selectedCourseId'),
                initialValue: _selectedCourseId,
                isExpanded: true,
                dropdownColor: Theme.of(context).colorScheme.surface,
                decoration: _inputDecoration(LucideIcons.bookOpen),
                style: GoogleFonts.manrope(
                  color: Theme.of(context).colorScheme.onSurface,
                  fontSize: 13,
                ),
                items: data?.courses.map((c) {
                  final stdCode = utils.standardizeCourseCode(
                    c.code ?? c.id.toString(),
                  );
                  final isDisabled = data.disabledCodes.contains(stdCode);

                  return DropdownMenuItem(
                    value: c.safeId,
                    child: Text(
                      '${c.name}${isDisabled ? ' (Disabled)' : ''}',
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        color: isDisabled
                            ? Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.4)
                            : Theme.of(context).colorScheme.onSurface,
                        fontStyle: isDisabled
                            ? FontStyle.italic
                            : FontStyle.normal,
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (val) => setState(() => _selectedCourseId = val),
              ),
              const SizedBox(height: 24),

              // Status (Radio Group)
              _buildLabel('Status'),
              Row(
                children: [
                  _statusButton('Present', Colors.greenAccent),
                  const SizedBox(width: 10),
                  _statusButton('Absent', Colors.redAccent),
                  const SizedBox(width: 10),
                  _statusButton('Duty Leave', Colors.amberAccent, label: 'DL'),
                ],
              ),
              const SizedBox(height: 20),

              if (_status == 'Duty Leave') ...[
                _buildLabel('Reason (Optional)'),
                TextField(
                  controller: _reasonController,
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                  maxLength: 255,
                  decoration: _inputDecoration(LucideIcons.textCursor),
                ),
                const SizedBox(height: 24),
              ],

              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed:
                      (_isSubmitting ||
                          blocked ||
                          _selectedSession == null ||
                          _selectedCourseId == null)
                      ? null
                      : _handleSubmit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          'Add Record',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
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

  Widget _buildLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 4),
      child: Text(
        text.toUpperCase(),
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(IconData icon) {
    return InputDecoration(
      prefixIcon: Icon(
        icon,
        size: 18,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
      ),
      filled: true,
      fillColor: Theme.of(context).colorScheme.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color:
              Theme.of(context).extension<GhostColors>()?.brandPrimary ??
              Theme.of(context).colorScheme.primary,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  Widget _statusButton(String value, Color color, {String? label}) {
    final isSelected = _status == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _status = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? color.withValues(alpha: 0.1)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? color
                  : Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.1),
              width: 1.5,
            ),
          ),
          child: Center(
            child: Text(
              label ?? value,
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isSelected
                    ? color
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
