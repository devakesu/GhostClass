import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/providers/ui_state_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/calendar/calendar_day_details.dart';
import 'package:ghostclass/widgets/calendar/calendar_header.dart';
import 'package:ghostclass/widgets/calendar/calendar_session_card.dart';
import 'package:ghostclass/widgets/calendar/calendar_widgets.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

class AttendanceCalendarScreen extends ConsumerStatefulWidget {
  const AttendanceCalendarScreen({super.key});

  @override
  ConsumerState<AttendanceCalendarScreen> createState() =>
      _AttendanceCalendarScreenState();
}

class _AttendanceCalendarScreenState
    extends ConsumerState<AttendanceCalendarScreen>
    with ErrorHandlerMixin {
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  AcademicState? _lastAcademic;
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dashboardState = ref.watch(dashboardProvider);
    final trackingState = ref.watch(trackingProvider);
    final academicAsync = ref.watch(academicProvider);

    final dash = dashboardState.value;
    final track = trackingState.value;
    final academic = academicAsync.value;

    // Detect Academic Change -> Auto Select Relevant Date
    if (academic != null && _lastAcademic != academic) {
      _lastAcademic = academic;
      if (dash != null && track != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final now = DateTime.now();
          final isTodayInRange =
              !now.isBefore(academic.startDate) &&
              !now.isAfter(academic.endDate);

          final target = isTodayInRange
              ? now
              : _findLatestRecordDate(dash, track);

          final start = academic.startDate;
          final end = academic.endDate;
          final clamped = target.isBefore(start)
              ? start
              : (target.isAfter(end) ? end : target);

          setState(() {
            _selectedDay = clamped;
            _focusedDay = clamped;
          });
        });
      }
    }

    if (dashboardState.isLoading ||
        trackingState.isLoading ||
        academicAsync.isLoading) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: const LoadingOverlay(
          isFullScreen: false,
          showLogo: false,
          message: 'Loading your calendar...',
        ),
      );
    }

    if (dash == null ||
        track == null ||
        academic == null ||
        dashboardState.hasError ||
        trackingState.hasError ||
        academicAsync.hasError) {
      final error =
          dashboardState.error ?? trackingState.error ?? academicAsync.error;
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: ServiceErrorView(
          error: error,
          onRetry: () async {
            ref.read(apiServiceProvider).clearCaches();
            ref
              ..invalidate(dashboardProvider)
              ..invalidate(trackingProvider)
              ..invalidate(academicProvider);

            try {
              await Future.wait<dynamic>([
                ref.read(dashboardProvider.future),
                ref.read(trackingProvider.future),
                ref.read(academicProvider.future),
              ]).timeout(const Duration(seconds: 10));
            } on Object catch (e, st) {
              AppLogger.e('AttendanceCalendarScreen: Retry failed', e, st);
            }
          },
        ),
      );
    }

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          // Background Decoration
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.05),
              ),
            ),
          ),
          Positioned(
            bottom: 100,
            left: -50,
            child: Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color:
                    (Theme.of(context).extension<GhostColors>()?.accentBlue ??
                            Colors.blue)
                        .withValues(alpha: 0.05),
              ),
            ),
          ),
          _CalendarContent(
            dashboard: dash,
            tracking: track,
            focusedDay: _focusedDay,
            selectedDay: _selectedDay,
            scrollController: _scrollController,
            onDaySelected: (day) => setState(() => _selectedDay = day),
            onMonthChanged: (day) => setState(() => _focusedDay = day),
            onToday: () {
              final now = DateTime.now();
              final academicValue = ref.read(academicProvider).value;
              final isTodayInRange =
                  academicValue != null &&
                  !now.isBefore(academicValue.startDate) &&
                  !now.isAfter(academicValue.endDate);

              if (isTodayInRange) {
                setState(() {
                  _focusedDay = now;
                  _selectedDay = now;
                });
                unawaited(
                  _scrollController.animateTo(
                    0,
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                  ),
                );
              } else {
                ServiceToast.show(
                  context,
                  'Today is outside the academic range',
                );
              }
            },
          ),
        ],
      ),
    );
  }

  DateTime _findLatestRecordDate(DashboardData dash, TrackingState track) {
    var latest = DateTime(2000);
    var found = false;

    for (final dateKey in dash.attendance.studentAttendanceData.keys) {
      if (dateKey.length == 8) {
        final year = int.tryParse(dateKey.substring(0, 4));
        final month = int.tryParse(dateKey.substring(4, 6));
        final day = int.tryParse(dateKey.substring(6, 8));
        if (year != null && month != null && day != null) {
          final d = DateTime(year, month, day);
          if (d.isAfter(latest)) {
            latest = d;
            found = true;
          }
        }
      }
    }

    for (final list in track.groupedByCourse.values) {
      for (final r in list) {
        final d = DateTime.tryParse(r.date);
        if (d != null) {
          if (d.isAfter(latest)) {
            latest = d;
            found = true;
          }
        }
      }
    }

    return found ? latest : DateTime.now();
  }
}

