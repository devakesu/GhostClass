import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../models/course_details.dart';

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
          // Check if Today is within the academic semester/year range
          final bool isTodayInRange =
              !now.isBefore(academic.startDate) &&
              !now.isAfter(academic.endDate);

          // Default to Today if in range, otherwise fall back to latest record
          final target = isTodayInRange
              ? now
              : _findLatestRecordDate(dash, track);

          // Final safety clamp to academic range
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
        body: LoadingOverlay(
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
            ref.invalidate(dashboardProvider);
            ref.invalidate(trackingProvider);
            ref.invalidate(academicProvider);

            try {
              await Future.wait([
                ref.read(dashboardProvider.future),
                ref.read(trackingProvider.future),
                ref.read(academicProvider.future),
              ]);
            } catch (e, st) {
              AppLogger.e('AttendanceCalendarScreen: Retry failed', e, st);
            }
          },
        ),
      );
    }

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: _CalendarContent(
        dashboard: dash,
        tracking: track,
        focusedDay: _focusedDay,
        selectedDay: _selectedDay,
        scrollController: _scrollController,
        onDaySelected: (day) => setState(() => _selectedDay = day),
        onMonthChanged: (day) => setState(() => _focusedDay = day),
        onToday: () {
          final now = DateTime.now();
          final academic = ref.read(academicProvider).value;
          final bool isTodayInRange =
              academic != null &&
              !now.isBefore(academic.startDate) &&
              !now.isAfter(academic.endDate);

          if (isTodayInRange) {
            setState(() {
              _focusedDay = now;
              _selectedDay = now;
            });
            // Smooth scroll to top when jumping to today
            _scrollController.animateTo(
              0,
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutCubic,
            );
          } else {
            ServiceToast.show(context, 'Today is outside the academic range');
          }
        },
      ),
    );
  }

  DateTime _findLatestRecordDate(DashboardData dash, TrackingState track) {
    DateTime latest = DateTime(2000);
    bool found = false;

    // 1. Check official data (YYYYMMDD)
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

    // 2. Check tracking data (yyyy-MM-dd)
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
  final DashboardData dashboard;
  final TrackingState tracking;
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<DateTime> onMonthChanged;
  final VoidCallback onToday;
  final ScrollController scrollController;

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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final academicAsync = ref.watch(academicProvider);
    final academic = academicAsync.value;
    final startDate = academic?.startDate ?? DateTime(2020);
    final endDate = academic?.endDate ?? DateTime(2030);
    final auth = ref.watch(authProvider).value;
    final disabledMap = auth?.settings.disabledCourses ?? {};
    final semKey = '${dashboard.selectedYear}-${dashboard.selectedSemester}';
    final disabledCodes = (disabledMap[semKey] ?? {}).keys
        .map((c) => c.toUpperCase())
        .toSet();
    final now = DateTime.now();
    final bool isTodayInRange =
        academic != null &&
        !now.isBefore(academic.startDate) &&
        !now.isAfter(academic.endDate);
    final bool showJumpToToday = isTodayInRange && !isSameDay(selectedDay, now);

    final events = _getEventsForDay(selectedDay, disabledCodes, context);

    final canMovePrev =
        focusedDay.year > startDate.year || focusedDay.month > startDate.month;
    final canMoveNext =
        focusedDay.year < endDate.year || focusedDay.month < endDate.month;

    return ServiceRefreshIndicator(
      onRefresh: () async {
        final trackingNotifier = ref.read(trackingProvider.notifier);
        final dashboardNotifier = ref.read(dashboardProvider.notifier);
        await trackingNotifier.refresh(forceSync: true);
        await dashboardNotifier.refresh();
      },
      child: CustomScrollView(
        controller: scrollController,
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          _CalendarHeader(
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
                builder: (context, child) => Theme(
                  data: Theme.of(context).copyWith(
                    colorScheme: Theme.of(context).colorScheme.copyWith(
                      primary:
                          Theme.of(
                            context,
                          ).extension<GhostColors>()?.brandPrimary ??
                          Theme.of(context).colorScheme.primary,
                      onPrimary: Colors.white,
                      surface: Theme.of(context).colorScheme.surface,
                      onSurface: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                  child: child!,
                ),
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
                _CalendarWidget(
                  focusedDay: focusedDay,
                  selectedDay: selectedDay,
                  onDaySelected: onDaySelected,
                  dashboard: dashboard,
                  tracking: tracking,
                  disabledCodes: disabledCodes,
                ),
                const SizedBox(height: 16),
                const _CalendarLegend(),
              ],
            ),
          ),
          const SliverPadding(padding: EdgeInsets.symmetric(vertical: 8)),
          _SelectedDayHeader(
            selectedDay: selectedDay,
            eventCount: events.length,
          ),
          if (events.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptySessionsView(),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) => _SessionCard(event: events[index]),
                  childCount: events.length,
                ),
              ),
            ),
          const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
        ],
      ),
    );
  }

  String _resolveSafeId(String rawId) {
    // 1. Check if rawId matches safeId in merged list (it might already be a safeId if it came from tracking)
    final normRaw = rawId.trim().toUpperCase();
    for (final c in dashboard.courses) {
      if (c.safeId.trim().toUpperCase() == normRaw ||
          (c.code ?? '').trim().toUpperCase() == normRaw) {
        return c.safeId;
      }
    }
    // 2. Check if rawId (numeric) maps to a course's numeric ID
    final numericId = int.tryParse(rawId);
    if (numericId != null) {
      for (final c in dashboard.courses) {
        if (c.id == numericId) return c.safeId;
      }
    }
    return rawId;
  }

  List<_CalendarEvent> _getEventsForDay(
    DateTime day,
    Set<String> disabledCodes,
    BuildContext context,
  ) {
    final List<_CalendarEvent> events = [];
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
      int idx = 0;
      sessions.forEach((key, data) {
        final rawId = data.course.toString();
        // Regression Fix: We need safeId for course lookup, but keep rawId for tracking lookup
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

        // --- SESSION MAPPING (WEB PARITY) ---
        final String rawSessionKey = key;
        String displaySessionName = data.session?.toString() ?? key;
        final sNumKey = int.tryParse(key);
        // If EzyGo uses high-number IDs (e.g. 219) as keys and data.session is missing,
        // fall back to the list index (1st Hour, 2nd Hour) to match web dashboard UI.
        if ((data.session == null || data.session.toString() == 'null') &&
            sNumKey != null &&
            sNumKey > 20) {
          displaySessionName = (idx + 1).toString();
        }

        final attendanceCode = int.tryParse(data.attendance.toString()) ?? 110;
        final status = _getStatusLabel(attendanceCode);
        final color = _getStatusColor(attendanceCode, context);

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
              (entry) =>
                  trackingKeys.contains(entry.key.trim().toUpperCase()),
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

        events.add(
          _CalendarEvent(
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
            status: isCorrection
                ? _getStatusLabel(override.attendance, isCorrection: true)
                : status,
            originalStatus: isCorrection ? status : null,
            color: isCorrection
                ? _getStatusColor(override.attendance, context)
                : color,
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
                    c.safeId.trim().toUpperCase() == safeId.trim().toUpperCase() ||
                    (c.code ?? '').trim().toUpperCase() == safeId.trim().toUpperCase(),
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
            events.add(
              _CalendarEvent(
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
                status: _getStatusLabel(tr.attendance),
                color: _getStatusColor(tr.attendance, context),
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

  String _getStatusLabel(dynamic code, {bool isCorrection = false}) {
    final c = int.tryParse(code.toString()) ?? 110;
    String label = 'Present';
    if (c == 111) {
      label = 'Absent';
    } else if (c == 225) {
      label = 'Duty Leave';
    } else if (c == 112) {
      label = 'Other Leave';
    }

    if (isCorrection) {
      // Logic for adding labels removed per user request
    }

    return label;
  }

  Color _getStatusColor(dynamic code, BuildContext context) {
    final c = int.tryParse(code.toString()) ?? 110;
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (c == 111) return ghostColors?.dangerRed ?? const Color(0xFFEF4444);
    if (c == 225) return ghostColors?.accentOrange ?? const Color(0xFFF59E0B);
    if (c == 112) return ghostColors?.accentBlue ?? const Color(0xFF3B82F6);
    return ghostColors?.successGreen ?? const Color(0xFF10B981);
  }
}

class _CalendarEvent {
  final String courseName;
  final String? courseCode;
  final String displaySessionName;
  final String rawSessionKey;
  final String status;
  final String? originalStatus;
  final Color color;
  final bool isCorrection;
  final bool isExtra;
  final String courseId;
  final String dbDate;
  final int? trackingId;
  final bool isDisabled;
  final String? remarks;

  const _CalendarEvent({
    required this.courseName,
    required this.displaySessionName, required this.rawSessionKey, required this.status, required this.color, required this.isCorrection, required this.isExtra, required this.courseId, required this.dbDate, required this.isDisabled, this.courseCode,
    this.originalStatus,
    this.trackingId,
    this.remarks,
  });
}

class _CalendarHeader extends StatelessWidget {
  final DateTime focusedDay;
  final bool canMovePrev;
  final bool canMoveNext;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback? onToday;
  final VoidCallback onDateSelect;

  const _CalendarHeader({
    required this.focusedDay,
    required this.canMovePrev,
    required this.canMoveNext,
    required this.onPrevious,
    required this.onNext,
    required this.onToday,
    required this.onDateSelect,
  });

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  button: true,
                  label: 'Select Month, currently ${DateFormat('MMMM yyyy').format(focusedDay)}',
                  child: GestureDetector(
                    onTap: onDateSelect,
                    child: Row(
                      children: [
                        Text(
                          DateFormat('MMMM yyyy').format(focusedDay),
                          style: GoogleFonts.manrope(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.onSurface,
                            letterSpacing: -1,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          LucideIcons.calendarDays,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
                if (onToday != null)
                  Semantics(
                    button: true,
                    label: 'Jump to today',
                    child: GestureDetector(
                      onTap: onToday,
                      child: Text(
                        'Jump to Today',
                        style: GoogleFonts.manrope(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color:
                              Theme.of(
                                context,
                              ).extension<GhostColors>()?.brandPrimary ??
                              Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            Row(
              children: [
                _HeaderNavButton(
                  icon: LucideIcons.chevronLeft,
                  onTap: onPrevious,
                  enabled: canMovePrev,
                ),
                const SizedBox(width: 8),
                _HeaderNavButton(
                  icon: LucideIcons.chevronRight,
                  onTap: onNext,
                  enabled: canMoveNext,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderNavButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool enabled;

  const _HeaderNavButton({
    required this.icon,
    required this.onTap,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: icon == LucideIcons.chevronLeft ? 'Previous Month' : 'Next Month',
      enabled: enabled,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: enabled ? 1.0 : 0.3,
          child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.15),
            ),
          ),
          child: Icon(
            icon,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.85),
            size: 20,
          ),
        ),
      ),
      ),
    );
  }
}

class _CalendarWidget extends StatelessWidget {
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onDaySelected;
  final DashboardData dashboard;
  final TrackingState tracking;
  final Set<String> disabledCodes;

  const _CalendarWidget({
    required this.focusedDay,
    required this.selectedDay,
    required this.onDaySelected,
    required this.dashboard,
    required this.tracking,
    required this.disabledCodes,
  });

  CourseDetails _resolveMergedCourse(String rawCourseKey) {
    final normRaw = rawCourseKey.trim().toUpperCase();
    for (final course in dashboard.courses) {
      if (course.safeId.trim().toUpperCase() == normRaw ||
          (course.code ?? '').trim().toUpperCase() == normRaw) {
        return course;
      }
    }

    final numericId = int.tryParse(rawCourseKey);
    if (numericId != null) {
      for (final course in dashboard.courses) {
        if (course.id == numericId) return course;
      }
    }

    return CourseDetails(id: 0, name: rawCourseKey);
  }

  String _canonicalTrackerCourseCode({
    required String fallback,
    String? resolvedCode,
  }) {
    final source = (resolvedCode != null && resolvedCode.trim().isNotEmpty)
        ? resolvedCode
        : fallback;
    return source.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  }


  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(focusedDay.year, focusedDay.month, 1);
    final daysInMonth = DateTime(focusedDay.year, focusedDay.month + 1, 0).day;
    final paddingDays = (firstDay.weekday % 7);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                .map(
                  (d) => SizedBox(
                    width: 40,
                    child: Text(
                      d,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: paddingDays + daysInMonth,
            itemBuilder: (context, index) {
              if (index < paddingDays) return const SizedBox.shrink();
              final day = index - paddingDays + 1;
              final date = DateTime(focusedDay.year, focusedDay.month, day);
              final isSelected = isSameDay(date, selectedDay);
              final isToday = isSameDay(date, DateTime.now());

              final status = _getDayStatus(date, context);

              return Semantics(
                button: true,
                selected: isSelected,
                label: '${DateFormat('EEEE, MMMM d, yyyy').format(date)}, Status: ${status ?? 'No events'}',
                child: GestureDetector(
                  onTap: () => onDaySelected(date),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    decoration: BoxDecoration(
                    color: isSelected
                        ? (Theme.of(
                                context,
                              ).extension<GhostColors>()?.brandPrimary ??
                              Theme.of(context).colorScheme.primary)
                        : isToday
                        ? (Theme.of(
                                    context,
                                  ).extension<GhostColors>()?.brandPrimary ??
                                  Theme.of(context).colorScheme.primary)
                              .withValues(alpha: 0.2)
                        : _getStatusBg(status, context),
                    shape: BoxShape.circle,
                    border: isToday && !isSelected
                        ? Border.all(
                            color:
                                Theme.of(
                                  context,
                                ).extension<GhostColors>()?.brandPrimary ??
                                Theme.of(context).colorScheme.primary,
                            width: 1.5,
                          )
                        : Border.all(
                            color: _getStatusBorder(status, context),
                            width: 1.2,
                          ),
                  ),
                  child: Center(
                    child: Text(
                      day.toString(),
                      style: GoogleFonts.manrope(
                        fontSize: 14,
                        fontWeight: isSelected || isToday
                            ? FontWeight.w900
                            : FontWeight.w600,
                        color: isSelected
                            ? Colors.white
                            : (status != null
                                  ? _getStatusColor(status, context)
                                  : Theme.of(context).colorScheme.onSurface
                                        .withValues(alpha: 0.85)),
                      ),
                    ),
                  ),
                ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  // bool isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  String? _getDayStatus(DateTime date, BuildContext context) {
    final dateStr = DateFormat('yyyyMMdd').format(date);
    final dbDate = DateFormat('yyyy-MM-dd').format(date);
    final sessions = dashboard.attendance.studentAttendanceData[dateStr];
    final extraTracking = tracking.groupedByCourse.values
        .expand((e) => e)
        .where((t) => t.date == dbDate && t.status == 'extra')
        .toList();

    if (sessions == null && extraTracking.isEmpty) return null;

    bool hasAbsent = false;
    bool hasDutyLeave = false;
    bool hasOtherLeave = false;

    void checkStatus(
      dynamic code,
      String courseId,
      String rawSession,
      BuildContext context,
    ) {
      final cNum = int.tryParse(code.toString()) ?? 110;
      final mergedCourse = _resolveMergedCourse(courseId);
      final resolvedCode = utils.resolveCourseDisplayCode(
        courseKey: courseId,
        mergedCourse: mergedCourse,
        officialReport: dashboard.attendance,
      );
      _canonicalTrackerCourseCode(
        resolvedCode: resolvedCode,
        fallback: courseId,
      );
      final courseDisabled = disabledCodes.contains(
        (resolvedCode ?? '').toUpperCase(),
      );
      if (cNum == 111 && !courseDisabled) hasAbsent = true;
      if (cNum == 225) hasDutyLeave = true;
      if (cNum == 112) hasOtherLeave = true;
    }

    if (sessions != null && sessions.isNotEmpty) {
      sessions.forEach((key, data) {
        checkStatus(
          data.attendance,
          data.course.toString(),
          data.session?.toString() ?? key,
          context,
        );
      });
    } else {
      for (final tr in extraTracking) {
        final code = int.tryParse(tr.attendance.toString()) ?? 110;
        final mergedCourse = _resolveMergedCourse(tr.course);
        final resolvedCode = utils.resolveCourseDisplayCode(
          courseKey: tr.course,
          mergedCourse: mergedCourse,
          officialReport: dashboard.attendance,
        );
        final courseDisabled = disabledCodes.contains(
          (resolvedCode ?? '').toUpperCase(),
        );
        if (code == 111 && !courseDisabled) hasAbsent = true;
        if (code == 225) hasDutyLeave = true;
        if (code == 112) hasOtherLeave = true;
      }
    }


    if (hasAbsent) return 'absent';
    if (hasDutyLeave) return 'dutyLeave';
    if (hasOtherLeave) return 'otherLeave';
    return 'present';
  }

  Color _getStatusBg(String? status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return (ghostColors?.dangerRed ?? const Color(0xFFEF4444)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'dutyLeave') {
      return (ghostColors?.accentOrange ?? const Color(0xFFF59E0B)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'otherLeave') {
      return (ghostColors?.accentBlue ?? const Color(0xFF3B82F6)).withValues(
        alpha: 0.2,
      );
    }
    if (status == 'present') {
      return (ghostColors?.successGreen ?? const Color(0xFF10B981)).withValues(
        alpha: 0.2,
      );
    }
    return Colors.transparent;
  }

  Color _getStatusBorder(String? status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return (ghostColors?.dangerRed ?? const Color(0xFFEF4444)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'dutyLeave') {
      return (ghostColors?.accentOrange ?? const Color(0xFFF59E0B)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'otherLeave') {
      return (ghostColors?.accentBlue ?? const Color(0xFF3B82F6)).withValues(
        alpha: 0.45,
      );
    }
    if (status == 'present') {
      return (ghostColors?.successGreen ?? const Color(0xFF10B981)).withValues(
        alpha: 0.45,
      );
    }
    return Colors.transparent;
  }

  Color _getStatusColor(String status, BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == 'absent') {
      return ghostColors?.dangerRed ?? const Color(0xFFEF4444);
    }
    if (status == 'dutyLeave') {
      return ghostColors?.accentOrange ?? const Color(0xFFF59E0B);
    }
    if (status == 'otherLeave') {
      return ghostColors?.accentBlue ?? const Color(0xFF3B82F6);
    }
    if (status == 'present') {
      return ghostColors?.successGreen ?? const Color(0xFF10B981);
    }
    return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7);
  }
}

class _SelectedDayHeader extends StatelessWidget {
  final DateTime selectedDay;
  final int eventCount;
  const _SelectedDayHeader({
    required this.selectedDay,
    required this.eventCount,
  });

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  DateFormat('EEEE').format(selectedDay),
                  style: GoogleFonts.manrope(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                Text(
                  DateFormat('MMMM d, yyyy').format(selectedDay),
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '$eventCount Sessions',
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.85),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends ConsumerWidget {
  final _CalendarEvent event;
  const _SessionCard({required this.event});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final disabledAccent = const Color(0xFFF97316);
    final accentColor = event.isDisabled ? disabledAccent : event.color;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Increased opacity for better visibility in light mode
    final accentBackground = isDark
        ? (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.1)
              : accentColor.withValues(alpha: 0.12))
        : (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.08)
              : accentColor.withValues(alpha: 0.08));

    final accentBorder = isDark
        ? (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.45)
              : accentColor.withValues(alpha: 0.45))
        : (event.isDisabled
              ? disabledAccent.withValues(alpha: 0.7)
              : accentColor.withValues(alpha: 0.7));

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark
            ? accentBackground
            : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accentBorder, width: 1.5),
        boxShadow:
            (event.isDisabled ||
                event.status == 'Absent' ||
                event.status == 'Duty Leave' ||
                event.status == 'Other Leave' ||
                event.status == 'Present')
            ? [
                BoxShadow(
                  color: accentColor.withValues(alpha: 0.08),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (event.isDisabled) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: disabledAccent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: disabledAccent.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    LucideIcons.ban,
                    size: 12,
                    color: Color(0xFFF97316),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'DISABLED COURSE',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: disabledAccent,
                      letterSpacing: 0.7,
                    ),
                  ),
                ],
              ),
            ),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.courseName,
                      style: GoogleFonts.manrope(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(context).colorScheme.onSurface,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: accentColor.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: accentColor.withValues(alpha: 0.4),
                            ),
                          ),
                          child: Text(
                            utils.formatSessionName(event.displaySessionName),
                            style: GoogleFonts.manrope(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.85),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: event.color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: event.color.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          event.status == 'Present'
                              ? LucideIcons.checkCircle2
                              : LucideIcons.alertCircle,
                          size: 11,
                          color: event.color,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          event.status.toUpperCase(),
                          style: GoogleFonts.manrope(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            color: event.color,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (event.isCorrection) ...[
                    const SizedBox(height: 6),
                    _CorrectionTag(originalStatus: event.originalStatus ?? ''),
                  ],
                  if (event.isExtra) ...[
                    const SizedBox(height: 6),
                    const _SelfMarkedTag(),
                  ],
                ],
              ),
            ],
          ),
          if (event.remarks != null &&
              event.remarks!.isNotEmpty &&
              !utils.remarkPlaceholders.contains(event.remarks!.trim())) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.02),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                event.remarks!,
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  fontStyle: FontStyle.italic,
                  color: event.status == 'Duty Leave'
                      ? (Theme.of(
                              context,
                            ).extension<GhostColors>()?.accentOrange ??
                            const Color(0xFFF59E0B))
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
          ],
          if (!event.isCorrection &&
              !event.isExtra &&
              event.status == 'Absent' &&
              !event.isDisabled) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    icon: LucideIcons.briefcase,
                    label: 'MARK DL',
                    color: const Color(0xFFF59E0B),
                    onTap: () => _showCorrectionDialog(
                      context: context,
                      ref: ref,
                      event: event,
                      title: 'Mark as Duty Leave',
                      hint: 'Event Name',
                      attendance: 225,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _ActionButton(
                    icon: LucideIcons.checkCircle2,
                    label: 'MARK PRESENT',
                    color: const Color(0xFF10B981),
                    onTap: () => _showCorrectionDialog(
                      context: context,
                      ref: ref,
                      event: event,
                      title: 'Correction Remark',
                      hint: 'Incorrectly marked absent',
                      attendance: 110,
                      initialValue: 'Incorrectly marked absent',
                    ),
                  ),
                ),
              ],
            ),
          ],
          if ((event.isCorrection || event.isExtra) &&
              event.trackingId != null) ...[
            const SizedBox(height: 16),
            _ActionButton(
              icon: LucideIcons.trash2,
              label: 'DELETE RECORD',
              color: Colors.redAccent,
              onTap: () => _deleteRecord(context, ref, event.trackingId!),
              isFullWidth: true,
            ),
          ],
        ],
      ),
    );
  }


  void _deleteRecord(BuildContext context, WidgetRef ref, int id) {
    showDialog(
      context: context,
      builder: (context) {
        bool isDeleting = false;
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
                  color: Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w900,
                ),
              ),
              content: Text(
                'Are you sure you want to delete this custom record? This cannot be undone.',
                style: GoogleFonts.manrope(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.85),
                  fontSize: 14,
                ),
              ),
              actionsPadding: const EdgeInsets.only(right: 16, bottom: 16),
              actions: [
                TextButton(
                  onPressed: isDeleting ? null : () => Navigator.pop(context),
                  child: Text(
                    'CANCEL',
                    style: GoogleFonts.manrope(
                      color: isDeleting
                          ? Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.1)
                          : Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.75),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      letterSpacing: 1,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
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
                          } catch (e, st) {
                            AppLogger.eWithContext(
                              'AttendanceCalendarScreen: Failed to delete record',
                              error: e,
                              stackTrace: st,
                              tags: {
                                'feature': 'attendance_calendar',
                                'action': 'delete_record',
                              },
                              extras: {'tracking.id': id},
                            );
                            if (context.mounted) {
                              setDialogState(() => isDeleting = false);
                              ServiceToast.show(
                                context,
                                'We encountered an error while deleting this record. Please try again later. If the issue persists, please contact us.',
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
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
                      : Text(
                          'DELETE',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            letterSpacing: 1,
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

  void _showCorrectionDialog({
    required BuildContext context,
    required WidgetRef ref,
    required _CalendarEvent event,
    required String title,
    required String hint,
    required int attendance,
    String? initialValue,
  }) {
    final controller = TextEditingController(text: initialValue);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Theme.of(context).colorScheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          title,
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
              'Enter a remark for this correction:',
              style: GoogleFonts.manrope(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.85),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              autofocus: true,
              style: GoogleFonts.manrope(
                color: Theme.of(context).colorScheme.onSurface,
              ),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: GoogleFonts.manrope(
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.4,
                  ),
                  fontSize: 13,
                ),
                filled: true,
                fillColor: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          Builder(
            builder: (context) {
              bool isSubmitting = false;
              return StatefulBuilder(
                builder: (context, setDialogState) {
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: isSubmitting
                            ? null
                            : () => Navigator.pop(context),
                        child: Text(
                          'Cancel',
                          style: GoogleFonts.manrope(
                            color: isSubmitting
                                ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1)
                                : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: isSubmitting
                            ? null
                            : () async {
                                setDialogState(() => isSubmitting = true);
                                try {
                                  await ref
                                      .read(trackingProvider.notifier)
                                      .insertRecord(
                                        date: event.dbDate,
                                        session: event.rawSessionKey,
                                        status: 'correction',
                                        attendance: attendance,
                                        courseId: event.courseId,
                                        remarks: controller.text.trim().isEmpty ? null : controller.text.trim(),
                                      );
                                  if (context.mounted) {
                                    Navigator.pop(context);
                                    ServiceToast.show(
                                      context,
                                      attendance == 225 ? 'Marked as duty leave' : 'Marked as present',
                                    );
                                  }
                                } catch (e, st) {
                                  AppLogger.eWithContext(
                                    'AttendanceCalendarScreen: Failed to mark correction',
                                    error: e,
                                    stackTrace: st,
                                    tags: {
                                      'feature': 'attendance_calendar',
                                      'action': 'mark_correction',
                                    },
                                    extras: {
                                      'attendance.date': event.dbDate,
                                      'attendance.session': event.rawSessionKey,
                                      'attendance.course_id': event.courseId,
                                      'attendance.code': attendance,
                                    },
                                  );
                                  if (context.mounted) {
                                    setDialogState(() => isSubmitting = false);
                                    ServiceToast.show(
                                      context,
                                      'We encountered an error while updating attendance. Please try again later. If the issue persists, please contact us.',
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
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(isSubmitting ? 'ADDING...' : 'Confirm'),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }
}

class _CorrectionTag extends StatelessWidget {
  final String originalStatus;
  const _CorrectionTag({required this.originalStatus});

  @override
  Widget build(BuildContext context) {
    const color = Color(0xFFA855F7);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.1 : 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.rotateCcw, size: 10, color: color),
          const SizedBox(width: 6),
          Text(
            'CORRECTION',
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _SelfMarkedTag extends StatelessWidget {
  const _SelfMarkedTag();

  @override
  Widget build(BuildContext context) {
    const color = Color(0xFF6366F1);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.1 : 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.mousePointer2, size: 10, color: color),
          const SizedBox(width: 6),
          Text(
            'SELF-MARKED',
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool isFullWidth;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.isFullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // For light mode, use a solid color background for readability (Accessibility improvement)
    final bgColor = color;

    final contentColor = Colors.white;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
          border: isDark
              ? Border.all(color: color.withValues(alpha: 0.1), width: 1.5)
              : null,
          boxShadow: !isDark
              ? [
                  BoxShadow(
                    color: color.withValues(alpha: 0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: contentColor),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: contentColor,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptySessionsView extends StatelessWidget {
  const _EmptySessionsView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.calendarX2,
            size: 48,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.2),
          ),
          const SizedBox(height: 16),
          Text(
            'No recorded sessions for this day.',
            style: GoogleFonts.manrope(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// Local _ErrorView removed in favor of centralized ServiceErrorView

class _CalendarLegend extends StatelessWidget {
  const _CalendarLegend();

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Wrap(
        spacing: 16,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: [
          _LegendItem(
            label: 'absent',
            color: ghostColors?.dangerRed ?? const Color(0xFFEF4444),
          ),
          _LegendItem(
            label: 'other leave',
            color: ghostColors?.accentBlue ?? const Color(0xFF3B82F6),
          ),
          _LegendItem(
            label: 'duty leave',
            color: ghostColors?.accentOrange ?? const Color(0xFFF59E0B),
          ),
          _LegendItem(
            label: 'present',
            color: ghostColors?.successGreen ?? const Color(0xFF10B981),
          ),
          _LegendItem(
            label: 'today',
            color:
                ghostColors?.brandPrimary ??
                Theme.of(context).colorScheme.primary,
            isRing: true,
          ),
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final String label;
  final Color color;
  final bool isRing;

  const _LegendItem({
    required this.label,
    required this.color,
    this.isRing = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: isRing ? Colors.transparent : color.withValues(alpha: 0.2),
            shape: BoxShape.circle,
            border: Border.all(
              color: color.withValues(alpha: isRing ? 1.0 : 0.45),
              width: 1.2,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}
