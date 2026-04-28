import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/config/app_config.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/theme_provider.dart';
import 'package:ghostclass/providers/ui_state_provider.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_refresh_indicator.dart';
import 'package:ghostclass/widgets/transparency_badge.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:ghostclass/models/institution.dart';
import 'package:url_launcher/url_launcher.dart';

class GhostClassScreen extends ConsumerWidget {
  const GhostClassScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;

    final authState = ref.watch(authProvider);
    final themeMode = ref.watch(themeProvider);

    return Scaffold(
      backgroundColor: bg,
      body: authState.when(
        data: (user) {
          if (user == null) {
            return const LoadingOverlay(
              isFullScreen: false,
              showLogo: false,
            );
          }

          return ServiceRefreshIndicator(
            onRefresh: () async {
              final authNotifier = ref.read(authProvider.notifier);
              await authNotifier.syncProfile();
            },
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              // Branding Section
              const SliverToBoxAdapter(child: _TopBrandingSection()),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 6, 24, 0),
                  child: TransparencyBadge(
                    onTap: () => context.push('/about'),
                  ),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 6)),

              // Settings Section
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _SectionTitle(title: 'APP SETTINGS', color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3)),
                    const SizedBox(height: 12),
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
                    childAspectRatio: 0.95, // Wider for vertical toggle row
                  ),
                  delegate: SliverChildListDelegate([
                    // Target Percentage Selector
                    _SettingsCard(
                      icon: LucideIcons.target,
                      label: 'Target',
                      value: '${user.settings.targetPercentage}%',
                      color: primary,
                      onTap: () => _showTargetPicker(context, ref, user),
                    ),
                    // Bunk Calculator Toggle
                    _SettingsCard(
                      icon: LucideIcons.calculator,
                      label: 'Bunk',
                      value: user.settings.bunkCalculatorEnabled ? 'ON' : 'OFF',
                      color: ghostColors?.accentBlue ?? const Color(0xFF6366F1),
                      isActive: user.settings.bunkCalculatorEnabled,
                      showToggle: true,
                      toggleValue: user.settings.bunkCalculatorEnabled,
                      onToggle: (val) => ref
                          .read(authProvider.notifier)
                          .updateSettings(bunkEnabled: val),
                      onTap: () => ref
                          .read(authProvider.notifier)
                          .updateSettings(
                            bunkEnabled: !user.settings.bunkCalculatorEnabled,
                          ),
                    ),
                    // Theme Switcher
                    _SettingsCard(
                      icon: themeMode == ThemeMode.dark
                          ? LucideIcons.moon
                          : LucideIcons.sun,
                      label: 'Theme',
                      value: themeMode == ThemeMode.dark ? 'DARK' : 'LIGHT',
                      color: ghostColors?.successGreen ?? const Color(0xFF10B981),
                      isActive: themeMode == ThemeMode.dark,
                      showToggle: true,
                      toggleValue: themeMode == ThemeMode.dark,
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
                  child: _SettingsCard(
                    icon: LucideIcons.building,
                    label: 'Institution',
                    isFullWidth: true,
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

              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 32,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    const SizedBox(height: 12),
                    _MenuTile(
                      icon: LucideIcons.userCircle,
                      title: 'Profile',
                      subtitle: 'Personal details',
                      onTap: () => context.push('/profile'),
                      color: ghostColors?.accentOrange ?? const Color(0xFFFACC15),
                    ),
                    _MenuTile(
                      icon: LucideIcons.helpCircle,
                      title: 'Help Center',
                      subtitle: 'FAQs and support',
                      onTap: () => context.push('/help'),
                      color: ghostColors?.accentBlue ?? const Color(0xFF6366F1),
                    ),
                    _MenuTile(
                      icon: LucideIcons.mail,
                      title: 'Contact Us',
                      subtitle: 'Get in touch with our team',
                      onTap: () => context.push('/contact'),
                      color: ghostColors?.accentOrange ?? const Color(0xFFF59E0B),
                    ),
                    _MenuTile(
                      icon: LucideIcons.shieldCheck,
                      title: 'Legal',
                      subtitle: 'Terms, Privacy & Licenses',
                      onTap: () => context.push('/legal'),
                      color: ghostColors?.successGreen ?? const Color(0xFF10B981),
                    ),
                    _MenuTile(
                      icon: LucideIcons.database,
                      title: 'Account Dump',
                      subtitle: 'Detailed account information',
                      onTap: () => context.push('/profile-dump'),
                      color: primary,
                    ),
                    const SizedBox(height: 40),
                    _SectionTitle(
                      title: 'Danger Zone',
                      color: primary.withValues(alpha: 0.8),
                    ),
                    const SizedBox(height: 12),
                    _MenuTile(
                      icon: LucideIcons.logOut,
                      title: 'Logout',
                      subtitle: 'Sign out of GhostClass',
                      color: primary,
                      isDanger: true,
                      onTap: () => _handleLogout(context, ref),
                    ),
                    const SizedBox(height: 12),
                    _MenuTile(
                      icon: LucideIcons.trash2,
                      title: 'Delete Account',
                      subtitle: 'Permanently remove all data',
                      color: primary,
                      isDanger: true,
                      onTap: () => _handleDeleteAccount(context, ref),
                    ),
                    const SizedBox(height: 16),
                  ]),
                ),
              ),
              SliverToBoxAdapter(child: _VersionFooter()),
              const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
            ],
            ),
          );
        },
        loading: () => const LoadingOverlay(isFullScreen: false, showLogo: false),
        error: (_, _) => Center(
          child: Text(
            'We encountered an error while loading your settings. Please try again later. If the issue persists, please contact us.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
          ),
        ),
      ),
    );
  }

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final surface = Theme.of(context).scaffoldBackgroundColor;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: surface,
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
          style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancel',
              style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)),
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
    final surface = Theme.of(context).scaffoldBackgroundColor;
    
    final TextEditingController controller = TextEditingController();
    
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            backgroundColor: surface,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            title: Row(
              children: [
                const Icon(LucideIcons.skull, color: Colors.redAccent, size: 22),
                const SizedBox(width: 12),
                Text(
                  'Permanent Disposal',
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'This action is final. Your attendance history, custom settings, and profile data will be purged from existence. This cannot be undone.',
                  style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.85), fontSize: 13, height: 1.5, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 24),
                Text(
                  'Type DELETE to confirm:',
                  style: GoogleFonts.manrope(
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: controller,
                  autofocus: true,
                  onChanged: (val) => setState(() {}),
                  style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold),
                  decoration: InputDecoration(
                    hintText: 'DELETE',
                    hintStyle: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1)),
                    filled: true,
                    fillColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Colors.redAccent),
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text(
                  'Cancel',
                  style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontWeight: FontWeight.w600),
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
                    disabledBackgroundColor: Colors.redAccent.withValues(alpha: 0.1),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text(
                    'Erase Existence',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          );
        }
      ),
    );

    if (confirmed == true) {
      if (!context.mounted) return;
      
      LoadingOverlay.show(context, message: 'Purging your mortal data... 💀');
      
      try {
        await ref.read(authProvider.notifier).deleteAccount();
        // logout() inside deleteAccount triggers the state update which triggers redirection via GoRouter.
      } catch (e, st) {
        AppLogger.eWithContext(
          'GhostClassScreen: Account deletion failed',
          error: e,
          stackTrace: st,
          tags: {
            'feature': 'account',
            'action': 'delete_account',
          },
        );
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop(); // Hide overlay
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'We encountered an error while deleting your account. Please try again later. If the issue persists, please contact us.',
              ),
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
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;

    ref.read(uiModalOpenProvider.notifier).setOpen(true);
    await showModalBottomSheet(
      context: context,
      backgroundColor: bg,
      isScrollControlled: true,
      useRootNavigator: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      builder: (context) {
        final initialUser = ref.read(authProvider).value;
        if (initialUser == null) return const SizedBox.shrink();
        
        int localTarget = initialUser.settings.targetPercentage;

        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              padding: const EdgeInsets.all(32),
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.8,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
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
                              'Select your attendance goal',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
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
                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        activeTrackColor: primary,
                        inactiveTrackColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
                        thumbColor: Theme.of(context).colorScheme.onSurface,
                        overlayColor: primary.withValues(alpha: 0.2),
                        trackHeight: 8,
                        thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 12,
                        ),
                      ),
                      child: Slider(
                        value: localTarget.clamp(75, 95).toDouble(),
                        min: 75,
                        max: 95,
                        divisions: 4,
                        onChanged: (val) {
                          setModalState(() => localTarget = val.toInt());
                        },
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '75%',
                          style: GoogleFonts.manrope(
                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          '95%',
                          style: GoogleFonts.manrope(
                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 40),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          ref
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
                          style:
                              GoogleFonts.manrope(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    if (context.mounted) {
      ref.read(uiModalOpenProvider.notifier).setOpen(false);
    }
  }

  void _showInstitutionPicker(
    BuildContext context,
    WidgetRef ref,
    AuthenticatedUser user,
  ) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final surface = Theme.of(context).colorScheme.surface;

    final institutionsAsync = ref.read(institutionsProvider);

    institutionsAsync.whenData((institutions) async {
      ref.read(uiModalOpenProvider.notifier).setOpen(true);
      await showModalBottomSheet(
        context: context,
        backgroundColor: bg,
        isScrollControlled: true,
        useRootNavigator: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        builder: (context) => Container(
          padding: const EdgeInsets.all(24),
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.8,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Select Institution',
                style: GoogleFonts.manrope(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Switch your active educational institution',
                style: GoogleFonts.manrope(fontSize: 13, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
              ),
              const SizedBox(height: 24),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    children: institutions.map((inst) {
                      final isSelected = inst.id.toString() == user.ezygoId;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: InkWell(
                          onTap: isSelected
                              ? null
                              : () async {
                                  final notifier = ref.read(
                                    authProvider.notifier,
                                  );
                                  try {
                                    await notifier.updateDefaultInstitution(
                                      inst.id,
                                    );
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Default institution updated',
                                          ),
                                          backgroundColor: Colors.green,
                                        ),
                                      );
                                      WidgetsBinding.instance
                                          .addPostFrameCallback((_) {
                                            if (context.mounted) {
                                              Navigator.of(context).pop();
                                            }
                                          });
                                    }
                                  } catch (e, st) {
                                    AppLogger.eWithContext(
                                      'GhostClassScreen: Failed to update default institution',
                                      error: e,
                                      stackTrace: st,
                                      tags: {
                                        'feature': 'institutions',
                                        'action': 'update_default',
                                      },
                                      extras: {
                                        'institutions.target_id': inst.id,
                                        'institutions.current_id': user.ezygoId,
                                      },
                                    );
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'We encountered an error while updating your institution. Please try again later. If the issue persists, please contact us.',
                                          ),
                                          backgroundColor: Colors.red,
                                        ),
                                      );
                                    }
                                  }
                                },
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? primary.withValues(alpha: 0.1)
                                  : surface,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: isSelected
                                    ? primary.withValues(alpha: 0.3)
                                    : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: isSelected
                                        ? primary.withValues(alpha: 0.2)
                                        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Icon(
                                    LucideIcons.building,
                                    size: 20,
                                    color: isSelected
                                        ? primary
                                        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        inst.name,
                                        style: GoogleFonts.manrope(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w700,
                                          color: isSelected
                                              ? Theme.of(context).colorScheme.onSurface
                                              : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                                        ),
                                      ),
                                      Text(
                                        inst.role.toUpperCase(),
                                        style: GoogleFonts.manrope(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: isSelected
                                              ? primary
                                              : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                                          letterSpacing: 1,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  Icon(
                                    LucideIcons.checkCircle2,
                                    size: 20,
                                    color: primary,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      );
      if (context.mounted) {
        ref.read(uiModalOpenProvider.notifier).setOpen(false);
      }
    });
  }
}

class _SettingsCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final VoidCallback onTap;
  final bool isActive;
  final bool showToggle;
  final bool toggleValue;
  final ValueChanged<bool>? onToggle;
  final bool isFullWidth;

  const _SettingsCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    required this.onTap,
    this.isActive = false,
    this.showToggle = false,
    this.toggleValue = false,
    this.onToggle,
    this.isFullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final surface = Theme.of(context).colorScheme.surface;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: isFullWidth
            ? const EdgeInsets.all(16)
            : const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        decoration: BoxDecoration(
          color: isActive ? color : (isDark ? surface : Theme.of(context).colorScheme.surface),
          borderRadius: BorderRadius.circular(24),
          border: isDark ? Border.all(
            color: isActive
                ? color.withValues(alpha: 0.1)
                : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
          ) : null,
          boxShadow: isDark ? null : [
            BoxShadow(
              color: (isActive ? color : Colors.black).withValues(alpha: isActive ? 0.15 : 0.03),
              blurRadius: isActive ? 12 : 8,
              offset: Offset(0, isActive ? 6 : 4),
            )
          ],
        ),
        child: isFullWidth
            ? Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: isActive ? Colors.white.withValues(alpha: 0.2) : color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, size: 22, color: isActive ? Colors.white : color),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                          Text(
                            label,
                            style: GoogleFonts.manrope(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: isActive ? Colors.white.withValues(alpha: 0.7) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                            ),
                          ),
                        const SizedBox(height: 2),
                        Text(
                          value,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.manrope(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: isActive ? Colors.white : Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isActive ? Colors.white.withValues(alpha: 0.2) : color.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(icon, size: 18, color: isActive ? Colors.white : color),
                        ),
                      if (showToggle)
                        RotatedBox(
                          quarterTurns: 1, // Vertical toggle
                          child: SizedBox(
                            width: 32,
                            height: 20,
                            child: Transform.scale(
                              scale: 0.7,
                              child: Switch.adaptive(
                                value: toggleValue,
                                onChanged: onToggle,
                                activeThumbColor: Colors.white,
                                activeTrackColor: Colors.white.withValues(alpha: 0.3),
                                inactiveTrackColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.1),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: GoogleFonts.manrope(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                          color: isActive ? Colors.white.withValues(alpha: 0.7) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: isActive ? Colors.white : Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    ).animate().fade().scale(delay: 50.ms);
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final Color? color;

  const _SectionTitle({required this.title, this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.zero,
      child: Text(
        title.toUpperCase(),
        style: GoogleFonts.manrope(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: color ?? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color color;
  final bool isDanger;

  const _MenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.color,
    this.isDanger = false,
  });

  @override
  Widget build(BuildContext context) {
    final surface = Theme.of(context).colorScheme.surface;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDanger ? color.withValues(alpha: 0.05) : surface,
            borderRadius: BorderRadius.circular(20),
            border: isDark ? Border.all(
              color: isDanger
                  ? color.withValues(alpha: 0.1)
                  : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
            ) : null,
            boxShadow: isDark ? null : [
              BoxShadow(
                color: (isDanger ? color : Colors.black).withValues(alpha: 0.02),
                blurRadius: 10,
                offset: const Offset(0, 4),
              )
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 20, color: color),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.manrope(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: isDanger ? color : Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2),
              ),
            ],
          ),
        ),
      ),
    ).animate().fade().slideY(begin: 0.05);
  }
}