class _CalendarContent extends ConsumerWidget {
  const _CalendarContent({
    required this.dashboard,
    required this.tracking,
    required this.focusedDay,
    required this.selectedDay,
    required this.onDaySelected,
    required this.onMonthChanged,
    required this.onToday,
    required this.scrollController,
  });
  final DashboardData dashboard;
  final TrackingState tracking;
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<DateTime> onMonthChanged;
  final VoidCallback onToday;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final academic = ref.watch(academicProvider).value;
    final startDate = academic?.startDate ?? DateTime(2020);
    final endDate = academic?.endDate ?? DateTime(2030);
    final auth = ref.watch(authProvider).value;
    final disabledMap = auth?.settings.disabledCourses ?? {};
    final semKey = '${dashboard.selectedYear}-${dashboard.selectedSemester}';
    final disabledCodes = (disabledMap[semKey] ?? {}).keys
        .map((c) => c.toUpperCase())
        .toSet();
    final now = DateTime.now();
    final isTodayInRange =
        academic != null &&
        !now.isBefore(academic.startDate) &&
        !now.isAfter(academic.endDate);
    final showJumpToToday = isTodayInRange && !isSameDay(selectedDay, now);

    final events = _getEventsForDay(selectedDay, disabledCodes, context);

    final canMovePrev =
        focusedDay.year > startDate.year || focusedDay.month > startDate.month;
    final canMoveNext =
        focusedDay.year < endDate.year || focusedDay.month < endDate.month;

