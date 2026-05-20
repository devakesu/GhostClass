import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/user.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class ProfileDumpScreen extends ConsumerWidget {
  const ProfileDumpScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authAsync = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);
    final academic = academicAsync.value;

    return authAsync.when(
      data: (user) => user != null
          ? _ProfileDumpContent(user: user, academic: academic)
          : const _LoadingWidget(),
      loading: () => const _LoadingWidget(),
      error: (_, _) => const _LoadingWidget(),
    );
  }
}

class _LoadingWidget extends StatelessWidget {
  const _LoadingWidget();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: const Center(child: CircularProgressIndicator()),
    );
  }
}

class _ProfileDumpContent extends ConsumerWidget {
  const _ProfileDumpContent({required this.user, this.academic});
  final AuthenticatedUser user;
  final AcademicState? academic;

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }

  /// Normalises a date string to DD-MM-YYYY display order.
  ///
  /// Handles two formats from the API:
  ///   - ISO 8601 `YYYY-MM-DD` (or `YYYY-MM-DDTHH:mm:ssZ`) → converts to `DD-MM-YYYY`.
  ///   - `DD-MM-YYYY` → returned unchanged (the "no-op" branch is intentional,
  ///     not a bug — the data is already in the desired display format).
  ///
  /// Dates that match neither known format are returned verbatim.
  String _formatDate(String s) {
    try {
      final datePart = s.split('T')[0];
      if (datePart.contains('-')) {
        final parts = datePart.split('-');
        if (parts.length == 3) {
          if (parts[0].length == 4) {
            // YYYY-MM-DD → DD-MM-YYYY
            return '${parts[2]}-${parts[1]}-${parts[0]}';
          }
          if (parts[2].length == 4) {
            // DD-MM-YYYY → already in display order; return as-is.
            return '${parts[0]}-${parts[1]}-${parts[2]}';
          }
        }
      }
      return s;
    } on Object catch (e) {
      AppLogger.e('ProfileDumpScreen: Failed to format date', e);
      return s;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;

    final institutionsAsync = ref.watch(institutionsProvider);
    final institutionName = institutionsAsync.when(
      data: (insts) {
        if (user.ezygoId == null) {
          return insts.isNotEmpty ? insts.first.name : '—';
        }
        try {
          final searchId = user.ezygoId!.trim();
          return insts
              .firstWhere((i) => i.id.toString().trim() == searchId)
              .name;
        } on Object catch (e) {
          AppLogger.e(
            'ProfileDumpScreen: Failed to resolve institution by id',
            e,
          );
          // Fallback to first available for UI consistency, similar to GhostClassScreen
          return insts.isNotEmpty ? insts.first.name : 'Unknown';
        }
      },
      loading: () => '...',
      error: (err, stack) => 'Error',
    );

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        leading: IconButton(
          icon: Icon(
            LucideIcons.chevronLeft,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Profile Dump',
          style: GoogleFonts.manrope(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
      ),
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Raw Data',
                    style: GoogleFonts.manrope(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.onSurface,
                      letterSpacing: -0.8,
                    ),
                  ),
                  Text(
                    'Detailed account and session metadata',
                    style: GoogleFonts.manrope(
                      fontSize: 14,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ).animate().fade(duration: 400.ms).slideY(begin: 0.05),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 24)),

          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _InfoCard(
                  icon: LucideIcons.user,
                  title: 'User Profile',
                  iconColor: const Color(0xFFFACC15),
                  delay: 100,
                  rows: [
                    if (user.profile?.fullName != null)
                      _InfoRow(
                        label: 'Full Name',
                        value: user.profile!.fullName!,
                      ),
                    if (user.username != null)
                      _InfoRow(
                        label: 'Username',
                        value: user.username!,
                        copyable: true,
                      ),
                    if (user.profile?.email != null)
                      _InfoRow(
                        label: 'Email',
                        value: user.profile!.email!,
                        copyable: true,
                      ),
                    if (user.profile?.phone != null)
                      _InfoRow(
                        label: 'Phone',
                        value: user.profile!.phone!,
                        copyable: true,
                      ),
                    if (user.profile?.birthDate != null)
                      _InfoRow(
                        label: 'Birthday',
                        value: _formatDate(user.profile!.birthDate!),
                      ),
                    if (user.profile?.gender != null)
                      _InfoRow(
                        label: 'Gender',
                        value: _capitalize(user.profile!.gender!),
                      ),
                    if (user.profile?.avatarUrl != null)
                      _InfoRow(
                        label: 'Avatar URL',
                        value: user.profile!.avatarUrl!,
                        copyable: true,
                      ),
                  ],
                ),

                const SizedBox(height: 16),

                _InfoCard(
                  icon: LucideIcons.shieldCheck,
                  title: 'Security & Session',
                  iconColor: const Color(0xFF10B981),
                  delay: 150,
                  rows: [
                    _InfoRow(
                      label: 'Supabase UUID',
                      value: user.supabaseUserId,
                      copyable: true,
                    ),
                    _InfoRow(
                      label: 'EzyGo ID',
                      value: user.ezygoId ?? '—',
                      copyable: true,
                    ),
                    _InfoRow(
                      label: 'EzyGo Token',
                      value: user.maskedToken,
                      copyable: true,
                    ),
                    if (user.profile?.ezygoCreatedAt != null)
                      _InfoRow(
                        label: 'EzyGo Created',
                        value: _formatDate(user.profile!.ezygoCreatedAt!),
                      ),
                    if (user.profile?.createdAt != null)
                      _InfoRow(
                        label: 'Ghost Created',
                        value: _formatDate(user.profile!.createdAt!),
                      ),
                  ],
                ),

                const SizedBox(height: 16),

                _InfoCard(
                  icon: LucideIcons.graduationCap,
                  title: 'Academic Status',
                  iconColor: const Color(0xFFF472B6),
                  delay: 200,
                  rows: [
                    _InfoRow(
                      label: 'Institution',
                      value: institutionName,
                      valueColor: const Color(0xFFF59E0B),
                    ),
                    if (academic != null) ...[
                      _InfoRow(
                        label: 'Academic Year',
                        value: academic!.year,
                        valueColor: const Color(0xFFF472B6),
                      ),
                      _InfoRow(
                        label: 'Semester',
                        value: academic!.semester.toUpperCase(),
                        valueColor: const Color(0xFF34D399),
                      ),
                    ] else if (user.profile?.currentYear != null) ...[
                      _InfoRow(
                        label: 'Academic Year',
                        value: user.profile!.currentYear!,
                        valueColor: const Color(0xFFF472B6),
                      ),
                      _InfoRow(
                        label: 'Semester',
                        value: (user.profile?.currentSemester ?? '')
                            .toUpperCase(),
                        valueColor: const Color(0xFF34D399),
                      ),
                    ],
                    if (user.profile?.classField != null) ...[
                      _InfoRow(
                        label: 'Class ID',
                        value: user.profile!.classField!.id,
                        copyable: true,
                      ),
                      _InfoRow(
                        label: 'Class Name',
                        value: user.profile!.classField!.name,
                      ),
                    ],
                    if (user.profile?.lastSyncedAt != null)
                      _InfoRow(
                        label: 'Last Synced',
                        value: _formatDate(user.profile!.lastSyncedAt!),
                      ),
                  ],
                ),

                const SizedBox(height: 16),

                institutionsAsync.when(
                  data: (insts) => _InfoCard(
                    icon: LucideIcons.building,
                    title: 'Available Institutions',
                    iconColor: const Color(0xFFF59E0B),
                    delay: 250,
                    rows: insts.isEmpty
                        ? [
                            const _InfoRow(
                              label: 'Status',
                              value: 'No institutions found',
                            ),
                          ]
                        : insts
                              .map(
                                (i) => _InfoRow(
                                  label: i.name,
                                  value: 'ID: ${i.id}',
                                  copyable: true,
                                ),
                              )
                              .toList(),
                  ),
                  loading: () => const _InfoCard(
                    icon: LucideIcons.building,
                    title: 'Available Institutions',
                    iconColor: Color(0xFFF59E0B),
                    rows: [_InfoRow(label: 'Status', value: 'Loading...')],
                  ),
                  error: (e, _) => const _InfoCard(
                    icon: LucideIcons.building,
                    title: 'Available Institutions',
                    iconColor: Color(0xFFF59E0B),
                    rows: [_InfoRow(label: 'Error', value: 'Failed to fetch')],
                  ),
                ),

                const SizedBox(height: 16),

                _InfoCard(
                  icon: LucideIcons.fileText,
                  title: 'Terms & Compliance',
                  iconColor: const Color(0xFF60A5FA),
                  delay: 275,
                  rows: [
                    _InfoRow(
                      label: 'Terms Version',
                      value: user.termsVersion ?? 'Not accepted',
                      valueColor: user.termsVersion != null
                          ? Colors.green
                          : Colors.redAccent,
                      copyable: true,
                    ),
                    // Privacy Policy entry removed per request
                  ],
                ),

                const SizedBox(height: 16),

                _InfoCard(
                  icon: LucideIcons.settings,
                  title: 'App Settings',
                  iconColor: const Color(0xFF06B6D4),
                  delay: 250,
                  rows: [
                    _InfoRow(
                      label: 'Bunk Calculator',
                      value: user.settings.bunkCalculatorEnabled
                          ? 'Enabled'
                          : 'Disabled',
                      valueColor: user.settings.bunkCalculatorEnabled
                          ? Colors.green
                          : Colors.redAccent,
                    ),
                    _InfoRow(
                      label: 'Target Attendance',
                      value: '${user.settings.targetPercentage}%',
                      valueColor: primary,
                    ),
                    _InfoRow(
                      label: 'Disabled Courses',
                      value: user.settings.disabledCount == 0
                          ? 'None'
                          : '${user.settings.disabledCount} courses',
                      valueColor: user.settings.disabledCount == 0
                          ? Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.3)
                          : Colors.orangeAccent,
                      onTap: user.settings.disabledCount > 0
                          ? () => _showDisabledCoursesBottomSheet(
                              context,
                              user.settings,
                            )
                          : null,
                      trailingIcon: user.settings.disabledCount > 0
                          ? LucideIcons.chevronRight
                          : null,
                    ),
                  ],
                ),

                const SizedBox(height: 48),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _showDisabledCoursesBottomSheet(
    BuildContext context,
    UserSettings settings,
  ) {
    final _ = showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
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
            Row(
              children: [
                const Icon(
                  LucideIcons.ban,
                  color: Colors.orangeAccent,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Text(
                  'Disabled Courses',
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: settings.disabledCourses.entries.length,
                separatorBuilder: (context, index) => Divider(
                  height: 32,
                  thickness: 1,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                itemBuilder: (context, index) {
                  final semesterEntry = settings.disabledCourses.entries
                      .elementAt(index);
                  final semesterKey = semesterEntry.key;
                  final courses = semesterEntry.value.entries.toList()
                    ..sort(
                      (a, b) =>
                          a.key.toUpperCase().compareTo(b.key.toUpperCase()),
                    );

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.orangeAccent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: Colors.orangeAccent.withValues(alpha: 0.18),
                          ),
                        ),
                        child: Text(
                          semesterKey.toUpperCase(),
                          style: GoogleFonts.manrope(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: Colors.orangeAccent,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      ...courses.map((courseEntry) {
                        final courseCodeRaw = courseEntry.key.trim();
                        final courseCode = courseCodeRaw.toUpperCase();

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 18),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  courseCode,
                                  style: GoogleFonts.manrope(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface
                                        .withValues(alpha: 0.7),
                                    letterSpacing: 0.2,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  courseEntry.value.isEmpty
                                      ? 'No reason provided'
                                      : courseEntry.value,
                                  style: GoogleFonts.manrope(
                                    fontSize: 13,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface
                                        .withValues(alpha: 0.6),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.iconColor,
    required this.rows,
    this.delay = 0,
  });
  final IconData icon;
  final String title;
  final Color iconColor;
  final List<_InfoRow> rows;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final surface = Theme.of(context).cardColor;
    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.onSurface.withValues(alpha: 0.07),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: iconColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 16, color: iconColor),
                ),
                const SizedBox(width: 10),
                Text(
                  title,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurface,
                    letterSpacing: -0.2,
                  ),
                ),
              ],
            ),
          ),
          Divider(
            height: 24,
            thickness: 1,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.05),
          ),
          ...rows.map((row) => row._buildRow(context)),
          const SizedBox(height: 4),
        ],
      ),
    ).animate(delay: Duration(milliseconds: delay)).fade().slideY(begin: 0.06);
  }
}

class _InfoRow {
  const _InfoRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.copyable = false,
    this.onTap,
    this.trailingIcon,
  });
  final String label;
  final String value;
  final Color? valueColor;
  final bool copyable;
  final VoidCallback? onTap;
  final IconData? trailingIcon;

  Widget _buildRow(BuildContext context) {
    final effectiveOnTap =
        onTap ??
        (copyable
            ? () {
                final _ = Clipboard.setData(ClipboardData(text: value));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      '$label copied',
                      style: const TextStyle(fontSize: 13),
                    ),
                    duration: const Duration(seconds: 1),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                );
              }
            : null);

    return InkWell(
      onTap: effectiveOnTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ),
            Expanded(
              flex: 3,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      value,
                      textAlign: TextAlign.end,
                      overflow: TextOverflow.visible,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color:
                            valueColor ??
                            Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  ),
                  if (copyable || trailingIcon != null) ...[
                    const SizedBox(width: 8),
                    Icon(
                      trailingIcon ?? LucideIcons.copy,
                      size: 14,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.3),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
