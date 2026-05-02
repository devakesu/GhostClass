import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
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

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({super.key});

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen>
    with ErrorHandlerMixin {
  String _selectedCourse = 'all';

  @override
  Widget build(BuildContext context) {
    final trackingState = ref.watch(trackingProvider);
    final dashboardAsync = ref.watch(dashboardProvider);
    final data = trackingState.value;
    final dashboard = dashboardAsync.value;

    if (trackingState.isLoading) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: LoadingOverlay(isFullScreen: false, showLogo: false),
      );
    }

    if (trackingState.hasError || data == null) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: ServiceErrorView(
          error: trackingState.error,
          onRetry: () async {
            ref.read(apiServiceProvider).clearCaches();
            ref.invalidate(trackingProvider);
            try {
              await ref.read(trackingProvider.future);
            } catch (e, st) {
              AppLogger.e('TrackingScreen: Retry failed', e, st);
            }
          },
        ),
      );
    }

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: _buildContent(data, dashboard),
    );
  }

  Widget _buildContent(TrackingState data, DashboardData? dashboard) {
    // Combine all unique course identifiers from both tracking records and the dashboard
    final Set<String> uniqueKeys = {
      ...data.groupedByCourse.keys.where(
        (k) => data.groupedByCourse[k]?.isNotEmpty ?? false,
      ),
    };

    final courseKeys = uniqueKeys.toList();
    courseKeys.sort((a, b) {
      final mergedA = (dashboard?.courses ?? [])
          .cast<CourseDetails?>()
          .firstWhere((c) => c?.safeId == a, orElse: () => null);
      final mergedB = (dashboard?.courses ?? [])
          .cast<CourseDetails?>()
          .firstWhere((c) => c?.safeId == b, orElse: () => null);

      final codeA = utils.resolveCourseDisplayCode(
        courseKey: a,
        mergedCourse: mergedA,
        officialReport: data.officialReport,
      );
      final codeB = utils.resolveCourseDisplayCode(
        courseKey: b,
        mergedCourse: mergedB,
        officialReport: data.officialReport,
      );

      final auth = ref.read(authProvider).value;
      final disabledMap = auth?.settings.disabledCourses ?? {};
      final semKey =
          '${dashboard?.selectedYear}-${dashboard?.selectedSemester}';
      final disabledCodes = (disabledMap[semKey] ?? {}).keys
          .map((c) => c.toUpperCase())
          .toSet();

      final aDisabled = disabledCodes.contains((codeA ?? '').toUpperCase());
      final bDisabled = disabledCodes.contains((codeB ?? '').toUpperCase());

      // Tier 1: Disabled at the bottom
      if (aDisabled != bDisabled) return aDisabled ? 1 : -1;

      // Tier 2: Alpha sort
      final nameA = utils.resolveCourseDisplayName(
        courseKey: a,
        mergedCourse: mergedA,
        officialReport: data.officialReport,
      );
      final nameB = utils.resolveCourseDisplayName(
        courseKey: b,
        mergedCourse: mergedB,
        officialReport: data.officialReport,
      );
      return nameA.toLowerCase().compareTo(nameB.toLowerCase());
    });

    final auth = ref.watch(authProvider).value;
    final disabledMap = auth?.settings.disabledCourses ?? {};
    final semKey = '${dashboard?.selectedYear}-${dashboard?.selectedSemester}';
    final disabledCodes = (disabledMap[semKey] ?? {}).keys
        .map((c) => c.toUpperCase())
        .toSet();

    final filteredCourseKeys = _selectedCourse == 'all'
        ? courseKeys.where((k) {
            final mergedCourse = (dashboard?.courses ?? [])
                .cast<CourseDetails?>()
                .firstWhere((c) => c?.safeId == k, orElse: () => null);
            final displayCode = utils.resolveCourseDisplayCode(
              courseKey: k,
              mergedCourse: mergedCourse,
              officialReport: data.officialReport,
            );
            return !disabledCodes.contains((displayCode ?? '').toUpperCase());
          }).toList()
        : courseKeys.where((k) => k == _selectedCourse).toList();

    return ServiceRefreshIndicator(
      onRefresh: () async {
        try {
          final trackingNotifier = ref.read(trackingProvider.notifier);
          await trackingNotifier.refresh(forceSync: true);
        } catch (e, st) {
          AppLogger.e('TrackingScreen: Pull-to-refresh failed', e, st);
          await handleError(e, title: 'Refresh Failed');
        }
      },
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          // --- Sticky Modal Header ---
          SliverPersistentHeader(
            pinned: true,
            delegate: _ModalHeaderDelegate(
              onClose: () => Navigator.pop(context),
            ),
          ),

          // --- Header ---
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'Attendance Tracker',
                          style: GoogleFonts.manrope(
                            fontSize: 32,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.onSurface,
                            letterSpacing: -1.5,
                            height: 1.1,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _HeaderBadge(count: data.totalCount),
                          if (data.totalCount > 0) ...[
                            const SizedBox(height: 8),
                            Material(
                              color: Colors.transparent,
                              child: _DeleteAllButton(
                                label: _selectedCourse == 'all'
                                    ? 'Delete All'
                                    : 'Clear Subject',
                                onPressed: () => _showDeleteAllConfirm(),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: _FilterChip(
                          selectedCourse: _selectedCourse,
                          officialReport: data.officialReport,
                          allCourses: dashboard?.courses,
                          onTap: () => _showSubjectPicker(
                            data.groupedByCourse,
                            data.officialReport,
                            dashboard?.courses,
                            courseKeys,
                          ),
                          onClear: () =>
                              setState(() => _selectedCourse = 'all'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'These are custom-marked attendance records or the absences you have marked for re-checking or duty leave.',
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),

          if (data.totalCount == 0)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyTrackingState(),
            ),

          // --- Sync Indicator ---
          if (data.isSyncing)
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color:
                      (Theme.of(
                                context,
                              ).extension<GhostColors>()?.brandPrimary ??
                              Theme.of(context).colorScheme.primary)
                          .withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color:
                        (Theme.of(
                                  context,
                                ).extension<GhostColors>()?.brandPrimary ??
                                Theme.of(context).colorScheme.primary)
                            .withValues(alpha: 0.1),
                  ),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color:
                            Theme.of(
                              context,
                            ).extension<GhostColors>()?.brandPrimary ??
                            Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                          'Syncing with EzyGo...',
                          style: GoogleFonts.manrope(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color:
                                Theme.of(
                                  context,
                                ).extension<GhostColors>()?.brandPrimary ??
                                Theme.of(context).colorScheme.primary,
                          ),
                        )
                        .animate(onPlay: (c) => c.repeat())
                        .fadeIn(duration: 400.ms)
                        .then()
                        .fadeOut(duration: 400.ms),
                  ],
                ),
              ),
            ),

          // --- Course Sections ---
          for (final courseKey in filteredCourseKeys)
            _CourseSection(
              courseKey: courseKey,
              records: data.groupedByCourse[courseKey] ?? [],
              officialReport: data.officialReport,
              allCourses: dashboard?.courses,
              onDelete: (id) => _showDeleteRecordConfirm(id),
            ),

          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }

  void _showSubjectPicker(
    Map<String, List<TrackingRecord>> groups,
    AttendanceReportDetailed? report,
    List<CourseDetails>? allCourses,
    List<String> keys,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(32)),
      ),
      builder: (context) => _SubjectPickerSheet(
        selectedCourse: _selectedCourse,
        courseKeys: keys,
        groupedByCourse: groups,
        officialReport: report,
        allCourses: allCourses,
        onSelected: (course) {
          setState(() => _selectedCourse = course);
          Navigator.pop(context);
        },
      ),
    );
  }

  void _showDeleteAllConfirm() {
    final academic = ref.read(academicProvider).value;
    final dashboard = ref.read(dashboardProvider).value;
    final tracking = ref.read(trackingProvider).value;

    final bool isFiltered = _selectedCourse != 'all';
    String subjectName = '';

    if (isFiltered) {
      final mergedCourse = (dashboard?.courses ?? [])
          .cast<CourseDetails?>()
          .firstWhere((c) => c?.safeId == _selectedCourse, orElse: () => null);
      subjectName = utils.resolveCourseDisplayName(
        courseKey: _selectedCourse,
        mergedCourse: mergedCourse,
        officialReport: tracking?.officialReport,
      );
    }

    final scopeLabel = isFiltered
        ? subjectName
        : (academic == null
              ? 'the currently selected semester and year'
              : '${academic.semester.toUpperCase()} ${academic.year}');

    final title = isFiltered ? 'Clear Subject Records' : 'Delete All Records';
    final buttonText = isFiltered ? 'CLEAR SUBJECT' : 'DELETE ALL';

    showDialog(
      context: context,
      builder: (context) {
        bool isDeleting = false;
        return StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            backgroundColor: Theme.of(context).colorScheme.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
            ),
            title: Text(
              title,
              style: GoogleFonts.manrope(
                color: Theme.of(context).colorScheme.onSurface,
                fontWeight: FontWeight.w900,
              ),
            ),
            content: Text(
              'This will permanently delete all tracking data for $scopeLabel. This cannot be undone.',
              style: GoogleFonts.manrope(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
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
                          ).colorScheme.onSurface.withValues(alpha: 0.4),
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
                              .clearRecords(
                                courseId: isFiltered ? _selectedCourse : null,
                              );
                          if (context.mounted) {
                            Navigator.pop(context);
                            setState(() => _selectedCourse = 'all');
                            ServiceToast.show(
                              context,
                              'Records deleted successfully',
                            );
                          }
                        } catch (e, st) {
                          AppLogger.e(
                            'TrackingScreen: Clear records failed',
                            e,
                            st,
                          );
                          if (context.mounted) {
                            setDialogState(() => isDeleting = false);
                            ServiceToast.show(
                              context,
                              'We encountered an error while deleting records. Please try again later. If the issue persists, please contact us.',
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
                        buttonText,
                        style: GoogleFonts.manrope(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          letterSpacing: 1,
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showDeleteRecordConfirm(int id) {
    showDialog(
      context: context,
      builder: (context) {
        bool isDeleting = false;
        return StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
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
              'Are you sure you want to delete this tracking record? This cannot be undone.',
              style: GoogleFonts.manrope(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
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
                          ).colorScheme.onSurface.withValues(alpha: 0.4),
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
                          AppLogger.e(
                            'TrackingScreen: Delete record failed',
                            e,
                            st,
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
          ),
        );
      },
    );
  }
}

class _SubjectPickerSheet extends ConsumerWidget {
  final String selectedCourse;
  final List<String> courseKeys;
  final Map<String, List<TrackingRecord>> groupedByCourse;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final Function(String) onSelected;

  const _SubjectPickerSheet({
    required this.selectedCourse,
    required this.courseKeys,
    required this.groupedByCourse,
    required this.onSelected,
    this.officialReport,
    this.allCourses,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final primary = Theme.of(context).colorScheme.primary;
    final surface = Theme.of(context).colorScheme.surface;

    return Container(
      padding: const EdgeInsets.all(24),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
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
            'Select Subject',
            style: GoogleFonts.manrope(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 20),
          Flexible(
            child: Scrollbar(
              thumbVisibility: true,
              thickness: 4,
              radius: const Radius.circular(2),
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(right: 8),
                physics: const BouncingScrollPhysics(),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _PickerChip(
                      label: 'All Subjects',
                      count: groupedByCourse.values.fold(
                        0,
                        (p, c) => p + c.length,
                      ),
                      isSelected: selectedCourse == 'all',
                      onTap: () => onSelected('all'),
                      primary: primary,
                      surface: surface,
                    ),
                    ...courseKeys.map((key) {
                      final isSelected = selectedCourse == key;
                      final normKey = key.trim().toUpperCase();
                      final mergedCourse = (allCourses ?? []).firstWhere(
                        (c) =>
                            c.safeId.trim().toUpperCase() == normKey ||
                            (c.code ?? '').trim().toUpperCase() == normKey,
                        orElse: () => CourseDetails(id: 0, name: key),
                      );
                      final isDisabled =
                          ref
                              .watch(authProvider)
                              .value
                              ?.settings
                              .disabledCourses['${ref.watch(dashboardProvider).value?.selectedYear}-${ref.watch(dashboardProvider).value?.selectedSemester}']
                              ?.containsKey(
                                utils
                                    .resolveCourseDisplayCode(
                                      courseKey: key,
                                      mergedCourse: mergedCourse,
                                      officialReport: officialReport,
                                    )
                                    ?.toUpperCase(),
                              ) ??
                          false;

                      final label = utils.resolveCourseDisplayName(
                        courseKey: key,
                        mergedCourse: mergedCourse,
                        officialReport: officialReport,
                      );
                      final count = groupedByCourse[key]?.length ?? 0;
                      return _PickerChip(
                        label: isDisabled ? '$label (Disabled)' : label,
                        count: count,
                        isSelected: isSelected,
                        isDisabled: isDisabled,
                        onTap: () => onSelected(key),
                        primary: primary,
                        surface: surface,
                      );
                    }),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _PickerChip extends StatelessWidget {
  final String label;
  final int count;
  final bool isSelected;
  final VoidCallback onTap;
  final Color primary;
  final Color surface;

  final bool isDisabled;

  const _PickerChip({
    required this.label,
    required this.count,
    required this.isSelected,
    required this.onTap,
    required this.primary,
    required this.surface,
    this.isDisabled = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? primary : surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? primary.withValues(alpha: isDark ? 0.35 : 0.8)
                : isDisabled
                ? Theme.of(context).colorScheme.outlineVariant.withValues(
                    alpha: isDark ? 0.2 : 0.1,
                  )
                : Theme.of(context).colorScheme.outlineVariant.withValues(
                    alpha: isDark ? 0.25 : 0.35,
                  ),
          ),
          boxShadow: isSelected && !isDark
              ? [
                  BoxShadow(
                    color: primary.withValues(alpha: 0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w700,
                  fontStyle: isDisabled ? FontStyle.italic : FontStyle.normal,
                  color: isSelected
                      ? Colors.white
                      : isDisabled
                      ? Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.3)
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.8),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.white.withValues(alpha: 0.2)
                    : primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                count.toString(),
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: isSelected ? Colors.white : primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String selectedCourse;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final VoidCallback onTap;
  final VoidCallback onClear;

  const _FilterChip({
    required this.selectedCourse,
    required this.onTap,
    required this.onClear,
    this.officialReport,
    this.allCourses,
  });

  @override
  Widget build(BuildContext context) {
    final isFiltered = selectedCourse != 'all';
    String label = 'All Subjects';

    if (isFiltered) {
      final normKey = selectedCourse.trim().toUpperCase();
      final mergedCourse = (allCourses ?? []).firstWhere(
        (c) => c.safeId.trim().toUpperCase() == normKey,
        orElse: () => CourseDetails(id: 0, name: selectedCourse),
      );
      label = utils.resolveCourseDisplayName(
        courseKey: selectedCourse,
        mergedCourse: mergedCourse,
        officialReport: officialReport,
      );
    }

    return Semantics(
      button: true,
      label: 'Filter by $label ${isFiltered ? "active filter" : "unfiltered"}',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: isFiltered
                ? (Theme.of(context).extension<GhostColors>()?.brandPrimary ??
                          Theme.of(context).colorScheme.primary)
                      .withValues(alpha: 0.1)
                : Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isFiltered
                  ? (Theme.of(context).extension<GhostColors>()?.brandPrimary ??
                            Theme.of(context).colorScheme.primary)
                        .withValues(alpha: 0.45)
                  : Theme.of(
                      context,
                    ).colorScheme.outlineVariant.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isFiltered ? LucideIcons.filter : LucideIcons.slidersHorizontal,
                size: 14,
                color: isFiltered
                    ? (Theme.of(
                            context,
                          ).extension<GhostColors>()?.brandPrimary ??
                          Theme.of(context).colorScheme.primary)
                    : Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: isFiltered
                        ? Theme.of(context).colorScheme.onSurface
                        : Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              if (isFiltered) ...[
                const SizedBox(width: 8),
                Semantics(
                  button: true,
                  label: 'Clear filter $label',
                  child: GestureDetector(
                    onTap: () {
                      onClear();
                    },
                    child: Icon(
                      LucideIcons.x,
                      size: 14,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.2),
                    ),
                  ),
                ),
              ] else ...[
                const SizedBox(width: 4),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.2),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderBadge extends StatelessWidget {
  final int count;
  const _HeaderBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color:
            (Theme.of(context).extension<GhostColors>()?.accentOrange ??
                    Colors.orange)
                .withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color:
              (Theme.of(context).extension<GhostColors>()?.accentOrange ??
                      Colors.orange)
                  .withValues(alpha: 0.45),
        ),
        boxShadow: [
          BoxShadow(
            color:
                (Theme.of(context).extension<GhostColors>()?.accentOrange ??
                        Colors.orange)
                    .withValues(alpha: 0.05),
            blurRadius: 10,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Text(
        '$count CLASSES',
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          color:
              Theme.of(context).extension<GhostColors>()?.accentOrange ??
              Colors.orange,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _DeleteAllButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;
  const _DeleteAllButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color:
              (Theme.of(context).extension<GhostColors>()?.dangerRed ??
                      Theme.of(context).colorScheme.error)
                  .withValues(
                    alpha: Theme.of(context).brightness == Brightness.dark
                        ? 0.08
                        : 0.12,
                  ),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color:
                (Theme.of(context).extension<GhostColors>()?.dangerRed ??
                        Theme.of(context).colorScheme.error)
                    .withValues(alpha: 0.45),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.trash2,
              size: 14,
              color:
                  Theme.of(context).extension<GhostColors>()?.dangerRed ??
                  Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 11,
                color:
                    Theme.of(context).extension<GhostColors>()?.dangerRed ??
                    Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CourseSection extends StatelessWidget {
  final String courseKey;
  final List<TrackingRecord> records;
  final AttendanceReportDetailed? officialReport;
  final List<CourseDetails>? allCourses;
  final Function(int) onDelete;

  const _CourseSection({
    required this.courseKey,
    required this.records,
    required this.onDelete,
    this.officialReport,
    this.allCourses,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final normKey = courseKey.trim().toUpperCase();
    final mergedCourse = (allCourses ?? []).firstWhere(
      (c) =>
          c.safeId.trim().toUpperCase() == normKey ||
          (c.code ?? '').trim().toUpperCase() == normKey,
      orElse: () => CourseDetails(id: 0, name: courseKey),
    );
    final courseName = utils.resolveCourseDisplayName(
      courseKey: courseKey,
      mergedCourse: mergedCourse,
      officialReport: officialReport,
    );
    final courseCode = utils.resolveCourseDisplayCode(
      courseKey: courseKey,
      mergedCourse: mergedCourse,
      officialReport: officialReport,
    );

    final Map<String, List<TrackingRecord>> statusGroups = {
      'Present': [],
      'Duty Leave': [],
      'Absent': [],
    };

    for (final record in records) {
      final code = record.attendance is int
          ? record.attendance
          : int.tryParse(record.attendance.toString());
      if (code == 225) {
        statusGroups['Duty Leave']!.add(record);
      } else if (code == 111) {
        statusGroups['Absent']!.add(record);
      } else {
        statusGroups['Present']!.add(record);
      }
    }

    final activeStatuses = statusGroups.keys
        .where((k) => statusGroups[k]!.isNotEmpty)
        .toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: _StickyHeaderDelegate(
            height: 70,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary.withValues(
                        alpha: isDark ? 0.25 : 0.12,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      LucideIcons.bookOpen,
                      size: 16,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          courseName.toUpperCase(),
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.8),
                            letterSpacing: 0.2,
                            height: 1.1,
                          ),
                        ),
                        if (courseCode != null)
                          Text(
                            courseCode,
                            style: GoogleFonts.manrope(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurface.withValues(alpha: 0.4),
                              height: 1.1,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${records.length}',
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        for (final status in activeStatuses) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
              child: _StatusSubHeader(
                status: status,
                count: statusGroups[status]!.length,
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate((context, index) {
                final record = statusGroups[status]![index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _TrackingCard(
                    record: record,
                    officialReport: officialReport,
                    onDelete: () => onDelete(record.id),
                  ),
                );
              }, childCount: statusGroups[status]!.length),
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusSubHeader extends StatelessWidget {
  final String status;
  final int count;

  const _StatusSubHeader({required this.status, required this.count});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>()!;
    Color color = ghostColors.successGreen ?? Colors.green;
    if (status == 'Duty Leave') {
      color = ghostColors.accentOrange ?? Colors.orange;
    }
    if (status == 'Absent') {
      color = ghostColors.dangerRed ?? Colors.red;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: Theme.of(context).brightness == Brightness.dark ? 0.05 : 0.08,
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            status.toUpperCase(),
            style: GoogleFonts.manrope(
              fontSize: 9,
              fontWeight: FontWeight.w900,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$count',
            style: GoogleFonts.manrope(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: color.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackingCard extends StatelessWidget {
  final TrackingRecord record;
  final AttendanceReportDetailed? officialReport;
  final VoidCallback onDelete;

  const _TrackingCard({
    required this.record,
    required this.onDelete,
    this.officialReport,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCorrection = record.status == 'correction';
    final typeLabel = isCorrection ? 'Correction' : 'Extra';
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final typeColor = isCorrection
        ? (ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary)
        : (ghostColors?.accentBlue ?? Colors.blue);

    String statusText = _getUserLabel(record.attendance);
    if (isCorrection && officialReport != null) {
      final dateNorm = record.date.replaceAll('-', '');
      final sessionNorm = utils.toRoman(utils.normalizeSession(record.session));
      final session =
          officialReport!.studentAttendanceData[dateNorm]?[sessionNorm];

      String officialLabel = 'Absent';
      if (session != null) {
        final offCode = _toInt(session.attendance);
        if (offCode == 110) {
          officialLabel = 'Present';
        } else if (offCode == 111) {
          officialLabel = 'Absent';
        } else if (offCode == 225) {
          officialLabel = 'Duty Leave';
        }
      }
      statusText = '$officialLabel → $statusText';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark
            ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.03)
            : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: isDark
            ? Border.all(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withValues(alpha: 0.1),
              )
            : null,
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  utils.formatSessionName(
                    _resolveDisplaySession(record, officialReport),
                  ),
                  style: GoogleFonts.manrope(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.9),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _Badge(label: typeLabel, color: typeColor),
                  const SizedBox(height: 4),
                  _Badge(
                    label: statusText,
                    color: _getStatusColor(context, record.attendance),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _formatDate(record.date),
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.6),
                  fontWeight: FontWeight.w600,
                ),
              ),
              _DeleteButton(onPressed: onDelete),
            ],
          ),
          if (record.remarks != null &&
              record.remarks!.isNotEmpty &&
              !utils.remarkPlaceholders.contains(record.remarks!.trim())) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color:
                    (Theme.of(context).extension<GhostColors>()?.accentOrange ??
                            Colors.orange)
                        .withValues(alpha: 0.03),
                borderRadius: BorderRadius.circular(10),
                border: isDark
                    ? Border.all(
                        color:
                            (Theme.of(
                                      context,
                                    ).extension<GhostColors>()?.accentOrange ??
                                    Colors.orange)
                                .withValues(alpha: 0.15),
                      )
                    : null,
              ),
              child: Text(
                record.remarks!,
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color:
                      (Theme.of(
                        context,
                      ).extension<GhostColors>()?.accentOrange ??
                      Colors.orange),
                  fontStyle: FontStyle.italic,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _resolveDisplaySession(
    TrackingRecord record,
    AttendanceReportDetailed? report,
  ) {
    if (report == null) return record.session;

    final dateNorm = record.date.replaceAll('-', '');
    final sessions = report.studentAttendanceData[dateNorm];
    if (sessions == null) return record.session;

    // 1. If it matches a raw session key, find its index
    // Note: Integer keys in JSON maps are ordered ascending by default in Dart's decode
    int idx = 0;
    bool found = false;
    for (final key in sessions.keys) {
      if (key == record.session) {
        found = true;
        break;
      }
      idx++;
    }

    // 2. If found and the original was a large ID, map to index + 1
    if (found) {
      final sNum = int.tryParse(record.session);
      if (sNum != null && sNum > 20) {
        return (idx + 1).toString();
      }
    }

    return record.session;
  }

  int _toInt(dynamic v) => (v is int) ? v : int.tryParse(v.toString()) ?? 0;

  String _getUserLabel(dynamic attendance) {
    final code = _toInt(attendance);
    if (code == 225) return 'Duty Leave';
    if (code == 111) return 'Absent';
    return 'Present';
  }

  Color _getStatusColor(BuildContext context, dynamic attendance) {
    final code = _toInt(attendance);
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (code == 225) return ghostColors?.accentOrange ?? Colors.orange;
    if (code == 111) return ghostColors?.dangerRed ?? Colors.red;
    return ghostColors?.successGreen ?? Colors.green;
  }

  String _formatDate(String dateStr) {
    final date = DateTime.tryParse(dateStr);
    if (date == null) return dateStr;
    return DateFormat('EEE, MMM d, y').format(date);
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: Theme.of(context).brightness == Brightness.dark ? 0.15 : 0.1,
        ),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label.toUpperCase(),
        style: GoogleFonts.manrope(
          fontSize: 9,
          fontWeight: FontWeight.w900,
          color: color,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _DeleteButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _DeleteButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Delete tracked event',
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color:
                (Theme.of(context).extension<GhostColors>()?.dangerRed ??
                        Theme.of(context).colorScheme.error)
                    .withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(
            LucideIcons.trash2,
            color:
                Theme.of(context).extension<GhostColors>()?.dangerRed ??
                Theme.of(context).colorScheme.error,
            size: 14,
          ),
        ),
      ),
    );
  }
}

class _EmptyTrackingState extends StatelessWidget {
  const _EmptyTrackingState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.clipboardList,
            size: 64,
            color: Theme.of(context).colorScheme.onSurface.withValues(
              alpha: Theme.of(context).brightness == Brightness.dark
                  ? 0.1
                  : 0.2,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No tracking records found.',
            style: GoogleFonts.manrope(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Mark attendance from Dashboard or Calendar\nto see them here.',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModalHeaderDelegate extends SliverPersistentHeaderDelegate {
  final VoidCallback onClose;

  _ModalHeaderDelegate({required this.onClose});

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return SizedBox(
      height: 64,
      child: Container(
        color: Theme.of(context).scaffoldBackgroundColor,
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Image.asset('assets/logo.png', height: 60, fit: BoxFit.contain),
            Semantics(
              button: true,
              label: 'Close bottom sheet',
              child: GestureDetector(
                onTap: onClose,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.05),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.1),
                    ),
                  ),
                  child: Icon(
                    LucideIcons.x,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.4),
                    size: 20,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  double get maxExtent => 64.0;

  @override
  double get minExtent => 64.0;

  @override
  bool shouldRebuild(covariant SliverPersistentHeaderDelegate oldDelegate) =>
      false;
}

class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {
  final Widget child;
  final double height;

  _StickyHeaderDelegate({required this.child, this.height = 68});

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      alignment: Alignment.centerLeft,
      child: child,
    );
  }

  @override
  double get maxExtent => height;

  @override
  double get minExtent => height;

  @override
  bool shouldRebuild(covariant _StickyHeaderDelegate oldDelegate) {
    return oldDelegate.child != child || oldDelegate.height != height;
  }
}
