import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/attendance/attendance_dialog_widgets.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

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
  AttendanceStatus _status = AttendanceStatus.present;
  final TextEditingController _reasonController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _sessions = ['1', '2', '3', '4', '5', '6', '7'];
  Map<int, Map<String, Map<String, int>>>? _precomputedFrequencies;
  bool _isBlocked = false;

  @override
  void initState() {
    super.initState();
    _precomputeFrequencies();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prefillDefaults());
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  void _precomputeFrequencies() {
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final result = <int, Map<String, Map<String, int>>>{};
    data.attendance.studentAttendanceData.forEach((dStr, sessions) {
      try {
        if (dStr.length != 8) return;
        final date = DateTime(
          int.parse(dStr.substring(0, 4)),
          int.parse(dStr.substring(4, 6)),
          int.parse(dStr.substring(6, 8)),
        );
        result.putIfAbsent(date.weekday, () => {});
        final weekdayMap = result[date.weekday]!;
        var idx = 0;
        sessions.forEach((key, sessionObj) {
          if (sessionObj.course != null && sessionObj.course != 0) {
            final target = utils.normalizeSession(
              _getSessionName(data.attendance.sessions, key, sessionObj, idx),
            );
            weekdayMap.putIfAbsent(target, () => {});
            final cid = sessionObj.course.toString();
            weekdayMap[target]![cid] = (weekdayMap[target]![cid] ?? 0) + 1;
          }
          idx++;
        });
      } on Object {
        // Silently ignore malformed dates or session formats
      }
    });
    _precomputedFrequencies = result;
  }

  String _getSessionName(
    Map<String, dynamic> meta,
    String key,
    AttendanceSession obj,
    int idx,
  ) {
    final metaObj = meta[key] as Map<String, dynamic>?;
    if (metaObj?['name'] != null) return metaObj!['name'].toString();
    final sess = obj.session;
    if (sess != null && sess != 0) return sess.toString();
    final kInt = int.tryParse(key);
    return (kInt != null && kInt < 20) ? key : (idx + 1).toString();
  }

  void _prefillDefaults() {
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final academic = ref.read(academicProvider).value;
    final start = academic?.startDate ?? DateTime(2020);
    final end = academic?.endDate ?? DateTime(2030);
    if (_selectedDate.isBefore(start)) _selectedDate = start;
    if (_selectedDate.isAfter(end)) _selectedDate = end;

    final dateKey = DateFormat('yyyyMMdd').format(_selectedDate);
    final occupied = <String>{};
    final official = data.attendance.studentAttendanceData[dateKey];
    if (official != null) {
      var idx = 0;
      official.forEach((key, obj) {
        if (obj.course != null && obj.course != 0) {
          occupied.add(
            utils.normalizeSession(
              _getSessionName(data.attendance.sessions, key, obj, idx),
            ),
          );
        }
        idx++;
      });
    }
    final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);
    for (final r in data.tracking) {
      if (r.date == dbDate) occupied.add(utils.normalizeSession(r.session));
    }

    final firstFree = _sessions.firstWhere(
      (s) => !occupied.contains(utils.normalizeSession(s)),
      orElse: () => '',
    );
    setState(() => _selectedSession = firstFree.isNotEmpty ? firstFree : null);
    _updateBlockedState();
    if (firstFree.isNotEmpty) _prefillCourse(firstFree);
  }

  void _prefillCourse(String session) {
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final freq =
        _precomputedFrequencies?[_selectedDate.weekday]?[utils.normalizeSession(
          session,
        )];
    String? best;
    if (freq != null) {
      var max = 0;
      freq.forEach((cid, count) {
        if (count > max) {
          max = count;
          best = cid;
        }
      });
    }
    if (best != null) {
      final c = data.courses.firstWhere(
        (c) => c.id.toString() == best || c.code == best || c.safeId == best,
        orElse: () => data.courses.first,
      );
      setState(() => _selectedCourseId = c.safeId);
    } else if (data.courses.isNotEmpty) {
      setState(() => _selectedCourseId = data.courses.first.safeId);
    }
  }

  void _updateBlockedState() {
    if (_selectedSession == null) {
      setState(() => _isBlocked = false);
      return;
    }
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final target = utils.normalizeSession(_selectedSession);
    final dateKey = DateFormat('yyyyMMdd').format(_selectedDate);
    final official = data.attendance.studentAttendanceData[dateKey];
    var blocked = false;
    if (official != null) {
      var idx = 0;
      for (final e in official.entries) {
        if (e.value.course != null && e.value.course != 0) {
          if (utils.normalizeSession(
                _getSessionName(data.attendance.sessions, e.key, e.value, idx),
              ) ==
              target) {
            blocked = true;
            break;
          }
        }
        idx++;
      }
    }
    if (!blocked) {
      final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);
      blocked = data.tracking.any(
        (r) => r.date == dbDate && utils.normalizeSession(r.session) == target,
      );
    }
    setState(() => _isBlocked = blocked);
  }

  bool _isCourseDisabled(CourseDetails c, DashboardData? data) {
    final auth = ref.watch(authProvider).value;
    final yearSem = '${data?.selectedYear}-${data?.selectedSemester}';
    final map = auth?.settings.disabledCourses[yearSem];
    if (map == null) return false;

    final officialReport = data?.attendance;
    final displayCode = utils
        .resolveCourseDisplayCode(
          courseKey: c.safeId,
          mergedCourse: c,
          officialReport: officialReport,
        )
        ?.toUpperCase();

    return (displayCode != null && map.containsKey(displayCode)) ||
        map.containsKey(c.safeId.toUpperCase()) ||
        map.containsKey((c.code ?? '').toUpperCase());
  }

  Color _getUniformFieldColor() {
    return Theme.of(context).inputDecorationTheme.fillColor ??
        Theme.of(context).colorScheme.surface;
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(dashboardProvider).value;
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.08),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(primary),
              const SizedBox(height: 20),
              Row(
                children: [
                  Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: Text(
                      'DATE',
                      style: GoogleFonts.manrope(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.3),
                        letterSpacing: 1.5,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(child: _buildDatePicker(primary)),
                ],
              ),
              const SizedBox(height: 16),
              const AttendanceDialogLabel(text: 'Session'),
              _buildSessionSelector(primary),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    AbsorbPointer(
                      absorbing: _isBlocked,
                      child: ImageFiltered(
                        imageFilter: ImageFilter.blur(
                          sigmaX: _isBlocked ? 3 : 0,
                          sigmaY: _isBlocked ? 3 : 0,
                        ),
                        child: Opacity(
                          opacity: _isBlocked ? 0.4 : 1.0,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const AttendanceDialogLabel(text: 'Subject'),
                              _buildSubjectSelectorButton(data, primary),
                              const SizedBox(height: 20),
                              const AttendanceDialogLabel(text: 'Status'),
                              _buildStatusButtons(ghostColors),
                              const SizedBox(height: 16),
                              AttendanceDialogLabel(
                                text: _status == AttendanceStatus.dutyLeave
                                    ? 'Reason (Optional)'
                                    : 'Remarks (Optional)',
                              ),
                              _buildRemarksField(primary),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (_isBlocked)
                      Positioned.fill(
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                LucideIcons.alertCircle,
                                size: 24,
                                color: Theme.of(context).colorScheme.error,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Session occupied',
                                style: GoogleFonts.manrope(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Theme.of(context).colorScheme.error,
                                ),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Please select another period/hour',
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.7),
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              _buildSubmitButton(primary),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(Color primary) {
    return Row(
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
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Add Extra Class',
                style: GoogleFonts.manrope(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
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
        ),
        IconButton(
          onPressed: _isSubmitting ? null : () => Navigator.pop(context),
          icon: const Icon(LucideIcons.x, size: 20),
        ),
      ],
    );
  }

  Widget _buildDatePicker(Color primary) {
    final uniformColor = _getUniformFieldColor();
    return InkWell(
      onTap: () async {
        final academic = ref.read(academicProvider).value;
        final picked = await showDatePicker(
          context: context,
          initialDate: _selectedDate,
          firstDate: academic?.startDate ?? DateTime(2020),
          lastDate: academic?.endDate ?? DateTime(2030),
        );
        if (picked != null) {
          setState(() => _selectedDate = picked);
          _prefillDefaults();
        }
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: uniformColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(LucideIcons.calendar, size: 18, color: primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                DateFormat('MMMM d, yyyy').format(_selectedDate),
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionSelector(Color primary) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _sessions.map((s) {
        final isSelected = _selectedSession == s;
        final name = utils.formatSessionName(s);

        return InkWell(
          onTap: () {
            setState(() => _selectedSession = s);
            _updateBlockedState();
            _prefillCourse(s);
          },
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? primary : _getUniformFieldColor(),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isSelected
                    ? primary
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.12),
              ),
              boxShadow: isSelected && !isDark
                  ? [
                      BoxShadow(
                        color: primary.withValues(alpha: 0.25),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              name,
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                color: isSelected
                    ? Colors.white
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.8),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildSubjectSelectorButton(DashboardData? data, Color primary) {
    final profile = ref.watch(authProvider).value?.profile;
    final hasNoClass =
        profile?.classField?.id == null || profile!.classField!.id.isEmpty;
    final hasNoCourses = data == null || data.courses.isEmpty;

    if (hasNoClass || hasNoCourses) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: _getUniformFieldColor(),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(
              LucideIcons.bookOpen,
              size: 18,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.3),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'No courses available',
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.4),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(
              LucideIcons.chevronDown,
              size: 16,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.2),
            ),
          ],
        ),
      );
    }

    final selectedCourse = data.courses.firstWhere(
      (c) => c.safeId == _selectedCourseId,
      orElse: () => const CourseDetails(id: 0, name: 'Select Subject'),
    );
    final name = selectedCourse.name;
    final isDisabled = _isCourseDisabled(selectedCourse, data);

    return InkWell(
      onTap: () => _showSubjectPickerBottomSheet(data, primary),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: _getUniformFieldColor(),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(LucideIcons.bookOpen, size: 18, color: primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                isDisabled ? '$name (Disabled)' : name,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  fontStyle: isDisabled ? FontStyle.italic : FontStyle.normal,
                  color: isDisabled
                      ? Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4)
                      : Theme.of(context).colorScheme.onSurface,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(
              LucideIcons.chevronDown,
              size: 16,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ],
        ),
      ),
    );
  }

  void _showSubjectPickerBottomSheet(DashboardData? data, Color primary) {
    if (data == null || data.courses.isEmpty) return;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    AppLogger.safeUnawait(
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: Colors.transparent,
        isScrollControlled: true,
        builder: (ctx) {
          return Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.65,
            ),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
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
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    children: [
                      Icon(LucideIcons.bookOpen, color: primary, size: 20),
                      const SizedBox(width: 12),
                      Text(
                        'Select Subject',
                        style: GoogleFonts.manrope(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Divider(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                Flexible(
                  child: Scrollbar(
                    thumbVisibility: true,
                    thickness: 4,
                    radius: const Radius.circular(2),
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      itemCount: data.courses.length,
                      physics: const BouncingScrollPhysics(),
                      itemBuilder: (context, index) {
                        final c = data.courses[index];
                        final isDisabled = _isCourseDisabled(c, data);
                        final isSelected = c.safeId == _selectedCourseId;

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: InkWell(
                            onTap: () {
                              setState(() => _selectedCourseId = c.safeId);
                              Navigator.pop(ctx);
                            },
                            borderRadius: BorderRadius.circular(14),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 14,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? primary.withValues(
                                        alpha: isDark ? 0.15 : 0.1,
                                      )
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isSelected
                                      ? primary.withValues(alpha: 0.5)
                                      : Theme.of(context).colorScheme.onSurface
                                            .withValues(alpha: 0.05),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          isDisabled
                                              ? '${c.name} (Disabled)'
                                              : c.name,
                                          style: GoogleFonts.manrope(
                                            fontSize: 14,
                                            fontWeight: isSelected
                                                ? FontWeight.w800
                                                : FontWeight.w600,
                                            fontStyle: isDisabled
                                                ? FontStyle.italic
                                                : FontStyle.normal,
                                            color: isDisabled
                                                ? Theme.of(context)
                                                      .colorScheme
                                                      .onSurface
                                                      .withValues(alpha: 0.4)
                                                : (isSelected
                                                      ? primary
                                                      : Theme.of(context)
                                                            .colorScheme
                                                            .onSurface),
                                          ),
                                        ),
                                        if (c.code != null &&
                                            c.code!.isNotEmpty) ...[
                                          const SizedBox(height: 2),
                                          Text(
                                            c.code!,
                                            style: GoogleFonts.manrope(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w500,
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .onSurface
                                                  .withValues(alpha: 0.4),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  if (isSelected) ...[
                                    const SizedBox(width: 12),
                                    Icon(
                                      LucideIcons.checkCircle2,
                                      color: primary,
                                      size: 18,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          );
        },
      ).catchError(
        (Object e, StackTrace st) => AppLogger.e(
          'AddAttendanceDialog: showSubjectPickerBottomSheet failed',
          e,
          st,
        ),
      ),
    );
  }

  Widget _buildStatusButtons(GhostColors? colors) {
    return Row(
      children: [
        AttendanceStatusToggleButton(
          value: 'Present',
          isSelected: _status == AttendanceStatus.present,
          color: colors?.successGreen ?? Colors.green,
          onTap: () => setState(() => _status = AttendanceStatus.present),
        ),
        const SizedBox(width: 10),
        AttendanceStatusToggleButton(
          value: 'Absent',
          isSelected: _status == AttendanceStatus.absent,
          color: colors?.dangerRed ?? Colors.red,
          onTap: () => setState(() => _status = AttendanceStatus.absent),
        ),
        const SizedBox(width: 10),
        AttendanceStatusToggleButton(
          value: 'Duty Leave',
          label: 'DL',
          isSelected: _status == AttendanceStatus.dutyLeave,
          color: colors?.accentOrange ?? Colors.orange,
          onTap: () => setState(() => _status = AttendanceStatus.dutyLeave),
        ),
      ],
    );
  }

  Widget _buildRemarksField(Color primary) {
    return TextField(
      controller: _reasonController,
      maxLength: 255,
      style: GoogleFonts.manrope(fontSize: 13),
      decoration: InputDecoration(
        filled: true,
        fillColor: _getUniformFieldColor(),
        prefixIcon: Icon(
          LucideIcons.textCursor,
          size: 18,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
        counterStyle: const TextStyle(fontSize: 10),
      ),
    );
  }

  Widget _buildSubmitButton(Color primary) {
    final profile = ref.watch(authProvider).value?.profile;
    final hasNoClass =
        profile?.classField?.id == null || profile!.classField!.id.isEmpty;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed:
            (_isSubmitting ||
                _isBlocked ||
                _selectedSession == null ||
                _selectedCourseId == null ||
                hasNoClass)
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
            ? const CircularProgressIndicator(color: Colors.white)
            : Text(
                _isBlocked ? 'Session occupied' : 'Add Record',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
      ),
    );
  }

  Future<void> _handleSubmit() async {
    setState(() => _isSubmitting = true);
    try {
      final matchingCourse = ref
          .read(dashboardProvider)
          .value!
          .courses
          .firstWhere((c) => c.safeId == _selectedCourseId);
      final trackerCourseCode = utils.standardizeCourseCode(
        matchingCourse.code ?? matchingCourse.safeId,
      );
      await ref
          .read(trackingProvider.notifier)
          .insertRecord(
            date: DateFormat('yyyy-MM-dd').format(_selectedDate),
            session: utils.toRoman(_selectedSession),
            status: 'extra',
            attendance: _status.code,
            courseId: trackerCourseCode,
            remarks: _reasonController.text.trim(),
          );
      if (mounted) {
        Navigator.pop(context);
        ServiceToast.show(context, 'Record added successfully');
      }
    } on Object catch (e, st) {
      AppLogger.e('AddAttendanceDialog: Insert failed', e, st);
      if (mounted) {
        ServiceToast.show(
          context,
          formatApiError(e, 'attendance'),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
