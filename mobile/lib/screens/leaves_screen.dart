import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/leave.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class LeavesScreen extends ConsumerWidget {
  const LeavesScreen({super.key});

  String _formatDate(String dateString) {
    try {
      final date = DateTime.parse(dateString);
      return DateFormat('MMM d, yyyy').format(date);
    } on Object {
      return 'N/A';
    }
  }

  String _formatBytes(int bytes) {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1048576) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1048576).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leaveState = ref.watch(leaveProvider);

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
            onRefresh: () => ref.read(leaveProvider.notifier).refresh(),
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                    child: Text(
                      'Leave Applications',
                      style: GoogleFonts.manrope(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).colorScheme.onSurface,
                        letterSpacing: -1.2,
                      ),
                    ),
                  ),
                ),
                leaveState.when(
                  data: (data) => _buildSliverContent(context, data),
                  loading: () => const SliverFillRemaining(
                    child: LoadingOverlay(isFullScreen: false, showLogo: false),
                  ),
                  error: (err, stack) => SliverFillRemaining(
                    child: ServiceErrorView(
                      error: err,
                      onRetry: () => ref.read(leaveProvider.notifier).refresh(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverContent(BuildContext context, LeaveState data) {
    if (data.leaves.isEmpty) {
      return SliverFillRemaining(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.03,
                  ),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  LucideIcons.fileX,
                  size: 64,
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.1,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'No leave applications found',
                style: GoogleFonts.manrope(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.4,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Pull down to refresh or check back later',
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.25,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final approvedCount = data.leaves
        .where((l) => _getLeaveStatus(l.approvers).label == 'Approved')
        .length;

    return SliverPadding(
      padding: const EdgeInsets.all(24),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          Row(
            children: [
              _buildStatCard(
                context,
                'Total Applied',
                data.leaves.length.toString(),
                LucideIcons.fileText,
                Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 16),
              _buildStatCard(
                context,
                'Approved',
                approvedCount.toString(),
                LucideIcons.checkCircle2,
                const Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: 24),
          ...data.leaves.map(
            (leave) => _buildLeaveCard(
              context,
              leave,
              data.sessions[leave.id] ?? [],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildStatCard(
    BuildContext context,
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Expanded(
      child: Container(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: color.withValues(alpha: 0.3),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.05),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned(
              right: -8,
              bottom: -8,
              child: Opacity(
                opacity: 0.08,
                child: Icon(icon, size: 60, color: color),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 16, color: color),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    label,
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.6),
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 2),
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
          ],
        ),
      ),
    );
  }

  Widget _buildLeaveCard(
    BuildContext context,
    Leave leave,
    List<LeaveSession> sessions,
  ) {
    final status = _getLeaveStatus(leave.approvers);

    // Unique dates
    final uniqueDates = sessions.map((s) => s.date).toSet().toList()..sort();
    final dateRangeStr = uniqueDates.isEmpty
        ? 'N/A'
        : uniqueDates.length == 1
        ? _formatDate(uniqueDates.first)
        : '${_formatDate(uniqueDates.first)} - ${_formatDate(uniqueDates.last)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? (Theme.of(context).extension<GhostColors>()?.surfaceLighter ??
                  Theme.of(context).colorScheme.surface)
            : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(
            alpha: Theme.of(context).brightness == Brightness.dark ? 0.12 : 0.1,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: Theme.of(context).brightness == Brightness.dark
                  ? 0.2
                  : 0.04,
            ),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Content
          Padding(
            padding: const EdgeInsets.fromLTRB(30, 24, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: status.color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: status.color.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(status.icon, size: 14, color: status.color),
                          const SizedBox(width: 8),
                          Text(
                            status.label.toUpperCase(),
                            style: GoogleFonts.manrope(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: status.color,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      leave.attendanceType?.name.toUpperCase() ?? 'LEAVE',
                      style: GoogleFonts.manrope(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4),
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  leave.leaveReason ?? 'Leave Application',
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                    height: 1.3,
                  ),
                ),
                if (leave.event != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Event: ${leave.event!.name}',
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: _buildMetaInfo(
                        context,
                        'Applied On',
                        _formatDate(leave.createdAt),
                        LucideIcons.calendar,
                      ),
                    ),
                    Expanded(
                      child: _buildMetaInfo(
                        context,
                        'Leave Dates',
                        dateRangeStr,
                        LucideIcons.clock,
                      ),
                    ),
                  ],
                ),
                if (sessions.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Text(
                    'IMPACTED SESSIONS (${sessions.length})',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.5),
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Column(
                    children: sessions.map((s) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.outlineVariant,
                                  ),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'S: ${s.session?.name ?? "?"}',
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  s.course?.name ??
                                      s.course?.code ??
                                      'Unknown Course',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
                if (leave.files != null && leave.files!.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Text(
                    'ATTACHMENTS',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.5),
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: leave.files!.map((file) {
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.indigo.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.indigo.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              LucideIcons.fileText,
                              size: 14,
                              color: Colors.indigo,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                file.fileName,
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.indigo,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '(${_formatBytes(file.sizeByte)})',
                              style: GoogleFonts.manrope(
                                fontSize: 11,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.55),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ],
                if (leave.approvers.any((a) => a.actionByUser != null)) ...[
                  const SizedBox(height: 24),
                  Divider(
                    color: Theme.of(
                      context,
                    ).colorScheme.outlineVariant.withValues(alpha: 0.1),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'WORKFLOW HISTORY',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.5),
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...() {
                    final filteredApprovers = <LeaveApprover>[];
                    for (final a in leave.approvers) {
                      if (a.actionByUser == null) continue;
                      final isDuplicate = filteredApprovers.any(
                        (item) =>
                            item.actionByUser?.firstName ==
                                a.actionByUser?.firstName &&
                            item.actionByUser?.lastName ==
                                a.actionByUser?.lastName &&
                            item.actionType == a.actionType &&
                            item.actionAt == a.actionAt,
                      );
                      if (!isDuplicate) filteredApprovers.add(a);
                    }
                    filteredApprovers.sort(
                      (a, b) => b.updatedAt.compareTo(a.updatedAt),
                    );

                    return filteredApprovers.map((approver) {
                      final isApproved = approver.actionType == 'approve';
                      final isRejected = approver.actionType == 'reject';
                      final isForwarded = approver.actionType == 'forward';
                      final isRecommended = approver.actionType == 'recommend';
                      final color = isApproved
                          ? const Color(0xFF10B981)
                          : isRejected
                          ? Colors.red
                          : isForwarded
                          ? Colors.indigo
                          : isRecommended
                          ? Colors.blue
                          : Colors.grey;
                      final label = isApproved
                          ? 'Approved'
                          : isForwarded
                          ? 'Forwarded'
                          : isRecommended
                          ? 'Recommended'
                          : isRejected
                          ? 'Rejected'
                          : (approver.actionType ?? 'Action');

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.1),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                LucideIcons.user,
                                size: 12,
                                color: color,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${approver.actionByUser!.firstName} ${approver.actionByUser!.lastName}',
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurface,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                label.toUpperCase(),
                                style: GoogleFonts.manrope(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                  color: color,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _formatDate(
                                approver.actionAt ?? approver.updatedAt,
                              ),
                              style: GoogleFonts.manrope(
                                fontSize: 11,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.4),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList();
                  }(),
                ],
              ],
            ),
          ),
          // Accent bar
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            child: Container(
              color: status.color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetaInfo(
    BuildContext context,
    String label,
    String value,
    IconData icon,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w900,
            color: Theme.of(context).colorScheme.onSurface.withValues(
              alpha: 0.55,
            ),
            letterSpacing: 0.7,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Icon(
              icon,
              size: 14,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                value,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.8),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ],
    );
  }

  _LeaveStatus _getLeaveStatus(List<LeaveApprover> approvers) {
    if (approvers.isEmpty) {
      return _LeaveStatus('Pending', Colors.amber, LucideIcons.clock);
    }

    final actedApprovers =
        approvers
            .where((a) => a.actionType != null || a.actionAt != null)
            .toList()
          ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

    if (actedApprovers.isEmpty) {
      return _LeaveStatus('Pending', Colors.amber, LucideIcons.clock);
    }

    final lastAction = actedApprovers.first.actionType;

    if (lastAction == 'reject') {
      return _LeaveStatus('Rejected', Colors.red, LucideIcons.xCircle);
    }
    if (lastAction == 'approve') {
      return _LeaveStatus(
        'Approved',
        const Color(0xFF10B981),
        LucideIcons.checkCircle2,
      );
    }
    if (lastAction == 'forward') {
      return _LeaveStatus('Forwarded', Colors.indigo, LucideIcons.arrowRight);
    }
    if (lastAction == 'recommend') {
      return _LeaveStatus('Recommended', Colors.blue, LucideIcons.arrowRight);
    }

    return _LeaveStatus('In Progress', Colors.lightBlue, LucideIcons.clock);
  }
}

class _LeaveStatus {
  _LeaveStatus(this.label, this.color, this.icon);
  final String label;
  final Color color;
  final IconData icon;
}