    return ServiceRefreshIndicator(
      onRefresh: () async {
        try {
          await ref.read(dashboardProvider.notifier).refresh();
        } on Object {
          if (!context.mounted) rethrow;
          ServiceToast.show(context, 'Refresh failed', isError: true);
          rethrow;
        }
      },
      child: CustomScrollView(
        controller: scrollController,
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          CalendarHeader(
            focusedDay: focusedDay,
            canMovePrev: canMovePrev,
            canMoveNext: canMoveNext,
            onPrevious: () {
              if (canMovePrev) {
                onMonthChanged(DateTime(focusedDay.year, focusedDay.month - 1));
              } else {
                ServiceToast.show(
                  context,
                  'Reached start of ${dashboard.selectedSemester.toUpperCase()} ${dashboard.selectedYear}',
                );
              }
            },
            onNext: () {
              if (canMoveNext) {
                onMonthChanged(DateTime(focusedDay.year, focusedDay.month + 1));
              } else {
                ServiceToast.show(
                  context,
                  'Reached end of ${dashboard.selectedSemester.toUpperCase()} ${dashboard.selectedYear}',
                );
              }
            },
            onToday: showJumpToToday ? onToday : null,
            onDateSelect: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: focusedDay.isBefore(startDate)
                    ? startDate
                    : (focusedDay.isAfter(endDate) ? endDate : focusedDay),
                firstDate: startDate,
                lastDate: endDate,
              );
              if (date != null) {
                onMonthChanged(date);
                onDaySelected(date);
              }
            },
          ),
          SliverToBoxAdapter(
            child: Column(
              children: [
                AttendanceCalendarWidget(
                  focusedDay: focusedDay,
                  selectedDay: selectedDay,
                  onDaySelected: onDaySelected,
                  dashboard: dashboard,
                  tracking: tracking,
                  disabledCodes: disabledCodes,
                ),
                const SizedBox(height: 16),
                const CalendarLegend(),
              ],
            ),
          ),
          const SliverPadding(padding: EdgeInsets.symmetric(vertical: 8)),
          SelectedDayHeader(
            selectedDay: selectedDay,
            eventCount: events.length,
          ),
          if (events.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptySessionsView(),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final event = events[index];
                    return CalendarSessionCard(
                      event: event,
                      onMarkDl: () => _showCorrectionSheet(
                        context: context,
                        ref: ref,
                        event: event,
                        initialStatus: 'dutyLeave',
                      ),
                      onMarkPresent: () => _showCorrectionSheet(
                        context: context,
                        ref: ref,
                        event: event,
                        initialStatus: 'present',
                      ),
                      onDelete: event.trackingId == null
                          ? null
                          : () =>
                                _deleteRecord(context, ref, event.trackingId!),
                    );
                  },
                  childCount: events.length,
                ),
              ),
            ),
          const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
        ],
      ),
    );
  }

  void _showCorrectionSheet({
    required BuildContext context,
    required WidgetRef ref,
    required CalendarEvent event,
    required String initialStatus,
  }) {
    final controller = TextEditingController();
    final attendance = initialStatus == 'dutyLeave' ? 225 : 110;
    final hint = attendance == 225
        ? 'Enter reason for Duty Leave...'
        : 'Enter reason for being Present...';

    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    final _ =
        showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          ),
          builder: (context) {
            var isSubmitting = false;
            return StatefulBuilder(
              builder: (context, setState) {
                return Padding(
                  padding: EdgeInsets.only(
                    bottom: MediaQuery.of(context).viewInsets.bottom,
                    left: 24,
                    right: 24,
                    top: 12,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Mark as ${initialStatus == 'dutyLeave' ? "Duty Leave" : "Present"}',
                        style: GoogleFonts.manrope(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Enter a remark for this correction:',
                        style: GoogleFonts.manrope(
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: controller,
                        autofocus: true,
                        style: GoogleFonts.manrope(
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                        decoration: InputDecoration(
                          hintText: hint,
                          hintStyle: GoogleFonts.manrope(
                            color: Theme.of(context).colorScheme.onSurface
                                .withValues(
                                  alpha: 0.4,
                                ),
                            fontSize: 13,
                          ),
                          filled: true,
                          fillColor: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.05),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.all(16),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          Expanded(
                            child: TextButton(
                              onPressed: isSubmitting
                                  ? null
                                  : () => Navigator.pop(context),
                              child: Text(
                                'CANCEL',
                                style: GoogleFonts.manrope(
                                  color:
                                      Theme.of(
                                        context,
                                      ).colorScheme.onSurface.withValues(
                                        alpha: 0.4,
                                      ),
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Consumer(
                              builder: (context, ref, _) {
                                return ElevatedButton(
                                  onPressed: isSubmitting
                                      ? null
                                      : () async {
                                          final remark = controller.text.trim();
                                          final finalRemark = remark.isEmpty
                                              ? (attendance == 225
                                                    ? 'Duty Leave'
                                                    : 'Self-Marked: Present')
                                              : remark;

                                          setState(() => isSubmitting = true);

                                          try {
                                            await ref
                                                .read(trackingProvider.notifier)
                                                .insertRecord(
                                                  courseId: event.courseId,
                                                  date: event.dbDate,
                                                  session:
                                                      event.displaySessionName,
                                                  attendance: attendance,
                                                  status: 'correction',
                                                  remarks: finalRemark,
                                                );
                                            if (context.mounted) {
                                              Navigator.pop(context);
                                              ServiceToast.show(
                                                context,
                                                'Correction added successfully',
                                              );
                                            }
                                          } on Object catch (e) {
                                            if (context.mounted) {
                                              setState(
                                                () => isSubmitting = false,
                                              );
                                              ServiceToast.show(
                                                context,
                                                formatApiError(e, 'attendance'),
                                                isError: true,
                                              );
                                            }
                                          }
                                        },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: attendance == 225
                                        ? const Color(0xFFF59E0B)
                                        : const Color(0xFF10B981),
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                  ),
                                  child: isSubmitting
                                      ? const SizedBox(
                                          height: 20,
                                          width: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : Text(
                                          'CONFIRM',
                                          style: GoogleFonts.manrope(
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 1,
                                          ),
                                        ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                );
              },
            );
          },
        ).then((_) {
          if (context.mounted) {
            ref.read(uiModalOpenProvider.notifier).setOpen(false);
          }
        });
  }

  void _deleteRecord(BuildContext context, WidgetRef ref, int id) {
    final _ = showDialog<void>(
      context: context,
      builder: (context) {
        var isDeleting = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: Theme.of(context).colorScheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              title: Text(
                'Delete Record',
                style: GoogleFonts.manrope(
                  fontWeight: FontWeight.w900,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              content: Text(
                'Are you sure you want to delete this tracking record? This will revert the session to its official status.',
                style: GoogleFonts.manrope(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isDeleting ? null : () => Navigator.pop(context),
                  child: Text(
                    'CANCEL',
                    style: GoogleFonts.manrope(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                ElevatedButton(
                  onPressed: isDeleting
                      ? null
                      : () async {
                          setDialogState(() => isDeleting = true);
                          try {
                            await ref
                                .read(trackingProvider.notifier)
                                .deleteRecord(id);
                            if (context.mounted) {
                              Navigator.pop(context);
                              ServiceToast.show(
                                context,
                                'Record deleted successfully',
                              );
                            }
                          } on Object catch (e) {
                            if (context.mounted) {
                              setDialogState(() => isDeleting = false);
                              ServiceToast.show(
                                context,
                                formatApiError(e, 'deleting record'),
                                isError: true,
                              );
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.redAccent,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: isDeleting
                      ? const SizedBox(
                          height: 14,
                          width: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('DELETE'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  String _resolveSafeId(String rawId) {
    final normRaw = rawId.trim().toUpperCase();
    for (final c in dashboard.courses) {
      if (c.safeId.trim().toUpperCase() == normRaw ||
          (c.code ?? '').trim().toUpperCase() == normRaw) {
        return c.safeId;
      }
    }
    final numericId = int.tryParse(rawId);
    if (numericId != null) {
      for (final c in dashboard.courses) {
        if (c.id == numericId) return c.safeId;
      }
    }
    return rawId;
  }

  List<CalendarEvent> _getEventsForDay(
    DateTime day,
    Set<String> disabledCodes,
    BuildContext context,
  ) {
    final events = <CalendarEvent>[];
    final dateStr = DateFormat('yyyyMMdd').format(day);
    final dbDate = DateFormat('yyyy-MM-dd').format(day);

    String canonicalTrackerCourseCode({
      required String fallback,
      String? resolvedCode,
    }) {
      final source = (resolvedCode != null && resolvedCode.trim().isNotEmpty)
          ? resolvedCode
          : fallback;
      return source.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    }

    final sessions = dashboard.attendance.studentAttendanceData[dateStr];
    if (sessions != null) {
      var idx = 0;
      sessions.forEach((key, data) {
        final rawId = data.course.toString();
        final safeId = _resolveSafeId(rawId);
        final normSafeId = safeId.trim().toUpperCase();

        final courseDetails = dashboard.courses.firstWhere(
          (c) =>
              c.safeId.trim().toUpperCase() == normSafeId ||
              (c.code ?? '').trim().toUpperCase() == normSafeId,
          orElse: () => CourseDetails(id: 0, name: safeId),
        );

        final officialCourse = dashboard.attendance.courses[rawId];
        if (officialCourse == null &&
            courseDetails.id == 0 &&
            courseDetails.name == safeId) {
          idx++;
          return;
        }

        final rawSessionKey = key;
        var displaySessionName = data.session?.toString() ?? key;
        final sNumKey = int.tryParse(key);
        if ((data.session == null || data.session.toString() == 'null') &&
            sNumKey != null &&
            sNumKey > 20) {
          displaySessionName = (idx + 1).toString();
        }

        final status = AttendanceStatus.fromCode(data.attendance);

        final resolvedCode = utils.resolveCourseDisplayCode(
          courseKey: rawId,
          mergedCourse: courseDetails,
          officialReport: dashboard.attendance,
        );
        final trackerCourseCode = canonicalTrackerCourseCode(
          resolvedCode: resolvedCode,
          fallback: safeId,
        );

        final trackingKeys = {
          rawId.trim().toUpperCase(),
          safeId.trim().toUpperCase(),
          trackerCourseCode.trim().toUpperCase(),
        };
        final trackingRecords = tracking.groupedByCourse.entries
            .where(
              (entry) => trackingKeys.contains(entry.key.trim().toUpperCase()),
            )
            .expand((entry) => entry.value)
            .toList();

        TrackingRecord? override;
        final normDisplaySession = utils.normalizeSession(displaySessionName);
        final normRawSession = utils.normalizeSession(rawSessionKey);
        for (final t in trackingRecords) {
          if (t.date != dbDate) continue;
          final tNorm = utils.normalizeSession(t.session);
          if (tNorm == normDisplaySession || tNorm == normRawSession) {
            override = t;
            break;
          }
        }

        final isCorrection =
            override != null && override.status == 'correction';
        final isSelfMarked = override != null && override.status == 'extra';

        final currentStatus = isCorrection
            ? AttendanceStatus.fromCode(override.attendance)
            : status;

        events.add(
          CalendarEvent(
            courseName: utils.resolveCourseDisplayName(
              courseKey: rawId,
              mergedCourse: courseDetails,
              officialReport: dashboard.attendance,
            ),
            courseCode: utils.resolveCourseDisplayCode(
              courseKey: rawId,
              mergedCourse: courseDetails,
              officialReport: dashboard.attendance,
            ),
            displaySessionName: displaySessionName,
            rawSessionKey: rawSessionKey,
            status: _getStatusLabel(currentStatus),
            originalStatus: isCorrection ? _getStatusLabel(status) : null,
            color: _getStatusColor(currentStatus, context),
            isCorrection: isCorrection,
            isExtra: isSelfMarked,
            courseId: trackerCourseCode,
            dbDate: dbDate,
            trackingId: override?.id,
            isDisabled: disabledCodes.contains(
              (utils.resolveCourseDisplayCode(
                        courseKey: safeId,
                        mergedCourse: courseDetails,
                        officialReport: dashboard.attendance,
                      ) ??
                      '')
                  .toUpperCase(),
            ),
            remarks: override?.remarks,
          ),
        );
        idx++;
      });
    }

    for (final entry in tracking.groupedByCourse.entries) {
      final safeId = entry.key;
      final trGroup = entry.value;
      for (final tr in trGroup) {
        if (tr.date == dbDate && tr.status == 'extra') {
          final trNormSession = utils.normalizeSession(tr.session);
          final canonicalEntryCourse = canonicalTrackerCourseCode(
            resolvedCode: utils.resolveCourseDisplayCode(
              courseKey: safeId,
              mergedCourse: dashboard.courses.firstWhere(
                (c) =>
                    c.safeId.trim().toUpperCase() ==
                        safeId.trim().toUpperCase() ||
                    (c.code ?? '').trim().toUpperCase() ==
                        safeId.trim().toUpperCase(),
                orElse: () => CourseDetails(id: 0, name: safeId),
              ),
              officialReport: dashboard.attendance,
            ),
            fallback: safeId,
          );
          final exists = events.any(
            (e) =>
                e.courseId == canonicalEntryCourse &&
                (utils.normalizeSession(e.displaySessionName) ==
                        trNormSession ||
                    utils.normalizeSession(e.rawSessionKey) == trNormSession),
          );
          if (!exists) {
            final normSafeId = safeId.trim().toUpperCase();
            final courseDetails = dashboard.courses.firstWhere(
              (c) =>
                  c.safeId.trim().toUpperCase() == normSafeId ||
                  (c.code ?? '').trim().toUpperCase() == normSafeId,
              orElse: () => CourseDetails(id: 0, name: safeId),
            );
            final trStatus = AttendanceStatus.fromCode(tr.attendance);
            events.add(
              CalendarEvent(
                courseName: utils.resolveCourseDisplayName(
                  courseKey: safeId,
                  mergedCourse: courseDetails,
                  officialReport: dashboard.attendance,
                ),
                courseCode: utils.resolveCourseDisplayCode(
                  courseKey: safeId,
                  mergedCourse: courseDetails,
                  officialReport: dashboard.attendance,
                ),
                displaySessionName: tr.session,
                rawSessionKey: tr.session,
                status: _getStatusLabel(trStatus),
                color: _getStatusColor(trStatus, context),
                isCorrection: false,
                isExtra: true,
                courseId: canonicalTrackerCourseCode(
                  resolvedCode: utils.resolveCourseDisplayCode(
                    courseKey: safeId,
                    mergedCourse: courseDetails,
                    officialReport: dashboard.attendance,
                  ),
                  fallback: safeId,
                ),
                dbDate: dbDate,
                trackingId: tr.id,
                isDisabled: disabledCodes.contains(
                  (utils.resolveCourseDisplayCode(
                            courseKey: safeId,
                            mergedCourse: courseDetails,
                            officialReport: dashboard.attendance,
                          ) ??
                          '')
                      .toUpperCase(),
                ),
                remarks: tr.remarks,
              ),
            );
          }
        }
      }
    }

    events.sort(
      (a, b) =>
          (int.tryParse(utils.normalizeSession(a.displaySessionName)) ?? 0)
              .compareTo(
                int.tryParse(utils.normalizeSession(b.displaySessionName)) ?? 0,
              ),
    );

    return events;
  }

  String _getStatusLabel(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.absent:
        return 'Absent';
      case AttendanceStatus.dutyLeave:
        return 'Duty Leave';
      case AttendanceStatus.otherLeave:
        return 'Other Leave';
      case AttendanceStatus.present:
        return 'Present';
    }
  }

  Color _getStatusColor(AttendanceStatus status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    switch (status) {
      case AttendanceStatus.absent:
        return ghostColors?.dangerRed ?? const Color(0xFFEF4444);
      case AttendanceStatus.dutyLeave:
        return ghostColors?.accentOrange ?? const Color(0xFFF59E0B);
      case AttendanceStatus.otherLeave:
        return ghostColors?.accentBlue ?? const Color(0xFF3B82F6);
      case AttendanceStatus.present:
        return ghostColors?.successGreen ?? const Color(0xFF10B981);
    }
  }
}
