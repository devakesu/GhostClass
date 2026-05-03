import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:ghostclass/widgets/loading_overlay.dart';
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

class _ProfileScreenState extends ConsumerState<ProfileScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isEditing = false;
  bool _isSaving = false;

  final _formKey = GlobalKey<FormState>();
  
  // Controllers for Personal tab
  late TextEditingController _firstNameController;
  late TextEditingController _lastNameController;
  String? _selectedGender;
  DateTime? _selectedBirthDate;
  bool _isUploadingAvatar = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    
    // Initialize controllers with current user data
    final user = ref.read(authProvider).value;
    _firstNameController = TextEditingController(text: user?.profile?.firstName ?? '');
    _lastNameController = TextEditingController(text: user?.profile?.lastName ?? '');
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
      final supabaseToken = Supabase.instance.client.auth.currentSession?.accessToken;
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
        // Refresh local state
        await ref.read(authProvider.notifier).syncProfile();
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Profile updated successfully'),
              backgroundColor: Colors.green.shade800,
              behavior: SnackBarBehavior.floating,
            ),
          );
          setState(() => _isEditing = false);
        }
      } else {
        throw Exception(response.data['error'] ?? 'Failed to update profile');
      }
    } catch (e, st) {
      AppLogger.eWithContext(
        'ProfileScreen: Failed to save profile changes',
        error: e,
        stackTrace: st,
        tags: {
          'feature': 'profile',
          'action': 'save_profile',
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'We encountered an error while saving your profile. Please try again later. If the issue persists, please contact us.',
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
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

    String? uploadFileExtension;
    String? uploadUserId;

    try {
      final user = ref.read(authProvider).value;
      if (user == null) return;
      uploadUserId = user.supabaseUserId;

      final supabase = Supabase.instance.client;
      final file = File(image.path);
      final fileExt = path.extension(image.path).replaceAll('.', '');
      uploadFileExtension = fileExt.toLowerCase();
      
      // Strict whitelist check
      if (!['jpg', 'jpeg', 'png', 'webp'].contains(fileExt.toLowerCase())) {
        throw Exception('Unsupported file type. Use JPG, PNG or WebP.');
      }

      final fileName = '${DateTime.now().millisecondsSinceEpoch}.$fileExt';
      final filePath = '${user.supabaseUserId}/$fileName';

      // 1. Upload to Storage
      await supabase.storage.from('avatars').upload(
            filePath,
            file,
            fileOptions: const FileOptions(upsert: true),
          );

      // 2. Get Public URL
      final String publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath);

      // 3. Update Profile DB & Local State
      await ref.read(authProvider.notifier).updateAvatar(publicUrl);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Avatar updated successfully'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e, st) {
      AppLogger.eWithContext(
        'ProfileScreen: Avatar upload failed',
        error: e,
        stackTrace: st,
        tags: {
          'feature': 'profile',
          'action': 'avatar_upload',
        },
        extras: {
          'avatar.file_extension': uploadFileExtension ?? 'unknown',
          'avatar.user_id': uploadUserId ?? 'unknown',
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'We encountered an error while uploading your avatar. Please try again later. If the issue persists, please contact us.',
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final surface = Theme.of(context).colorScheme.surface;
    final primary = Theme.of(context).extension<GhostColors>()?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    final authAsync = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        leading: IconButton(
          icon: Icon(LucideIcons.chevronLeft, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Profile',
          style: GoogleFonts.manrope(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        centerTitle: true,
      ),
      body: authAsync.when(
        data: (user) {
          if (user == null) {
            return const LoadingOverlay(
              isFullScreen: false,
              showLogo: false,
            );
          }

          return Column(
            children: [
              // Header section
              _buildHeader(user, primary),
              
              // Tabs section
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: Theme.of(context).brightness == Brightness.dark ? null : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.02),
                      blurRadius: 8,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: TabBar(
                  controller: _tabController,
                  indicator: BoxDecoration(
                    color: primary,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                        color: primary.withValues(alpha: 0.2),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  dividerColor: Colors.transparent,
                  indicatorSize: TabBarIndicatorSize.tab,
                  labelColor: Colors.white,
                  unselectedLabelColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                  labelStyle: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 13),
                  tabs: const [
                    Tab(text: 'Personal'),
                    Tab(text: 'Account'),
                  ],
                ),
              ),

              // Tab content
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildPersonalTab(surface, primary),
                    _buildAccountTab(user, surface, primary),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const LoadingOverlay(
          isFullScreen: false,
          showLogo: false,
        ),
        error: (_, _) => Center(
          child: Text(
            'We encountered an error while loading your profile. Please try again later. If the issue persists, please contact us.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(AuthenticatedUser user, Color primary) {
    final surface = Theme.of(context).colorScheme.surface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        children: [
          Stack(
            children: [
              GestureDetector(
                onTap: _isUploadingAvatar ? null : _pickAndUploadAvatar,
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: surface,
                    border: Border.all(color: primary.withValues(alpha: 0.2), width: 4),
                    image: user.profile?.avatarUrl != null
                        ? DecorationImage(
                            image: NetworkImage(user.profile!.avatarUrl!),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: user.profile?.avatarUrl == null
                      ? Icon(LucideIcons.user, size: 32, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.15))
                      : null,
                ),
              ),
              if (_isUploadingAvatar)
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.4),
                      shape: BoxShape.circle,
                    ),
                    padding: const EdgeInsets.all(30),
                    child: const CircularProgressIndicator(strokeWidth: 3, color: Colors.white),
                  ),
                ),
              Positioned(
                bottom: 2,
                right: 2,
                child: GestureDetector(
                  onTap: _isUploadingAvatar ? null : _pickAndUploadAvatar,
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: primary,
                      shape: BoxShape.circle,
                      border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 3),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 10,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: const Icon(LucideIcons.camera, size: 14, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            user.profile?.fullName ?? user.username ?? 'Account',
            style: GoogleFonts.manrope(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
              letterSpacing: -0.5,
            ),
          ),
          Text(
            '@${user.username}',
            style: GoogleFonts.manrope(
              fontSize: 14,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    ).animate().fade().slideY(begin: 0.1);
  }

  Widget _buildPersonalTab(Color surface, Color primary) {
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
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                    letterSpacing: 1.2,
                  ),
                ),
                if (!_isEditing)
                  TextButton.icon(
                    onPressed: () => setState(() => _isEditing = true),
                    icon: const Icon(LucideIcons.pencil, size: 14),
                    label: const Text('Edit'),
                    style: TextButton.styleFrom(
                      foregroundColor: primary,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            _buildField(
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
            _buildField(
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
            // 4. Action Buttons (In-scroll to prevent keyboard from obscuring fields)
            if (_isEditing) ...[
              const SizedBox(height: 32),
              _buildActionBar(primary, Theme.of(context).scaffoldBackgroundColor),
              const SizedBox(height: 40),
            ],
          ],
        ),
      ),
    ).animate().fade(delay: 200.ms);
  }

  Widget _buildAccountTab(AuthenticatedUser user, Color surface, Color primary) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionHeader('ACCOUNT INFO'),
          const SizedBox(height: 12),
          
          // Compact Info Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(20),
              border: Theme.of(context).brightness == Brightness.dark ? Border.all(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.05)) : null,
              boxShadow: Theme.of(context).brightness == Brightness.dark ? null : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                )
              ],
            ),
            child: Column(
              children: [
                _buildAccountItem(
                  LucideIcons.userCheck,
                  'Username',
                  user.username ?? '—',
                  primary,
                ),
                _buildDivider(),
                _buildAccountItem(
                  LucideIcons.fingerprint,
                  'EzyGo ID',
                  user.ezygoId ?? '—',
                  primary,
                ),
                _buildDivider(),
                _buildAccountItem(
                  LucideIcons.mail,
                  'Email',
                  user.profile?.email ?? '—',
                  primary,
                ),
                _buildDivider(),
                if (user.profile?.classField != null) ...[
                  _buildAccountItem(
                    LucideIcons.school,
                    'Class',
                    user.profile!.classField!.name,
                    primary,
                  ),
                  _buildDivider(),
                ],
                _buildAccountItem(
                  LucideIcons.phone,
                  'Mobile',
                  user.profile?.phone != null ? '+${user.profile!.phone}' : '—',
                  primary,
                ),
                _buildDivider(),
                _buildAccountItem(
                  LucideIcons.calendarClock,
                  'Account Created',
                  () {
                    try {
                      if (user.profile?.ezygoCreatedAt != null) {
                        return DateFormat('dd MMM yyyy').format(DateTime.parse(user.profile!.ezygoCreatedAt!));
                      }
                    } catch (e) {
                      AppLogger.w('ProfileScreen: Failed to parse EzyGo created date', e);
                    }
                    
                    try {
                      if (user.profile?.createdAt != null) {
                        return DateFormat('dd MMM yyyy').format(DateTime.parse(user.profile!.createdAt!));
                      }
                    } catch (e) {
                      AppLogger.w('ProfileScreen: Failed to parse account created date', e);
                    }
                    
                    return '—';
                  }(),
                  primary,
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          Row(
             children: [
                Icon(LucideIcons.info, size: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2)),
                const SizedBox(width: 8),
                Text(
                  'Synced from EzyGo. Cannot be changed here.',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
             ],
          ),
          const SizedBox(height: 40),
        ],
      ),
    ).animate().fade(delay: 200.ms).slideY(begin: 0.05);
  }

  Widget _buildAccountItem(IconData icon, String label, String value, Color primary) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: primary),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.manrope(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.95),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Divider(height: 1, color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.2)),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: GoogleFonts.manrope(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
        letterSpacing: 1.2,
      ),
    );
  }

  Widget _buildField({
    required String label,
    required TextEditingController controller,
    bool enabled = true,
    int? maxLength,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          enabled: enabled,
          validator: validator,
          maxLength: maxLength,
          buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null,
          style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
          decoration: InputDecoration(
            filled: true,
            fillColor: enabled ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1)),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.05)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.5),
            ),
          ),
        ),
      ],
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
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox( // Narrow width gender selector
          width: 200,
          child: DropdownButtonFormField<String>(
            initialValue: _selectedGender,
            onChanged: _isEditing ? (v) => setState(() => _selectedGender = v) : null,
            dropdownColor: Theme.of(context).colorScheme.surface,
            style: GoogleFonts.manrope(
              color: Theme.of(context).colorScheme.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            icon: Icon(LucideIcons.chevronDown, size: 18, color: primary.withValues(alpha: 0.5)),
            decoration: InputDecoration(
              filled: true,
              fillColor: _isEditing ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1)),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.05)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: primary, width: 1.5),
              ),
            ),
            items: [
              'male',
              'female',
              'other'
            ]
                .map((g) => DropdownMenuItem(
                      value: g,
                      child: Text(
                        g[0].toUpperCase() + g.substring(1),
                        style: GoogleFonts.manrope(color: Theme.of(context).colorScheme.onSurface),
                      ),
                    ))
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
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: _isEditing ? () async {
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
                      style: TextButton.styleFrom(foregroundColor: primary),
                    ),
                  ),
                  child: child!,
                );
              },
            );
            if (picked != null) setState(() => _selectedBirthDate = picked);
          } : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _selectedBirthDate != null 
                      ? DateFormat('dd MMM yyyy').format(_selectedBirthDate!)
                      : 'DD MMM YYYY',
                  style: GoogleFonts.manrope(
                    color: _selectedBirthDate != null ? Theme.of(context).colorScheme.onSurface : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Icon(LucideIcons.calendar, size: 16, color: _isEditing ? primary : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionBar(Color primary, Color bg) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: bg,
        border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.05))),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isSaving ? null : () => setState(() => _isEditing = false),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.4)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text('Cancel', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.95))),
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: _isSaving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min, // Constrain Row width
                      children: const [
                        Icon(LucideIcons.check, size: 18),
                        SizedBox(width: 8),
                        Padding(
                          padding: EdgeInsets.only(top: 1), // Micro-adjustment for baseline
                          child: Text('Save Changes', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    ).animate().slideY(begin: 1, duration: 300.ms, curve: Curves.easeOutCubic);
  }
}
