import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/providers/ui_state_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/ghostclass/ghostclass_branding.dart';
import 'package:ghostclass/widgets/ghostclass/ghostclass_footer.dart';
import 'package:ghostclass/widgets/ghostclass/ghostclass_menu_tile.dart';
import 'package:ghostclass/widgets/ghostclass/ghostclass_settings_card.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// GhostClassScreen
/// ----------------
/// The main settings and account management screen for GhostClass.
/// Allows users to configure target attendance, toggle the bunk calculator,
/// switch themes, and manage their institution profile.
class GhostClassScreen extends ConsumerWidget {
  const GhostClassScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final authState = ref.watch(authProvider);
    final themeMode = ref.watch(themeProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: authState.when(
        data: (user) {
          if (user == null) {
            return const LoadingOverlay(isFullScreen: false, showLogo: false);
          }

          return CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              // Branding Section
              const SliverToBoxAdapter(child: GhostClassBranding()),

              // Settings Section
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    GhostClassSectionTitle(
                      title: 'APP SETTINGS',
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.3),
                    ),
                    const SizedBox(height: 16),
                  ]),
                ),
              ),

              // 1x3 Grid for App Settings (Target, Bunk Calc, Dark Mode)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 16,
                    childAspectRatio: 0.95,
                  ),
                  delegate: SliverChildListDelegate([
                    // Target Percentage
                    GhostClassSettingsCard(
                      icon: LucideIcons.target,
                      label: 'Target',
                      value: '${user.settings.targetPercentage}%',
                      color: primary,
                      isDisabled: user.isUpdatingSettings,
                      onTap: () {
                        final _ = _showTargetPicker(context, ref, user);
                      },
                    ),
                    // Bunk Calculator Switch
                    GhostClassSettingsCard(
                      icon: LucideIcons.calculator,
                      label: 'Bunk',
                      value: user.settings.bunkCalculatorEnabled ? 'ON' : 'OFF',
                      color: ghostColors?.accentBlue ?? const Color(0xFF6366F1),
                      isActive: user.settings.bunkCalculatorEnabled,
                      showToggle: true,
                      toggleValue: user.settings.bunkCalculatorEnabled,
                      isDisabled: user.isUpdatingSettings,
                      onToggle: (val) {
                        final _ = ref
                            .read(authProvider.notifier)
                            .updateSettings(bunkEnabled: val);
                      },
                      onTap: () {
                        final _ = ref
                            .read(authProvider.notifier)
                            .updateSettings(
                              bunkEnabled: !user.settings.bunkCalculatorEnabled,
                            );
                      },
                    ),
                    // Theme Switcher
                    GhostClassSettingsCard(
                      icon: themeMode == ThemeMode.dark
                          ? LucideIcons.moon
                          : LucideIcons.sun,
                      label: 'Theme',
                      value: themeMode == ThemeMode.dark ? 'DARK' : 'LIGHT',
                      color:
                          ghostColors?.successGreen ?? const Color(0xFF10B981),
                      isActive: themeMode == ThemeMode.dark,
                      showToggle: true,
                      toggleValue: themeMode == ThemeMode.dark,
                      isDisabled: user.isUpdatingSettings,
                      onToggle: (_) =>
                          ref.read(themeProvider.notifier).toggleTheme(),
                      onTap: () =>
                          ref.read(themeProvider.notifier).toggleTheme(),
                    ),
                  ]),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 12)),

              // Full Width Institution Card
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                sliver: SliverToBoxAdapter(
                  child: GhostClassSettingsCard(
                    icon: LucideIcons.building,
                    label: 'Institution',
                    isFullWidth: true,
                    isDisabled: user.isUpdatingSettings,
                    value: ref
                        .watch(institutionsProvider)
                        .when(
                          data: (insts) {
                            if (insts.isEmpty) return 'SWITCH';

                            // Try to match based on the user's ezygoId, or default to the first one.
                            final match = insts.cast<Institution?>().firstWhere(
                              (i) => i?.id.toString() == user.ezygoId,
                              orElse: () => null,
                            );

                            return match?.name ?? insts.first.name;
                          },
                          loading: () => '...',
                          error: (e, _) => 'SWITCH',
                        ),
                    color: ghostColors?.accentOrange ?? const Color(0xFFF59E0B),
                    onTap: () => _showInstitutionPicker(context, ref, user),
                  ),
                ),
              ),

              // Bottom Menu Tiles (Profile, Help, etc.)
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 24,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    const SizedBox(height: 8),
                    GhostClassMenuTile(
                      icon: LucideIcons.userCircle,
                      title: 'Profile',
                      subtitle: 'Personal details',
                      onTap: () {
                        final _ = context.push('/profile');
                      },
                      color:
                          ghostColors?.accentOrange ?? const Color(0xFFFACC15),
                    ),
                    GhostClassMenuTile(
                      icon: LucideIcons.helpCircle,
                      title: 'Help Center',
                      subtitle: 'FAQs and support',
                      onTap: () {
                        final _ = context.push('/help');
                      },
                      color: ghostColors?.accentBlue ?? const Color(0xFF6366F1),
                    ),
                    GhostClassMenuTile(
                      icon: LucideIcons.mail,
                      title: 'Contact Us',
                      subtitle: 'Get in touch with our team',
                      onTap: () {
                        final _ = context.push('/contact');
                      },
                      color:
                          ghostColors?.accentOrange ?? const Color(0xFFF59E0B),
                    ),
                    GhostClassMenuTile(
                      icon: LucideIcons.shieldCheck,
                      title: 'Legal',
                      subtitle: 'Terms, Privacy & Licenses',
                      onTap: () {
                        final _ = context.push('/legal');
                      },
                      color:
                          ghostColors?.successGreen ?? const Color(0xFF10B981),
                    ),
                    GhostClassMenuTile(
                      icon: LucideIcons.database,
                      title: 'Account Dump',
                      subtitle: 'Detailed account information',
                      onTap: () {
                        final _ = context.push('/profile-dump');
                      },
                      color: primary,
                    ),
                    const SizedBox(height: 40),
                    GhostClassSectionTitle(
                      title: 'Danger Zone',
                      color: primary.withValues(alpha: 0.8),
                    ),
                    const SizedBox(height: 12),
                    GhostClassMenuTile(
                      icon: LucideIcons.logOut,
                      title: 'Logout',
                      subtitle: 'Sign out of GhostClass',
                      color: primary,
                      isDanger: true,
                      onTap: () {
                        final _ = _handleLogout(context, ref);
                      },
                    ),
                    GhostClassMenuTile(
                      icon: LucideIcons.trash2,
                      title: 'Delete Account',
                      subtitle: 'Permanently remove all data',
                      color: primary,
                      isDanger: true,
                      onTap: () {
                        final _ = _handleDeleteAccount(context, ref);
                      },
                    ),
                    const SizedBox(height: 8),
                  ]),
                ),
              ),

              const SliverToBoxAdapter(child: GhostClassVersionFooter()),
              const SliverPadding(padding: EdgeInsets.only(bottom: 12)),
            ],
          );
        },
        loading: () =>
            const LoadingOverlay(isFullScreen: false, showLogo: false),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              'We encountered an error while loading your settings. Please try again later. If the issue persists, please contact us.',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Logout',
          style: GoogleFonts.manrope(
            color: Theme.of(context).colorScheme.onSurface,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Are you sure you want to log out?',
          style: GoogleFonts.manrope(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.85),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancel',
              style: GoogleFonts.manrope(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Logout',
              style: GoogleFonts.manrope(
                color: Colors.redAccent,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authProvider.notifier).logout();
    }
  }

  Future<void> _handleDeleteAccount(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          title: Row(
            children: [
              const Icon(
                LucideIcons.alertTriangle,
                color: Colors.redAccent,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Are you absolutely sure?',
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RichText(
                  text: TextSpan(
                    style: GoogleFonts.manrope(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.85),
                      fontSize: 13,
                      height: 1.5,
                      fontWeight: FontWeight.w500,
                    ),
                    children: [
                      const TextSpan(text: 'This will permanently erase your '),
                      TextSpan(
                        text: 'GhostClass',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const TextSpan(
                        text:
                            ' account, including all attendance logs and personal settings.\n\n',
                      ),
                      TextSpan(
                        text:
                            'Note: Your official EzyGo account remains unaffected.',
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                RichText(
                  text: TextSpan(
                    style: GoogleFonts.manrope(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.6),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    children: [
                      const TextSpan(text: 'Type '),
                      TextSpan(
                        text: 'DELETE',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const TextSpan(text: ' to confirm'),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: controller,
                  autofocus: true,
                  onChanged: (val) => setState(() {}),
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: 'DELETE',
                    hintStyle: GoogleFonts.manrope(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.1),
                    ),
                    filled: true,
                    fillColor: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.05),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.1),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Colors.redAccent),
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(
                'Cancel',
                style: GoogleFonts.manrope(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ElevatedButton(
                onPressed: controller.text.trim() == 'DELETE'
                    ? () => Navigator.pop(context, true)
                    : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.redAccent.withValues(
                    alpha: 0.1,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: Text(
                  'Permanently Delete',
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w900),
                ),
              ),
            ),
          ],
        ),
      ),
    );

    if (confirmed == true) {
      if (!context.mounted) return;
      LoadingOverlay.show(context, message: 'Purging your mortal data... 💀');
      try {
        await ref.read(authProvider.notifier).deleteAccount();
      } on Object catch (e, st) {
        AppLogger.e('GhostClassScreen: Account deletion failed', e, st);
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Failed to delete account. Please try again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Future<void> _showTargetPicker(
    BuildContext context,
    WidgetRef ref,
    AuthenticatedUser user,
  ) async {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      isScrollControlled: true,
      useRootNavigator: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      builder: (context) {
        var localTarget = user.settings.targetPercentage;
        return StatefulBuilder(
          builder: (context, setModalState) => Container(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Target Percentage',
                      style: GoogleFonts.manrope(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    Text(
                      '$localTarget%',
                      style: GoogleFonts.manrope(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 40),
                // Custom labels above slider
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [75, 80, 85, 90, 95].map((val) {
                      final isSelected = localTarget == val;
                      return Text(
                        '$val%',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: isSelected
                              ? FontWeight.w900
                              : FontWeight.w700,
                          color: isSelected
                              ? primary
                              : Theme.of(
                                  context,
                                ).colorScheme.onSurface.withValues(alpha: 0.6),
                          letterSpacing: 1,
                        ),
                      );
                    }).toList(),
                  ),
                ),
                SliderTheme(
                  data: SliderThemeData(
                    showValueIndicator: ShowValueIndicator.onDrag,
                    tickMarkShape: const _CustomSliderTickMarkShape(
                      tickMarkRadius: 2.5,
                    ),
                    activeTickMarkColor: Colors.white.withValues(alpha: 0.4),
                    inactiveTickMarkColor: primary.withValues(alpha: 0.4),
                    activeTrackColor: primary,
                    inactiveTrackColor: primary.withValues(alpha: 0.1),
                    thumbColor: primary,
                    overlayColor: primary.withValues(alpha: 0.1),
                    valueIndicatorColor: primary,
                    valueIndicatorTextStyle: GoogleFonts.manrope(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  child: Slider(
                    value: localTarget.clamp(75, 95).toDouble(),
                    min: 75,
                    max: 95,
                    divisions: 4,
                    onChanged: (val) =>
                        setModalState(() => localTarget = val.toInt()),
                  ),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      final _ = ref
                          .read(authProvider.notifier)
                          .updateSettings(targetPercentage: localTarget);
                      Navigator.pop(context);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(
                      'Done',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    ref.read(uiModalOpenProvider.notifier).setOpen(false);
  }

  void _showInstitutionPicker(
    BuildContext context,
    WidgetRef ref,
    AuthenticatedUser user,
  ) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    final _ = showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      isScrollControlled: true,
      useRootNavigator: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      // Use Consumer so that institutionsProvider is watched reactively inside
      // the sheet. ref.read() would snapshot state at open-time, causing an
      // empty list if the provider resolves asynchronously after the tap.
      builder: (context) => Consumer(
        builder: (context, sheetRef, _) {
          final instsAsync = sheetRef.watch(institutionsProvider);
          final insts = instsAsync.value ?? [];
          return Container(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
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
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        LucideIcons.building,
                        color: primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Text(
                      'Select Institution',
                      style: GoogleFonts.manrope(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                if (instsAsync.isLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.of(context).size.height * 0.4,
                    ),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: insts.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final inst = insts[index];
                        final isSelected = inst.id.toString() == user.ezygoId;
                        return InkWell(
                          onTap: isSelected
                              ? null
                              : () async {
                                  await ref
                                      .read(authProvider.notifier)
                                      .updateDefaultInstitution(inst.id);
                                  if (context.mounted) Navigator.pop(context);
                                },
                          borderRadius: BorderRadius.circular(16),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? primary.withValues(alpha: 0.1)
                                  : Theme.of(
                                      context,
                                    ).colorScheme.onSurface.withValues(
                                      alpha: 0.05,
                                    ),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: isSelected
                                    ? primary.withValues(alpha: 0.3)
                                    : Theme.of(
                                        context,
                                      ).colorScheme.outlineVariant.withValues(
                                        alpha: 0.1,
                                      ),
                                width: isSelected ? 2 : 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        inst.name,
                                        style: GoogleFonts.manrope(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w800,
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.onSurface,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        inst.role.toUpperCase(),
                                        style: GoogleFonts.manrope(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurface
                                              .withValues(alpha: 0.4),
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  Icon(
                                    LucideIcons.checkCircle2,
                                    color: primary,
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    ).then((_) => ref.read(uiModalOpenProvider.notifier).setOpen(false));
  }
}

class _CustomSliderTickMarkShape extends SliderTickMarkShape {
  const _CustomSliderTickMarkShape({required this.tickMarkRadius});
  final double tickMarkRadius;

  @override
  Size getPreferredSize({
    required SliderThemeData sliderTheme,
    required bool isEnabled,
  }) => Size.fromRadius(tickMarkRadius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required TextDirection textDirection,
    required Offset thumbCenter,
    required bool isEnabled,
  }) {
    final canvas = context.canvas;

    final isBeforeThumb = center.dx < thumbCenter.dx;

    final paint = Paint()
      ..color = isBeforeThumb
          ? Colors.white.withValues(alpha: 0.4)
          : (sliderTheme.inactiveTickMarkColor ?? Colors.grey);

    canvas.drawCircle(center, 2.5, paint);
  }
}
