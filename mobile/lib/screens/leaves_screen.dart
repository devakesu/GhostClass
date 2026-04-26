import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/leave.dart';
import 'package:ghostclass/providers/leave_provider.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';

class LeavesScreen extends ConsumerWidget {
  const LeavesScreen({super.key});

  String _formatDate(String dateString) {
    try {
      final date = DateTime.parse(dateString);
      return DateFormat('MMM d, yyyy').format(date);
    } catch (e) {
      return 'N/A';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leaveState = ref.watch(leaveProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Leave Applications',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
      ),
      body: leaveState.when(
        data: (data) => ServiceRefreshIndicator(
          onRefresh: () => ref.read(leaveProvider.notifier).refresh(),
          child: _buildContent(context, data),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
      ),
    );
  }

  Widget _buildContent(BuildContext context, LeaveState data) {
    if (data.leaves.isEmpty) {
      return ListView(
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.2),
          Center(
            child: Column(
              children: [
                Icon(LucideIcons.fileText, size: 64, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2)),
                const SizedBox(height: 16),
                const Text('No leave applications found.'),
              ],
            ),
          ),
        ],
      );
    }

    final approvedCount = data.leaves
        .where((l) => _getLeaveStatus(l.approvers).label == 'Approved')
        .length;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            _buildStatCard(context, 'Total Applied', data.leaves.length.toString()),
            const SizedBox(width: 16),
            _buildStatCard(context, 'Approved', approvedCount.toString(),
                color: const Color(0xFF10B981)),
          ],
        ),
        const SizedBox(height: 24),
        ...data.leaves.map((leave) => _buildLeaveCard(context, leave, data.sessions[leave.id] ?? [])),
      ],
    );
  }

  Widget _buildStatCard(BuildContext context, String label, String value, {Color? color}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: GoogleFonts.manrope(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: color ?? Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLeaveCard(BuildContext context, Leave leave, List<LeaveSession> sessions) {
    final status = _getLeaveStatus(leave.approvers);
    
    // Unique dates
    final uniqueDates = sessions.map((s) => s.date).toSet().toList()..sort();
    final dateRangeStr = uniqueDates.isEmpty
        ? 'N/A'
        : uniqueDates.length == 1
            ? _formatDate(uniqueDates.first)
            : '${_formatDate(uniqueDates.first)} - ${_formatDate(uniqueDates.last)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: status.color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(status.icon, size: 14, color: status.color),
                          const SizedBox(width: 6),
                          Text(
                            status.label,
                            style: GoogleFonts.manrope(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: status.color,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      'Type: ${leave.attendanceType?.name ?? "Leave"}',
                      style: GoogleFonts.manrope(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  leave.leaveReason ?? 'Leave Application',
                  style: GoogleFonts.manrope(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                if (leave.event != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Event: ${leave.event!.name}',
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: _buildMetaInfo(context, 'Applied On', _formatDate(leave.createdAt), LucideIcons.calendar),
                    ),
                    Expanded(
                      child: _buildMetaInfo(context, 'Leave Dates', dateRangeStr, LucideIcons.clock),
                    ),
                  ],
                ),
                if (sessions.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Text(
                    'Impacted Sessions (${sessions.length})',
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 150),
                    child: ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: sessions.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final s = sessions[index];
                        return Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.03),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'S: ${s.session?.name ?? "?"}',
                                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  s.course?.name ?? s.course?.code ?? "Unknown Course",
                                  style: const TextStyle(fontSize: 12),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetaInfo(BuildContext context, String label, String value, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Icon(icon, size: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                value,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8),
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

    final actedApprovers = approvers
        .where((a) => a.actionType != null)
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
      return _LeaveStatus('Approved', const Color(0xFF10B981), LucideIcons.checkCircle2);
    }
    if (lastAction == 'forward' || lastAction == 'recommend') {
      return _LeaveStatus('Forwarded', Colors.indigo, LucideIcons.arrowRight);
    }

    return _LeaveStatus('In Progress', Colors.blue, LucideIcons.clock);
  }
}

class _LeaveStatus {
  final String label;
  final Color color;
  final IconData icon;

  _LeaveStatus(this.label, this.color, this.icon);
}
