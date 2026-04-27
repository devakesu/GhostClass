import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/dashboard_provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class HeaderSection extends ConsumerWidget {
  final DashboardData data;

  const HeaderSection({super.key, required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(authProvider).value?.profile;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. Welcome Message
            Column(
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
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // 2. Class Badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .primary
                        .withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(100),
                    border: Border.all(
                      color: Theme.of(context)
                          .colorScheme
                          .primary
                          .withValues(alpha: 0.15),
                    ),
                  ),
                  child: Text(
                    (profile?.classField?.name ??
                            data.className ??
                            'Unassigned')
                        .toUpperCase(),
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.0,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Track your classes, manage attendance, and stay ahead!',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.5),
                    fontWeight: FontWeight.w500,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // 3. Selectors
            Row(
              children: [
                Expanded(
                  child: _SelectorButton(
                    label: data.selectedSemester.toUpperCase(),
                    icon: LucideIcons.calendar,
                    onTap: () =>
                        _showSemesterPicker(context, ref, data.selectedSemester),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SelectorButton(
                    label: data.selectedYear,
                    icon: LucideIcons.calendarDays,
                    onTap: () =>
                        _showYearPicker(context, ref, data.selectedYear),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showSemesterPicker(BuildContext context, WidgetRef ref, String current) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _PickerSheet(
        title: 'Select Semester',
        options: const ['odd', 'even'],
        selected: current.toLowerCase(),
        onSelected: (val) => _handleAcademicChange(
          context,
          ref,
          type: 'semester',
          value: val,
          current: current,
        ),
      ),
    );
  }

  void _showYearPicker(BuildContext context, WidgetRef ref, String current) {
    final currentYear = DateTime.now().year;
    final years = List.generate(
      (currentYear - 2021) + 2,
      (i) => '${2022 + i}-${(2023 + i).toString().substring(2)}',
    );

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _PickerSheet(
        title: 'Select Academic Year',
        options: years,
        selected: current,
        onSelected: (val) => _handleAcademicChange(
          context,
          ref,
          type: 'academicYear',
          value: val,
          current: current,
        ),
      ),
    );
  }

  void _handleAcademicChange(
    BuildContext context,
    WidgetRef ref, {
    required String type,
    required String value,
    required String current,
  }) async {
    Navigator.pop(context);
    if (value == current) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Confirm Change'),
        content: Text(
          'You are about to change the ${type == 'semester' ? 'semester' : 'academic year'}. Are you sure you want to continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      if (type == 'semester') {
        await ref.read(academicProvider.notifier).setSemester(value);
      } else {
        await ref.read(academicProvider.notifier).setYear(value);
      }
      // Force refresh dashboard
      ref.invalidate(dashboardProvider);
    }
  }
}

class _SelectorButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _SelectorButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: Theme.of(context).colorScheme.onSurface,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(width: 4),
            Icon(
              LucideIcons.chevronDown,
              size: 14,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickerSheet extends StatelessWidget {
  final String title;
  final List<String> options;
  final String selected;
  final Function(String) onSelected;

  const _PickerSheet({
    required this.title,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.manrope(
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 20),
          ...options.map((opt) => ListTile(
                onTap: () => onSelected(opt),
                contentPadding: const EdgeInsets.symmetric(horizontal: 0),
                title: Text(
                  opt.toUpperCase(),
                  style: GoogleFonts.manrope(
                    fontSize: 16,
                    fontWeight: opt == selected ? FontWeight.w800 : FontWeight.w500,
                    color: opt == selected
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                trailing: opt == selected
                    ? Icon(LucideIcons.check, color: Theme.of(context).colorScheme.primary)
                    : null,
              )),
        ],
      ),
    );
  }
}


