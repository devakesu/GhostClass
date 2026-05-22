import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/logic/error_handler.dart';
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/models/course_details.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/providers/tracking_ui_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/services/refresh_coordinator.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:ghostclass/widgets/tracking/tracking_course_section.dart';
import 'package:ghostclass/widgets/tracking/tracking_empty_state.dart';
import 'package:ghostclass/widgets/tracking/tracking_filter_chip.dart';
import 'package:ghostclass/widgets/tracking/tracking_header_widgets.dart';
import 'package:ghostclass/widgets/tracking/tracking_subject_picker.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

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
        body: const LoadingOverlay(isFullScreen: false, showLogo: false),
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
              await ref
                  .read(trackingProvider.future)
                  .timeout(const Duration(seconds: 10));
            } on Object catch (e, st) {
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
    final sortedCourseKeys = ref.watch(trackingSortedKeysProvider);

    // Auto-revert filter if subject no longer has records
    if (_selectedCourse != 'all' &&
        !sortedCourseKeys.contains(_selectedCourse)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _selectedCourse != 'all') {
          setState(() => _selectedCourse = 'all');
        }
      });
    }

    final auth = ref.watch(authProvider).value;
    final disabledMap = auth?.settings.disabledCourses ?? {};
    final semKey = '${dashboard?.selectedYear}-${dashboard?.selectedSemester}';
    final disabledCodes =
        (disabledMap[semKey] as Map?)?.keys
            .map((c) => c.toString().toUpperCase())
            .toSet() ??
        {};

    final filteredCourseKeys = _selectedCourse == 'all'
        ? sortedCourseKeys.where((k) {
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
        : sortedCourseKeys.where((k) => k == _selectedCourse).toList();

    return ServiceRefreshIndicator(
      onRefresh: () async {
        try {
          await runUnifiedPullToRefresh(
            logLabel: 'TrackingScreen',
            refreshProfile: () => ref.read(authProvider.notifier).refreshProfile(force: true),
            syncCron: () async {
              final supabaseToken = ref
                  .read(supabaseClientProvider)
                  .auth
                  .currentSession
                  ?.accessToken;
              if (supabaseToken == null) return;
              await ref.read(apiServiceProvider).triggerSync(supabaseToken, force: true);
            },
            refreshData: () => ref.read(trackingProvider.notifier).refresh(),
          );
        } on Object catch (e, st) {
          AppLogger.e('TrackingScreen: Pull-to-refresh failed', e, st);
          if (!mounted) rethrow;
          ServiceToast.show(context, 'Refresh failed', isError: true);
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
                          HeaderBadge(count: data.totalCount),
                          if (data.totalCount > 0) ...[
                            const SizedBox(height: 8),
                            Material(
                              color: Colors.transparent,
                              child: DeleteAllButton(
                                label: _selectedCourse == 'all'
                                    ? 'Delete All'
                                    : 'Clear Subject',
                                onPressed: _showDeleteAllConfirm,
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
                        child: TrackingFilterChip(
                          selectedCourse: _selectedCourse,
                          officialReport: data.officialReport,
                          allCourses: dashboard?.courses,
                          onTap: () => _showSubjectPicker(
                            data.groupedByCourse,
                            data.officialReport,
                            dashboard?.courses,
                            sortedCourseKeys,
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
              child: EmptyTrackingState(),
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
            TrackingCourseSection(
              courseKey: courseKey,
              records: data.groupedByCourse[courseKey] ?? [],
              officialReport: data.officialReport,
              allCourses: dashboard?.courses,
              onDelete: _showDeleteRecordConfirm,
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
    AppLogger.safeUnawait(
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        builder: (context) => TrackingSubjectPicker(
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
      ).catchError(
        (Object e, StackTrace st) =>
            AppLogger.e('TrackingScreen: showModalBottomSheet failed', e, st),
      ),
      'TrackingScreen: subject picker',
    );
  }

  void _showDeleteAllConfirm() {
    final academic = ref.read(academicProvider).value;
    final dashboard = ref.read(dashboardProvider).value;
    final tracking = ref.read(trackingProvider).value;

    final isFiltered = _selectedCourse != 'all';
    var subjectName = '';

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

    AppLogger.safeUnawait(
      showDialog<void>(
        context: context,
        builder: (context) {
          var isDeleting = false;
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
                          } on Object catch (e, st) {
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
      ).catchError(
        (Object e, StackTrace st) => AppLogger.e(
          'TrackingScreen: showDeleteAllConfirm dialog failed',
          e,
          st,
        ),
      ),
      'TrackingScreen: delete all confirm',
    );
  }

  void _showDeleteRecordConfirm(int id) {
    AppLogger.safeUnawait(
      showDialog<void>(
        context: context,
        builder: (context) {
          var isDeleting = false;
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
                          } on Object catch (e, st) {
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
      ).catchError(
        (Object e, StackTrace st) => AppLogger.e(
          'TrackingScreen: showDeleteRecordConfirm dialog failed',
          e,
          st,
        ),
      ),
      'TrackingScreen: delete record confirm',
    );
  }
}

class _ModalHeaderDelegate extends SliverPersistentHeaderDelegate {
  _ModalHeaderDelegate({required this.onClose});
  final VoidCallback onClose;

  @override
  double get minExtent => 64;
  @override
  double get maxExtent => 64;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return SizedBox(
      height: 64,
      child: Container(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Image.asset(
              'assets/images/logo.png',
              height: 60,
              fit: BoxFit.contain,
            ),
            Semantics(
              button: true,
              label: 'Close bottom sheet',
              child: InkWell(
                onTap: onClose,
                borderRadius: BorderRadius.circular(20),
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
  bool shouldRebuild(_ModalHeaderDelegate oldDelegate) {
    return oldDelegate.onClose != onClose;
  }
}