class _TopBrandingSection extends StatelessWidget {
  const _TopBrandingSection();

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authorName = AppConfig.authorName;
    final authorUrl = AppConfig.authorUrl;
    final githubUrl = AppConfig.githubUrl;
    final donateUrl = AppConfig.donateUrl;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          // Author Credits at Very Top
          GestureDetector(
            onTap: () => _launchUrl(authorUrl),
            behavior: HitTestBehavior.opaque,
            child: Column(
              children: [
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8),
                      letterSpacing: 2.5,
                    ),
                    children: [
                      const TextSpan(text: 'CRAFTED WITH '),
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Icon(
                          LucideIcons.heart,
                          size: 11,
                          color: Colors.pinkAccent.withValues(alpha: 0.8),
                        ),
                      ),
                      const TextSpan(text: ' BY'),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  authorName.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.onSurface,
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Action Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _FooterActionButton(
                icon: LucideIcons.coffee,
                label: 'Buy me a Coffee',
                color: Theme.of(context).brightness == Brightness.dark ? Colors.pinkAccent : const Color(0xFFDB2777),
                onTap: () => _launchUrl(donateUrl),
              ),
              const SizedBox(width: 12),
              _FooterActionButton(
                icon: LucideIcons.star,
                label: 'Star on GitHub',
                color: Theme.of(context).brightness == Brightness.dark ? Colors.amber : Colors.amber.shade700,
                onTap: () => _launchUrl(githubUrl),
              ),
            ],
          ),
          const SizedBox(height: 32),

          // Links
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SecondaryLink(
                label: 'GHOSTCLASS WEB',
                onTap: () => _launchUrl(AppConfig.ghostclassWebUrl),
              ),
              const SizedBox(width: 24),
              _SecondaryLink(
                label: 'PROJECT CREDITS',
                onTap: () => _launchUrl(AppConfig.githubUrl),
              ),
            ],
          ),
          const SizedBox(height: 32),
          // Minimal Divider to Settings
          Container(
            width: 32,
            height: 4,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}

class _VersionFooter extends StatelessWidget {
  const _VersionFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: Column(
        children: [
          _VersionText(),
        ],
      ),
    );
  }
}

class _VersionText extends StatelessWidget {
  const _VersionText();

  @override
  Widget build(BuildContext context) {
    return Text(
      'GHOSTCLASS v${AppConfig.appVersion}',
      style: GoogleFonts.manrope(
        fontSize: 9,
        fontWeight: FontWeight.w900,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
        letterSpacing: 5,
      ),
    );
  }
}

class _FooterActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _FooterActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 10),
            Text(
              label.toUpperCase(),
              style: GoogleFonts.manrope(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: color,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SecondaryLink extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _SecondaryLink({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Text(
        label,
        style: GoogleFonts.manrope(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}
