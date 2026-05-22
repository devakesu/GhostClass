import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class HeaderSection extends ConsumerStatefulWidget {
  const HeaderSection({required this.data, super.key});

  final DashboardData data;

  @override
  ConsumerState<HeaderSection> createState() => _HeaderSectionState();
}

class _HeaderSectionState extends ConsumerState<HeaderSection> {
  bool _academicPeriodChangeLocked = false;

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(authProvider).value?.profile;
    final isUpdating = ref.watch(academicProvider).isLoading || _academicPeriodChangeLocked;

    final currentPeriod = _AcademicPeriod(
      semester: widget.data.selectedSemester,
      year: widget.data.selectedYear,
    );
    final previousPeriod = _shiftAcademicPeriod(currentPeriod, _PeriodDirection.previous);
    final nextPeriod = _shiftAcademicPeriod(currentPeriod, _PeriodDirection.next);

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RichText(
              text: TextSpan(
                style: GoogleFonts.manrope(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                children: [
                  const TextSpan(text: 'Welcome back,\n'),
                  TextSpan(
                    text: '${profile?.firstName ?? 'Ghost'}!',
                    style: GoogleFonts.manrope(
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(100),
                border: Border.all(
                  color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                ),
              ),
              child: Text(
                (profile?.classField?.name ?? widget.data.className ?? 'Unassigned').toUpperCase(),
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'For students juggling classes, internals, labs, submissions, caffeine, and “I’ll study tomorrow” energy ☕📚',
              style: GoogleFonts.manrope(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                fontWeight: FontWeight.w500,
                fontStyle: FontStyle.italic,
              ),
            ),
            const SizedBox(height: 20),
            Semantics(
              label: 'Current academic period: ${_formatAcademicPeriod(currentPeriod)}. Use the arrows to change it.',
              button: true,
              child: _AcademicPeriodSwitcher(
                currentPeriod: currentPeriod,
                previousPeriod: previousPeriod,
                nextPeriod: nextPeriod,
                isBusy: isUpdating,
                onPrevious: () => _requestAcademicPeriodChange(
                  context,
                  currentPeriod: currentPeriod,
                  targetPeriod: previousPeriod,
                ),
                onNext: () => _requestAcademicPeriodChange(
                  context,
                  currentPeriod: currentPeriod,
                  targetPeriod: nextPeriod,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _requestAcademicPeriodChange(
    BuildContext context, {
    required _AcademicPeriod currentPeriod,
    required _AcademicPeriod? targetPeriod,
  }) async {
    if (_academicPeriodChangeLocked || targetPeriod == null) return;

    setState(() {
      _academicPeriodChangeLocked = true;
    });

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm academic period change'),
        content: Text(
          'Change from ${_formatAcademicPeriod(currentPeriod)} to ${_formatAcademicPeriod(targetPeriod)}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      if (mounted) {
        setState(() {
          _academicPeriodChangeLocked = false;
        });
      }
      return;
    }

    try {
      await ref.read(academicProvider.notifier).setAcademicPeriod(
            targetPeriod.semester,
            targetPeriod.year,
          );
    } finally {
      if (mounted) {
        setState(() {
          _academicPeriodChangeLocked = false;
        });
      }
    }
  }
}

enum _PeriodDirection { previous, next }

class _AcademicPeriod {
  const _AcademicPeriod({required this.semester, required this.year});

  final String semester;
  final String year;
}

class _AcademicPeriodSwitcher extends StatelessWidget {
  const _AcademicPeriodSwitcher({
    required this.currentPeriod,
    required this.previousPeriod,
    required this.nextPeriod,
    required this.isBusy,
    required this.onPrevious,
    required this.onNext,
  });

  final _AcademicPeriod currentPeriod;
  final _AcademicPeriod? previousPeriod;
  final _AcademicPeriod? nextPeriod;
  final bool isBusy;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          _PeriodArrowButton(
            icon: LucideIcons.chevronLeft,
            label: previousPeriod == null
                ? 'Previous academic period unavailable'
                : 'Go to ${_formatAcademicPeriod(previousPeriod!)}',
            onTap: isBusy || previousPeriod == null ? null : onPrevious,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Academic period',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _formatAcademicPeriod(currentPeriod),
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                      color: scheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ),
          _PeriodArrowButton(
            icon: LucideIcons.chevronRight,
            label: nextPeriod == null
                ? 'Next academic period unavailable'
                : 'Go to ${_formatAcademicPeriod(nextPeriod!)}',
            onTap: isBusy || nextPeriod == null ? null : onNext,
          ),
        ],
      ),
    );
  }
}

class _PeriodArrowButton extends StatelessWidget {
  const _PeriodArrowButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: onTap == null ? scheme.onSurface.withValues(alpha: 0.04) : scheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(
              icon,
              size: 20,
              color: onTap == null ? scheme.onSurface.withValues(alpha: 0.28) : scheme.primary,
            ),
          ),
        ),
      ),
    );
  }
}

final _academicYearPattern = RegExp(r'^(\d{2}|\d{4})-(\d{2}|\d{4})$');

_AcademicPeriod? _shiftAcademicPeriod(
  _AcademicPeriod current,
  _PeriodDirection direction,
) {
  final startYear = _parseAcademicYearStart(current.year);
  if (startYear == null) return null;

  if (direction == _PeriodDirection.previous) {
    return current.semester.toLowerCase() == 'odd'
        ? _AcademicPeriod(semester: 'even', year: _formatAcademicYear(startYear - 1))
        : _AcademicPeriod(semester: 'odd', year: _formatAcademicYear(startYear));
  }

  return current.semester.toLowerCase() == 'odd'
      ? _AcademicPeriod(semester: 'even', year: _formatAcademicYear(startYear))
      : _AcademicPeriod(semester: 'odd', year: _formatAcademicYear(startYear + 1));
}

int? _parseAcademicYearStart(String year) {
  final match = _academicYearPattern.firstMatch(year.trim());
  if (match == null) return null;

  final startRaw = match.group(1)!;
  final normalizedStart = startRaw.length == 2 ? '20$startRaw' : startRaw;
  return int.tryParse(normalizedStart);
}

String _formatAcademicYear(int startYear) {
  return '$startYear-${(startYear + 1).toString().substring(2)}';
}

String _formatAcademicPeriod(_AcademicPeriod period) {
  return '${period.semester.toUpperCase()} ${period.year}';
}
