import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/score.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/score_provider.dart';
import 'package:ghostclass/providers/ui_state_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/refresh_coordinator.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/service_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class ScoresScreen extends ConsumerStatefulWidget {
  const ScoresScreen({super.key});

  @override
  ConsumerState<ScoresScreen> createState() => _ScoresScreenState();
}

class _ScoresScreenState extends ConsumerState<ScoresScreen> {
  String _formatDate(DateTime date) {
    return DateFormat('d MMM yyyy').format(date);
  }

  @override
  Widget build(BuildContext context) {
    final scoreState = ref.watch(scoreProvider);

    if (scoreState.isLoading) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: const LoadingOverlay(isFullScreen: false, showLogo: false),
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
          ServiceRefreshIndicator(
            useOverlay: false,
            onRefresh: () async {
              try {
                await runUnifiedPullToRefresh(
                  logLabel: 'ScoresScreen',
                  refreshProfile: () => ref
                      .read(authProvider.notifier)
                      .refreshProfile(force: true),
                  syncCron: () async {
                    final supabaseToken = ref
                        .read(supabaseClientProvider)
                        .auth
                        .currentSession
                        ?.accessToken;
                    if (supabaseToken == null) return;
                    await ref
                        .read(apiServiceProvider)
                        .triggerSync(supabaseToken, force: true);
                  },
                  refreshData: () => ref.read(scoreProvider.notifier).refresh(),
                );
              } on Object {
                if (!context.mounted) rethrow;
                ServiceToast.show(context, 'Refresh failed', isError: true);
                rethrow;
              }
            },
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                // --- Header ---
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                    child: Text(
                      'Internal Marks',
                      style: GoogleFonts.manrope(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).colorScheme.onSurface,
                        letterSpacing: -1.2,
                      ),
                    ),
                  ),
                ),

                // --- Service Filter Bar ---
                SliverToBoxAdapter(
                  child: scoreState.when(
                    data: (data) => _ChipFilterBar(
                      selectedType: data.filterType,
                      onChanged: (type) =>
                          ref.read(scoreProvider.notifier).setFilter(type),
                    ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                ),

                // --- Stats (Matches Web: Total, Scored, Pending) ---
                SliverToBoxAdapter(
                  child: scoreState.when(
                    data: (data) => Padding(
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                      child: Row(
                        children: [
                          _StatCard(
                            label: 'TOTAL',
                            value: data.totalExams.toString(),
                            color:
                                Theme.of(
                                  context,
                                ).extension<GhostColors>()?.brandPrimary ??
                                Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 12),
                          _StatCard(
                            label: 'SCORED',
                            value: data.scoredCount.toString(),
                            color:
                                Theme.of(
                                  context,
                                ).extension<GhostColors>()?.successGreen ??
                                Colors.green,
                          ),
                          const SizedBox(width: 12),
                          _StatCard(
                            label: 'PENDING',
                            value: data.pendingCount.toString(),
                            color:
                                Theme.of(
                                  context,
                                ).extension<GhostColors>()?.dangerRed ??
                                Theme.of(context).colorScheme.error,
                          ),
                        ],
                      ),
                    ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                ),

                // --- Content ---
                scoreState.when(
                  data: (data) => data.groupedExams.isEmpty
                      ? const SliverFillRemaining(child: _EmptyState())
                      : SliverPadding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          sliver: SliverList(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final group = data.groupedExams[index];
                                return _CourseGroupWidget(
                                  group: group,
                                  resolvedScores: data.resolvedScores,
                                  questions: data.questions,
                                  answers: data.answers,
                                  formatDate: _formatDate,
                                );
                              },
                              childCount: data.groupedExams.length,
                            ),
                          ),
                        ),
                  loading: () =>
                      const SliverFillRemaining(child: SizedBox.shrink()),
                  error: (err, _) => const SliverFillRemaining(
                    child: Center(
                      child: Text(
                        'We encountered an error while loading your scores. Please try again later. If the issue persists, please contact us.',
                        style: TextStyle(color: Colors.redAccent),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),

                const SliverToBoxAdapter(child: SizedBox(height: 24)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChipFilterBar extends StatelessWidget {
  const _ChipFilterBar({required this.selectedType, required this.onChanged});
  final String selectedType;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filters = [
      {'key': 'all', 'label': 'All'},
      {'key': 'assessment', 'label': 'Assessments'},
      {'key': 'assignment', 'label': 'Assignments'},
    ];

    return SizedBox(
      height: 56,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = selectedType == filter['key'];
          return Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              child: InkWell(
                onTap: () => onChanged(filter['key']!),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? (Theme.of(
                                context,
                              ).extension<GhostColors>()?.brandPrimary ??
                              Theme.of(context).colorScheme.primary)
                        : Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.1),
                    border: isDark
                        ? Border.all(
                            color: isSelected
                                ? (Theme.of(context)
                                              .extension<GhostColors>()
                                              ?.brandPrimary ??
                                          Theme.of(context).colorScheme.primary)
                                      .withValues(alpha: 0.2)
                                : Theme.of(context).colorScheme.outlineVariant
                                      .withValues(alpha: 0.1),
                          )
                        : null,
                    boxShadow: !isDark && isSelected
                        ? [
                            BoxShadow(
                              color:
                                  (Theme.of(context)
                                              .extension<GhostColors>()
                                              ?.brandPrimary ??
                                          Theme.of(context).colorScheme.primary)
                                      .withValues(alpha: 0.2),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Text(
                    filter['label']!,
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: isSelected
                          ? Colors.white
                          : Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CourseGroupWidget extends ConsumerWidget {
  const _CourseGroupWidget({
    required this.group,
    required this.resolvedScores,
    required this.questions,
    required this.answers,
    required this.formatDate,
  });
  final CourseGroup group;
  final Map<int, ResolvedScore> resolvedScores;
  final Map<int, List<ExamQuestion>> questions;
  final Map<int, List<ExamAnswer>> answers;
  final String Function(DateTime) formatDate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 32, bottom: 16),
          child: Row(
            children: [
              Container(
                width: 3,
                height: 14,
                decoration: BoxDecoration(
                  color:
                      Theme.of(
                        context,
                      ).extension<GhostColors>()?.brandPrimary ??
                      Theme.of(context).colorScheme.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  group.label.toUpperCase(),
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.onSurface,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '${group.exams.length} items',
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ],
          ),
        ),
        ...group.exams.map(
          (exam) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _ScoreCard(
              exam: exam,
              resolved: resolvedScores[exam.id],
              onTap: () => _showDetailSheet(context, ref, exam),
              formatDate: formatDate,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _showDetailSheet(
    BuildContext context,
    WidgetRef ref,
    Exam exam,
  ) async {
    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      isScrollControlled: true,
      useRootNavigator: true, // Use root to ensure it covers if needed
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      builder: (context) => _ExamDetailSheet(
        exam: exam,
        questions: questions[exam.id] ?? [],
        answers: answers[exam.id] ?? [],
        resolved: resolvedScores[exam.id],
        formatDate: formatDate,
      ),
    );
    ref.read(uiModalOpenProvider.notifier).setOpen(false);
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark
              ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08)
              : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(24),
          border: isDark
              ? Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.05),
                )
              : null,
          boxShadow: isDark
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        child: Column(
          children: [
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: GoogleFonts.manrope(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScoreCard extends StatelessWidget {
  const _ScoreCard({
    required this.exam,
    required this.resolved,
    required this.onTap,
    required this.formatDate,
  });
  final Exam exam;
  final ResolvedScore? resolved;
  final VoidCallback onTap;
  final String Function(DateTime) formatDate;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isAssessment = exam.activityType == 'assessment';
    final scoreColor =
        resolved?.color ??
        Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(28),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isDark
              ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05)
              : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(28),
          border: isDark
              ? Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.05),
                )
              : null,
          boxShadow: isDark
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 15,
                    offset: const Offset(0, 8),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    exam.name,
                    style: GoogleFonts.manrope(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.onSurface,
                      height: 1.3,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color:
                        (isAssessment
                                ? (Theme.of(
                                        context,
                                      ).extension<GhostColors>()?.accentBlue ??
                                      Colors.blue)
                                : (Theme.of(context)
                                          .extension<GhostColors>()
                                          ?.accentOrange ??
                                      Colors.orange))
                            .withValues(alpha: isDark ? 0.15 : 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    exam.activityType.toUpperCase(),
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: isAssessment
                          ? (Theme.of(
                                  context,
                                ).extension<GhostColors>()?.accentBlue ??
                                Colors.blue)
                          : (Theme.of(
                                  context,
                                ).extension<GhostColors>()?.accentOrange ??
                                Colors.orange),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (resolved != null && resolved!.isMarked)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        resolved!.score.toStringAsFixed(
                          resolved!.score % 1 == 0 ? 0 : 1,
                        ),
                        style: GoogleFonts.manrope(
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                          color: scoreColor,
                        ),
                      ),
                      Text(
                        resolved!.isMaxUnresolvable
                            ? ' (max unknown)'
                            : ' / ${resolved!.maxMark.toStringAsFixed(0)}',
                        style: GoogleFonts.manrope(
                          fontSize: resolved!.isMaxUnresolvable ? 12 : 16,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  )
                else
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color:
                              (Theme.of(
                                        context,
                                      ).extension<GhostColors>()?.dangerRed ??
                                      Theme.of(context).colorScheme.error)
                                  .withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          LucideIcons.clock,
                          size: 16,
                          color:
                              Theme.of(
                                context,
                              ).extension<GhostColors>()?.dangerRed ??
                              Theme.of(context).colorScheme.error,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Pending Marks',
                        style: GoogleFonts.manrope(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                      ),
                    ],
                  ),
                if (exam.date != null)
                  Text(
                    formatDate(exam.date!),
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.7),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
              ],
            ),
            if (resolved != null &&
                resolved!.isMarked &&
                !resolved!.isMaxUnresolvable) ...[
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: resolved!.percentage / 100,
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.15),
                  color: scoreColor,
                  minHeight: 4,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ExamDetailSheet extends StatefulWidget {
  const _ExamDetailSheet({
    required this.exam,
    required this.questions,
    required this.answers,
    required this.resolved,
    required this.formatDate,
  });
  final Exam exam;
  final List<ExamQuestion> questions;
  final List<ExamAnswer> answers;
  final ResolvedScore? resolved;
  final String Function(DateTime) formatDate;

  @override
  State<_ExamDetailSheet> createState() => _ExamDetailSheetState();
}

class _ExamDetailSheetState extends State<_ExamDetailSheet> {
  final ScrollController _scrollController = ScrollController();
  bool _showScrollHint = true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      if (_scrollController.offset > 20 && _showScrollHint) {
        setState(() => _showScrollHint = false);
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.fromLTRB(
        32,
        32,
        32,
        120,
      ), // Increased bottom padding
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color:
                      (widget.exam.activityType == 'assessment'
                              ? (Theme.of(
                                      context,
                                    ).extension<GhostColors>()?.accentBlue ??
                                    Colors.blue)
                              : (Theme.of(
                                      context,
                                    ).extension<GhostColors>()?.accentOrange ??
                                    Colors.orange))
                          .withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  widget.exam.activityType.toUpperCase(),
                  style: GoogleFonts.manrope(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: widget.exam.activityType == 'assessment'
                        ? (Theme.of(
                                context,
                              ).extension<GhostColors>()?.accentBlue ??
                              Colors.blue)
                        : (Theme.of(
                                context,
                              ).extension<GhostColors>()?.accentOrange ??
                              Colors.orange),
                  ),
                ),
              ),
              IconButton(
                icon: Icon(
                  LucideIcons.x,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.6),
                  size: 20,
                ),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            widget.exam.name,
            style: GoogleFonts.manrope(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          Text(
            widget.exam.courseName,
            style: GoogleFonts.manrope(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 32),
          Text(
            'QUESTION BREAKDOWN',
            style: GoogleFonts.manrope(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.7),
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 16),
          Flexible(
            child: ShaderMask(
              shaderCallback: (bounds) {
                return const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.white, Colors.white, Colors.transparent],
                  stops: [0.0, 0.85, 1.0], // Fades out the last 15%
                ).createShader(bounds);
              },
              blendMode: BlendMode.dstIn,
              child: Scrollbar(
                controller: _scrollController,
                thumbVisibility: true,
                thickness: 4,
                radius: const Radius.circular(2),
                child: ListView.separated(
                  controller: _scrollController,
                  shrinkWrap: true,
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.only(
                    bottom: 60,
                    right: 24,
                  ), // Increased padding
                  itemCount: widget.questions.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final q = widget.questions[index];
                    final a = widget.answers.firstWhere(
                      (ans) => ans.examQuestionId == q.id,
                      orElse: () => ExamAnswer(id: 0, examQuestionId: 0),
                    );
                    return _QuestionRow(question: q, answer: a);
                  },
                ),
              ),
            ),
          ),
          if (_showScrollHint && widget.questions.length > 3)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                        LucideIcons.chevronDown,
                        size: 14,
                        color:
                            Theme.of(
                              context,
                            ).extension<GhostColors>()?.brandPrimary ??
                            Theme.of(context).colorScheme.primary,
                      )
                      .animate(onPlay: (controller) => controller.repeat())
                      .moveY(
                        begin: -2,
                        end: 2,
                        duration: 600.ms,
                        curve: Curves.easeInOut,
                      )
                      .fadeIn(),
                  const SizedBox(width: 6),
                  Text(
                    'SCROLL FOR MORE',
                    style: GoogleFonts.manrope(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      color:
                          Theme.of(
                            context,
                          ).extension<GhostColors>()?.brandPrimary ??
                          Theme.of(context).colorScheme.primary,
                      letterSpacing: 1,
                    ),
                  ).animate().fadeIn(),
                ],
              ),
            ),
          if (widget.resolved != null && widget.resolved!.isMarked) ...[
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isDark
                    ? Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.08)
                    : Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(20),
                boxShadow: isDark
                    ? null
                    : [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.03),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                border: isDark
                    ? Border.all(
                        color: Theme.of(
                          context,
                        ).colorScheme.outlineVariant.withValues(alpha: 0.05),
                      )
                    : null,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Total Score',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        widget.resolved!.score.toStringAsFixed(
                          widget.resolved!.score % 1 == 0 ? 0 : 1,
                        ),
                        style: GoogleFonts.manrope(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: widget.resolved!.color,
                        ),
                      ),
                      Text(
                        widget.resolved!.isMaxUnresolvable
                            ? ' (max unknown)'
                            : ' / ${widget.resolved!.maxMark.toStringAsFixed(0)}',
                        style: GoogleFonts.manrope(
                          fontSize: widget.resolved!.isMaxUnresolvable
                              ? 11
                              : 14,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuestionRow extends StatelessWidget {
  const _QuestionRow({required this.question, required this.answer});
  final ExamQuestion question;
  final ExamAnswer answer;

  @override
  Widget build(BuildContext context) {
    final scored = answer.score != null;
    final color = scored
        ? (answer.score! >= question.maximumMark
              ? Colors.green
              : (answer.score! == 0 ? Colors.red : Colors.orange))
        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1);

    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            'Q${question.questionNo}',
            style: GoogleFonts.manrope(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.8),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: scored ? (answer.score! / question.maximumMark) : 0,
              backgroundColor: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.15),
              color: color.withValues(alpha: 0.6),
              minHeight: 2,
            ),
          ),
        ),
        const SizedBox(width: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            scored
                ? answer.score!.toStringAsFixed(answer.score! % 1 == 0 ? 0 : 1)
                : '—',
            style: GoogleFonts.manrope(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          '/${question.maximumMark.toStringAsFixed(0)}',
          style: GoogleFonts.manrope(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.graduationCap,
            size: 48,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.2),
          ),
          const SizedBox(height: 16),
          Text(
            'No marks found',
            style: GoogleFonts.manrope(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}
