import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:ghostclass/providers/tracking_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/widgets/dashboard/course_list_section.dart';
import 'package:ghostclass/widgets/dashboard/header_section.dart';
import 'package:ghostclass/widgets/dashboard/progress_section.dart';
import 'package:ghostclass/widgets/dashboard/stats_grid_section.dart';
import 'package:ghostclass/widgets/dashboard/trend_chart.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final dashboardState = ref.watch(dashboardProvider);
    final data = dashboardState.value;

    if (dashboardState.isLoading) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: const LoadingOverlay(isFullScreen: false, showLogo: false),
      );
    }

    if (dashboardState.hasError || data == null) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: ServiceErrorView(
          error: dashboardState.error,
          onRetry: () async {
            ref.read(apiServiceProvider).clearCaches();
            ref.invalidate(dashboardProvider);
            ref.invalidate(institutionsProvider);
            try {
              await ref.read(dashboardProvider.future);
            } catch (e, st) {
              AppLogger.e('DashboardScreen: Retry failed', e, st);
            }
          },
        ),
      );
    }

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: _DashboardContent(data: data),
    );
  }
}

class _DashboardContent extends ConsumerWidget {
  final DashboardData data;
  const _DashboardContent({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userSettings = ref.watch(authProvider.select((v) => v.value?.settings));
    final bunkEnabled = userSettings?.bunkCalculatorEnabled ?? true;
    final targetValue = (userSettings?.targetPercentage ?? 75).toDouble();

    return ServiceRefreshIndicator(
      onRefresh: () async {
        final trackingNotifier = ref.read(trackingProvider.notifier);
        final dashboardNotifier = ref.read(dashboardProvider.notifier);
        // Refresh profile, tracking (EzyGo sync), and dashboard
        await ref.read(authProvider.notifier).refreshProfile();
        await trackingNotifier.refresh(forceSync: true);
        await dashboardNotifier.refresh();
      },
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          HeaderSection(data: data),
          OverallProgressSection(stats: data.stats, targetValue: targetValue),
          TrendChartSection(
            stats: data.stats,
            targetPercentage: targetValue,
            disabledCodes: data.disabledCodes,
          ),
          StatsGridSection(stats: data.stats, activeCount: data.courses.length),
          const CourseLineupHeader(),
          CourseListSection(
            courses: data.courses,
            stats: data.stats,
            selectedSemester: data.selectedSemester,
            selectedYear: data.selectedYear,
            bunkEnabled: bunkEnabled,
            targetPercentage: targetValue,
            instructors: data.instructors,
            className: data.className,
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: MediaQuery.of(context).padding.bottom + 90,
            ),
          ),
        ],
      ),
    );
  }
}
