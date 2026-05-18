import 'package:flutter/material.dart';
import 'package:ghostclass/logic/attendance_utils.dart' as utils;
import 'package:ghostclass/models/attendance.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class TrackingRecordCard extends StatelessWidget {
  const TrackingRecordCard({
    required this.record,
    required this.onDelete,
    super.key,
    this.officialReport,
  });
  final TrackingRecord record;
  final AttendanceReportDetailed? officialReport;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCorrection = record.status == 'correction';
    final typeLabel = isCorrection ? 'Correction' : 'Extra';
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final typeColor = isCorrection
        ? (ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary)
        : (ghostColors?.accentBlue ?? Colors.blue);

    var statusText = _getUserLabel(record.attendance);
    if (isCorrection && officialReport != null) {
      final dateNorm = record.date.replaceAll('-', '');
      final sessionNorm = utils.toRoman(utils.normalizeSession(record.session));
      final session =
          officialReport!.studentAttendanceData[dateNorm]?[sessionNorm];

      var officialLabel = 'Absent';
      if (session != null) {
        final offStatus = AttendanceStatus.fromCode(session.attendance);
        if (offStatus == AttendanceStatus.present) {
          officialLabel = 'Present';
        } else if (offStatus == AttendanceStatus.absent) {
          officialLabel = 'Absent';
        } else if (offStatus == AttendanceStatus.dutyLeave) {
          officialLabel = 'Duty Leave';
        } else if (offStatus == AttendanceStatus.otherLeave) {
          officialLabel = 'Other Leave';
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
                      Theme.of(
                        context,
                      ).extension<GhostColors>()?.accentOrange ??
                      Colors.orange,
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

    var idx = 0;
    var found = false;
    for (final key in sessions.keys) {
      if (key == record.session) {
        found = true;
        break;
      }
      idx++;
    }

    if (found) {
      final sNum = int.tryParse(record.session);
      if (sNum != null && sNum > 20) {
        return (idx + 1).toString();
      }
    }

    return record.session;
  }

  String _getUserLabel(dynamic attendance) {
    final status = AttendanceStatus.fromCode(attendance);
    if (status == AttendanceStatus.dutyLeave) return 'Duty Leave';
    if (status == AttendanceStatus.absent) return 'Absent';
    if (status == AttendanceStatus.otherLeave) return 'Other Leave';
    return 'Present';
  }

  Color _getStatusColor(BuildContext context, dynamic attendance) {
    final status = AttendanceStatus.fromCode(attendance);
    final ghostColors = Theme.of(context).extension<GhostColors>();
    if (status == AttendanceStatus.dutyLeave) {
      return ghostColors?.accentOrange ?? Colors.orange;
    }
    if (status == AttendanceStatus.absent) {
      return ghostColors?.dangerRed ?? Colors.red;
    }
    if (status == AttendanceStatus.otherLeave) {
      return ghostColors?.accentBlue ?? Colors.blue;
    }
    return ghostColors?.successGreen ?? Colors.green;
  }

  String _formatDate(String dateStr) {
    final date = DateTime.tryParse(dateStr);
    if (date == null) return dateStr;
    return DateFormat('EEE, MMM d, y').format(date);
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});
  final String label;
  final Color color;

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
  const _DeleteButton({required this.onPressed});
  final VoidCallback onPressed;

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
