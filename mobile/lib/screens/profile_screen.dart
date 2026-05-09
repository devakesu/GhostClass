import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
import 'package:ghostclass/widgets/service_error_view.dart';
import 'package:ghostclass/widgets/profile/profile_widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:path/path.dart' as path;
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isEditing = false;
  bool _isSaving = false;
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _firstNameController;
  late TextEditingController _lastNameController;
  String? _selectedGender;
  DateTime? _selectedBirthDate;
  bool _isUploadingAvatar = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    final user = ref.read(authProvider).value;
    _firstNameController = TextEditingController(
      text: user?.profile?.firstName ?? '',
    );
    _lastNameController = TextEditingController(
      text: user?.profile?.lastName ?? '',
    );
    _selectedGender = user?.profile?.gender?.toLowerCase();
    if (user?.profile?.birthDate != null) {
      try {
        _selectedBirthDate = DateTime.parse(user!.profile!.birthDate!);
      } catch (e) {
        AppLogger.w('ProfileScreen: Failed to parse birth date', e);
      }
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    try {
      final user = ref.read(authProvider).value;
      if (user == null) return;
      final api = ref.read(apiServiceProvider);
      final supabaseToken =
          Supabase.instance.client.auth.currentSession?.accessToken;
      if (supabaseToken == null) throw Exception('Session expired');

      final data = {
        'first_name': _firstNameController.text.trim(),
        'last_name': _lastNameController.text.trim(),
        'gender': _selectedGender,
        'birth_date': _selectedBirthDate != null
            ? DateFormat('yyyy-MM-dd').format(_selectedBirthDate!)
            : null,
      };

      final response = await api.updateProfile(supabaseToken, data);
      if (response.statusCode == 200) {
        await ref.read(authProvider.notifier).syncProfile();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Profile updated successfully'),
              backgroundColor: Colors.green,
            ),
          );
          setState(() => _isEditing = false);
        }
      }
    } catch (e, st) {
      AppLogger.e('ProfileScreen: Save failed', e, st);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final XFile? image = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 512,
      maxHeight: 512,
      imageQuality: 85,
    );
    if (image == null) return;
    setState(() => _isUploadingAvatar = true);
    try {
      final user = ref.read(authProvider).value;
      if (user == null) return;
      final file = File(image.path);
      final fileExt = path.extension(image.path).replaceAll('.', '');
      final fileName = '${DateTime.now().millisecondsSinceEpoch}.$fileExt';
      final filePath = '${user.supabaseUserId}/$fileName';
      final supabase = Supabase.instance.client;
      await supabase.storage.from('avatars').upload(filePath, file);
      final publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath);
      await ref.read(authProvider.notifier).updateAvatar(publicUrl);
    } catch (e, st) {
      AppLogger.e('ProfileScreen: Upload failed', e, st);
    } finally {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final primary =
        Theme.of(context).extension<GhostColors>()?.brandPrimary ??
        Theme.of(context).colorScheme.primary;
    final authAsync = ref.watch(authProvider);

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
          'Profile',
          style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
      ),
      body: authAsync.when(
        data: (user) {
          if (user == null)
            return const LoadingOverlay(isFullScreen: false, showLogo: false);
          return Column(
            children: [
              ProfileHeader(
                avatarUrl: user.profile?.avatarUrl,
                fullName: user.profile?.fullName ?? user.username ?? 'Account',
                username: user.username ?? '',
                primary: primary,
                isUploadingAvatar: _isUploadingAvatar,
                onAvatarTap: _pickAndUploadAvatar,
              ),
              _buildTabs(primary),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildPersonalTab(primary),
                    _buildAccountTab(user, primary),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () =>
            const LoadingOverlay(isFullScreen: false, showLogo: false),
        error: (err, _) => ServiceErrorView(
          error: err,
          onRetry: () => ref.invalidate(authProvider),
        ),
      ),
    );
  }

  Widget _buildTabs(Color primary) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: primary,
          borderRadius: BorderRadius.circular(10),
        ),
        dividerColor: Colors.transparent,
        indicatorSize: TabBarIndicatorSize.tab,
        labelColor: Colors.white,
        unselectedLabelColor: Theme.of(
          context,
        ).colorScheme.onSurface.withValues(alpha: 0.5),
        tabs: const [
          Tab(text: 'Personal'),
          Tab(text: 'Account'),
        ],
      ),
    );
  }

  Widget _buildPersonalTab(Color primary) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'BASIC DETAILS',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.6),
                    letterSpacing: 1.2,
                  ),
                ),
                if (!_isEditing)
                  TextButton.icon(
                    onPressed: () => setState(() => _isEditing = true),
                    icon: const Icon(LucideIcons.pencil, size: 14),
                    label: const Text('Edit'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            ProfileField(
              label: 'First Name',
              controller: _firstNameController,
              enabled: _isEditing,
              maxLength: 50,
              validator: (v) {
                if ((v?.trim().length ?? 0) < 2) return 'Min 2 characters';
                if ((v?.trim().length ?? 0) > 50) return 'Max 50 characters';
                return null;
              },
            ),
            const SizedBox(height: 16),
            ProfileField(
              label: 'Last Name',
              controller: _lastNameController,
              enabled: _isEditing,
              maxLength: 50,
              validator: (v) {
                if ((v?.trim().length ?? 0) > 50) return 'Max 50 characters';
                return null;
              },
            ),
            const SizedBox(height: 16),
            _buildGenderDropdown(primary),
            const SizedBox(height: 16),
            _buildDatePicker(primary),
            if (_isEditing) ...[
              const SizedBox(height: 32),
              _buildActionBar(primary),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildGenderDropdown(Color primary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Gender',
          style: GoogleFonts.manrope(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: 200,
          child: DropdownButtonFormField<String>(
            initialValue: _selectedGender,
            onChanged: _isEditing
                ? (v) => setState(() => _selectedGender = v)
                : null,
            dropdownColor: Theme.of(context).colorScheme.surface,
            style: GoogleFonts.manrope(
              color: Theme.of(context).colorScheme.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            icon: Icon(
              LucideIcons.chevronDown,
              size: 18,
              color: primary.withValues(alpha: 0.5),
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: _isEditing
                  ? Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.08)
                  : Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.05),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 14,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.1),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.1),
                ),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.05),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: primary, width: 1.5),
              ),
            ),
            items: ['male', 'female', 'other']
                .map(
                  (g) => DropdownMenuItem(
                    value: g,
                    child: Text(
                      g[0].toUpperCase() + g.substring(1),
                      style: GoogleFonts.manrope(
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildDatePicker(Color primary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Date of Birth',
          style: GoogleFonts.manrope(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: _isEditing
              ? () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _selectedBirthDate ?? DateTime(2000),
                    firstDate: DateTime(1950),
                    lastDate: DateTime.now(),
                    builder: (context, child) {
                      return Theme(
                        data: Theme.of(context).copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: primary,
                            onPrimary: Colors.white,
                            surface: Theme.of(context).colorScheme.surface,
                            onSurface: Theme.of(context).colorScheme.onSurface,
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(
                              foregroundColor: primary,
                            ),
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null)
                    setState(() => _selectedBirthDate = picked);
                }
              : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _selectedBirthDate != null
                      ? DateFormat('dd MMM yyyy').format(_selectedBirthDate!)
                      : 'DD MMM YYYY',
                  style: GoogleFonts.manrope(
                    color: _selectedBirthDate != null
                        ? Theme.of(context).colorScheme.onSurface
                        : Theme.of(
                            context,
                          ).colorScheme.onSurface.withValues(alpha: 0.2),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Icon(
                  LucideIcons.calendar,
                  size: 16,
                  color: _isEditing
                      ? primary
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.2),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionBar(Color primary) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: bg,
        border: Border(
          top: BorderSide(
            color: Theme.of(
              context,
            ).colorScheme.outlineVariant.withValues(alpha: 0.05),
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isSaving
                  ? null
                  : () => setState(() => _isEditing = false),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.4),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                'Cancel',
                style: TextStyle(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.95),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: _isSaving ? null : _handleSave,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(LucideIcons.check, size: 18, color: Colors.white),
                        SizedBox(width: 8),
                        Padding(
                          padding: EdgeInsets.only(top: 1),
                          child: Text(
                            'Save Changes',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAccountTab(AuthenticatedUser user, Color primary) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ACCOUNT INFO',
            style: GoogleFonts.manrope(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(20),
              boxShadow: Theme.of(context).brightness == Brightness.dark
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
                ProfileAccountItem(
                  icon: LucideIcons.userCheck,
                  label: 'Username',
                  value: user.username ?? '—',
                  primary: primary,
                ),
                Divider(
                  height: 24,
                  thickness: 1,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                ProfileAccountItem(
                  icon: LucideIcons.fingerprint,
                  label: 'EzyGo ID',
                  value: user.ezygoId ?? '—',
                  primary: primary,
                ),
                Divider(
                  height: 24,
                  thickness: 1,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                ProfileAccountItem(
                  icon: LucideIcons.mail,
                  label: 'Email',
                  value: user.profile?.email ?? '—',
                  primary: primary,
                ),
                Divider(
                  height: 24,
                  thickness: 1,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                if (user.profile?.classField != null) ...[
                  ProfileAccountItem(
                    icon: LucideIcons.school,
                    label: 'Class',
                    value: user.profile!.classField!.name,
                    primary: primary,
                  ),
                  Divider(
                    height: 24,
                    thickness: 1,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.05),
                  ),
                ],
                ProfileAccountItem(
                  icon: LucideIcons.phone,
                  label: 'Mobile',
                  value: user.profile?.phone != null
                      ? '+${user.profile!.phone}'
                      : '—',
                  primary: primary,
                ),
                Divider(
                  height: 24,
                  thickness: 1,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                ),
                ProfileAccountItem(
                  icon: LucideIcons.calendarClock,
                  label: 'Account Created',
                  value: () {
                    try {
                      if (user.profile?.ezygoCreatedAt != null) {
                        return DateFormat(
                          'dd MMM yyyy',
                        ).format(DateTime.parse(user.profile!.ezygoCreatedAt!));
                      }
                    } catch (e) {
                      AppLogger.w(
                        'ProfileScreen: Failed to parse EzyGo created date',
                        e,
                      );
                    }
                    try {
                      if (user.profile?.createdAt != null) {
                        return DateFormat(
                          'dd MMM yyyy',
                        ).format(DateTime.parse(user.profile!.createdAt!));
                      }
                    } catch (e) {
                      AppLogger.w(
                        'ProfileScreen: Failed to parse account created date',
                        e,
                      );
                    }
                    return '—';
                  }(),
                  primary: primary,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Icon(
                LucideIcons.info,
                size: 14,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.2),
              ),
              const SizedBox(width: 8),
              Text(
                'Synced from EzyGo. Cannot be changed here.',
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }
}
