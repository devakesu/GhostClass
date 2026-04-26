import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/theme/app_theme.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Help & FAQ',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
      ),
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader(context, LucideIcons.bookOpen, 'Course Card Explained'),
            const SizedBox(height: 16),
            _buildInfoCard(
              context,
              'GhostClass shows your official data plus any manually tracked corrections or extras. The official percentage is always shown; adjustments are displayed separately.',
            ),
            const SizedBox(height: 24),
            
            _buildSectionHeader(context, LucideIcons.messageSquare, 'Frequently Asked Questions'),
            const SizedBox(height: 16),
            ..._faqs.map((faq) => _buildFaqItem(context, faq['question']!, faq['answer']!)),
            const SizedBox(height: 32),
            
            _buildContactCard(context, primary),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, IconData icon, String title) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 12),
        Text(
          title,
          style: GoogleFonts.manrope(
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
      ],
    ).animate().fadeIn(duration: 400.ms).slideX(begin: -0.1);
  }

  Widget _buildInfoCard(BuildContext context, String text) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.1)),
      ),
      child: Text(
        text,
        style: GoogleFonts.manrope(
          fontSize: 14,
          height: 1.6,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8),
        ),
      ),
    ).animate().fadeIn(delay: 200.ms);
  }

  Widget _buildFaqItem(BuildContext context, String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.05)),
      ),
      child: ExpansionTile(
        shape: const RoundedRectangleBorder(side: BorderSide.none),
        collapsedShape: const RoundedRectangleBorder(side: BorderSide.none),
        title: Text(
          question,
          style: GoogleFonts.manrope(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text(
            answer,
            style: GoogleFonts.manrope(
              fontSize: 13,
              height: 1.5,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildContactCard(BuildContext context, Color primary) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [primary.withValues(alpha: 0.1), Colors.transparent],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Icon(LucideIcons.helpCircle, size: 32, color: primary),
          const SizedBox(height: 16),
          Text(
            'Need More Help?',
            style: GoogleFonts.manrope(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            "Couldn't find what you were looking for? Reach out via the contact page.",
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => context.push('/contact'),
            style: ElevatedButton.styleFrom(
              backgroundColor: primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Contact Us'),
          ),
        ],
      ),
    ).animate().fadeIn(delay: 400.ms).scale(begin: const Offset(0.95, 0.95));
  }

  static const _faqs = [
    {
      'question': 'Why is my attendance percentage different from EzyGo?',
      'answer': 'GhostClass shows your official data plus any manually tracked corrections or extras. The official percentage is always shown; adjustments are displayed separately.',
    },
    {
      'question': 'Does GhostClass change my real attendance?',
      'answer': 'No. GhostClass is a read-only calculator. It cannot modify any records in your institution\'s system.',
    },
    {
      'question': 'What is the bunk calculator?',
      'answer': 'The bunk calculator tells you how many classes you can safely skip — or must attend — to stay at or above your target attendance percentage.',
    },
    {
      'question': 'How do I set my target attendance?',
      'answer': 'Update the target percentage from the profile screen. The default is 75%.',
    },
    {
      'question': 'What does "syncing" mean?',
      'answer': 'GhostClass periodically fetches your latest attendance from EzyGo. If data looks stale, use the refresh option on the dashboard.',
    },
    {
      'question': 'Is my EzyGo password stored anywhere?',
      'answer': 'No. Your password is used once to authenticate and is never persisted. Only the resulting encrypted token is stored.',
    },
  ];
}
