import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/attendance/attendance_dialog_widgets.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';

class AddAttendanceDialog extends ConsumerStatefulWidget {
  const AddAttendanceDialog({super.key});

  @override
  ConsumerState<AddAttendanceDialog> createState() => _AddAttendanceDialogState();
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

  void _precomputeFrequencies() {
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final result = <int, Map<String, Map<String, int>>>{};
    data.attendance.studentAttendanceData.forEach((dStr, sessions) {
      try {
        if (dStr.length != 8) return;
        final date = DateTime(int.parse(dStr.substring(0, 4)), int.parse(dStr.substring(4, 6)), int.parse(dStr.substring(6, 8)));
        result.putIfAbsent(date.weekday, () => {});
        final weekdayMap = result[date.weekday]!;
        int idx = 0;
        sessions.forEach((key, sessionObj) {
          if (sessionObj.course != null && sessionObj.course != 0) {
            final target = utils.normalizeSession(_getSessionName(data.attendance.sessions, key, sessionObj, idx));
            weekdayMap.putIfAbsent(target, () => {});
            final cid = sessionObj.course.toString();
            weekdayMap[target]![cid] = (weekdayMap[target]![cid] ?? 0) + 1;
          }
          idx++;
        });
      } catch (_) {}
    });
    _precomputedFrequencies = result;
  }

  String _getSessionName(Map<String, dynamic> meta, String key, dynamic obj, int idx) {
    if (meta[key]?['name'] != null) return meta[key]['name'].toString();
    if (obj.session != null && obj.session != 0) return obj.session.toString();
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
      int idx = 0;
      official.forEach((key, obj) {
        if (obj.course != null && obj.course != 0) occupied.add(utils.normalizeSession(_getSessionName(data.attendance.sessions, key, obj, idx)));
        idx++;
      });
    }
    final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);
    for (final r in data.tracking) {
      if (r.date == dbDate) occupied.add(utils.normalizeSession(r.session));
    }

    final firstFree = _sessions.firstWhere((s) => !occupied.contains(utils.normalizeSession(s)), orElse: () => '');
    setState(() => _selectedSession = firstFree.isNotEmpty ? firstFree : null);
    _updateBlockedState();
    if (firstFree.isNotEmpty) _prefillCourse(firstFree);
  }

  void _prefillCourse(String session) {
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final freq = _precomputedFrequencies?[_selectedDate.weekday]?[utils.normalizeSession(session)];
    String? best;
    if (freq != null) {
      int max = 0;
      freq.forEach((cid, count) { if (count > max) { max = count; best = cid; } });
    }
    if (best != null) {
      final c = data.courses.firstWhere((c) => c.id.toString() == best || c.code == best || c.safeId == best, orElse: () => data.courses.first);
      setState(() => _selectedCourseId = c.safeId);
    } else if (data.courses.isNotEmpty) {
      setState(() => _selectedCourseId = data.courses.first.safeId);
    }
  }

  void _updateBlockedState() {
    if (_selectedSession == null) { setState(() => _isBlocked = false); return; }
    final data = ref.read(dashboardProvider).value;
    if (data == null) return;
    final target = utils.normalizeSession(_selectedSession!);
    final dateKey = DateFormat('yyyyMMdd').format(_selectedDate);
    final official = data.attendance.studentAttendanceData[dateKey];
    bool blocked = false;
    if (official != null) {
      int idx = 0;
      for (var e in official.entries) {
        if (e.value.course != null && e.value.course != 0) {
          if (utils.normalizeSession(_getSessionName(data.attendance.sessions, e.key, e.value, idx)) == target) { blocked = true; break; }
        }
        idx++;
      }
    }
    if (!blocked) {
      final dbDate = DateFormat('yyyy-MM-dd').format(_selectedDate);
      blocked = data.tracking.any((r) => r.date == dbDate && utils.normalizeSession(r.session) == target);
    }
    setState(() => _isBlocked = blocked);
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(dashboardProvider).value;
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(28)),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(primary),
              const SizedBox(height: 32),
              const AttendanceDialogLabel(text: 'Date'),
              _buildDatePicker(primary),
              const SizedBox(height: 20),
              const AttendanceDialogLabel(text: 'Session'),
              _buildSessionDropdown(),
              if (_isBlocked) Padding(padding: const EdgeInsets.only(top: 6, left: 4), child: const Text('Session occupied', style: TextStyle(color: Colors.redAccent, fontSize: 11))),
              const SizedBox(height: 20),
              const AttendanceDialogLabel(text: 'Subject'),
              _buildSubjectDropdown(data),
              const SizedBox(height: 24),
              const AttendanceDialogLabel(text: 'Status'),
              _buildStatusButtons(ghostColors),
              const SizedBox(height: 20),
              AttendanceDialogLabel(text: _status == AttendanceStatus.dutyLeave ? 'Reason (Optional)' : 'Remarks (Optional)'),
              _buildRemarksField(primary),
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
        Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: primary.withValues(alpha: 0.1), shape: BoxShape.circle), child: Icon(LucideIcons.plus, color: primary, size: 20)),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Add Extra Class', style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w800)),
          Text('Record a custom class session', style: GoogleFonts.manrope(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
        ])),
        IconButton(onPressed: _isSubmitting ? null : () => Navigator.pop(context), icon: const Icon(LucideIcons.x, size: 20)),
      ],
    );
  }

  Widget _buildDatePicker(Color primary) {
    return InkWell(
      onTap: () async {
        final academic = ref.read(academicProvider).value;
        final picked = await showDatePicker(context: context, initialDate: _selectedDate, firstDate: academic?.startDate ?? DateTime(2020), lastDate: academic?.endDate ?? DateTime(2030));
        if (picked != null) { setState(() => _selectedDate = picked); _prefillDefaults(); }
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1))),
        child: Row(children: [const Icon(LucideIcons.calendar, size: 18, color: Colors.grey), const SizedBox(width: 12), Text(DateFormat('MMMM d, yyyy').format(_selectedDate))]),
      ),
    );
  }

  Widget _buildSessionDropdown() {
    return DropdownButtonFormField<String>(
      initialValue: _selectedSession,
      items: _sessions.map((s) => DropdownMenuItem(value: s, child: Text(utils.formatSessionName(s)))).toList(),
      onChanged: (val) { if (val != null) { setState(() => _selectedSession = val); _updateBlockedState(); _prefillCourse(val); } },
      decoration: _inputDecoration(LucideIcons.clock),
    );
  }

  Widget _buildSubjectDropdown(DashboardData? data) {
    return DropdownButtonFormField<String>(
      initialValue: _selectedCourseId,
      isExpanded: true,
      items: (data?.courses ?? []).map((c) => DropdownMenuItem(value: c.safeId, child: Text(c.name, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: (val) => setState(() => _selectedCourseId = val),
      decoration: _inputDecoration(LucideIcons.bookOpen),
    );
  }

  Widget _buildStatusButtons(GhostColors? colors) {
    return Row(children: [
      AttendanceStatusToggleButton(value: 'Present', isSelected: _status == AttendanceStatus.present, color: colors?.successGreen ?? Colors.green, onTap: () => setState(() => _status = AttendanceStatus.present)),
      const SizedBox(width: 10),
      AttendanceStatusToggleButton(value: 'Absent', isSelected: _status == AttendanceStatus.absent, color: colors?.dangerRed ?? Colors.red, onTap: () => setState(() => _status = AttendanceStatus.absent)),
      const SizedBox(width: 10),
      AttendanceStatusToggleButton(value: 'Duty Leave', label: 'DL', isSelected: _status == AttendanceStatus.dutyLeave, color: colors?.accentOrange ?? Colors.orange, onTap: () => setState(() => _status = AttendanceStatus.dutyLeave)),
    ]);
  }

  Widget _buildRemarksField(Color primary) {
    return TextField(
      controller: _reasonController,
      maxLength: 255,
      decoration: _inputDecoration(LucideIcons.textCursor),
    );
  }

  Widget _buildSubmitButton(Color primary) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: (_isSubmitting || _isBlocked || _selectedSession == null || _selectedCourseId == null) ? null : _handleSubmit,
        style: ElevatedButton.styleFrom(backgroundColor: primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        child: _isSubmitting ? const CircularProgressIndicator(color: Colors.white) : const Text('Add Record', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }

  InputDecoration _inputDecoration(IconData icon) {
    return InputDecoration(
      prefixIcon: Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    );
  }

  Future<void> _handleSubmit() async {
    setState(() => _isSubmitting = true);
    try {
      final matchingCourse = ref.read(dashboardProvider).value!.courses.firstWhere((c) => c.safeId == _selectedCourseId);
      final trackerCourseCode = matchingCourse.code?.replaceAll(RegExp(r'\s+'), '').toUpperCase() ?? matchingCourse.safeId;
      await ref.read(trackingProvider.notifier).insertRecord(
        date: DateFormat('yyyy-MM-dd').format(_selectedDate),
        session: utils.toRoman(_selectedSession!),
        status: 'extra',
        attendance: _status.code,
        courseId: trackerCourseCode,
        remarks: _reasonController.text.trim(),
      );
      if (mounted) Navigator.pop(context);
    } catch (e, st) {
      AppLogger.e('AddAttendanceDialog: Insert failed', e, st);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
