import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:ghostclass/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ghostColors = theme.extension<GhostColors>();
    final primary = ghostColors?.brandPrimary ?? theme.colorScheme.primary;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
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
            // --- Header ---
            Row(
              children: [
                Icon(LucideIcons.helpCircle, size: 32, color: primary),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Help & FAQ',
                        style: GoogleFonts.manrope(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      Text(
                        'Everything you need to know about GhostClass.',
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          color: theme.colorScheme.onSurface.withValues(
                            alpha: 0.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1),
            const SizedBox(height: 32),

            // --- Section 1: Course Card Explained ---
            const _SectionHeading(
              icon: LucideIcons.bookOpen,
              title: 'Course Card Explained',
            ),
            const SizedBox(height: 16),
            Text(
              'Below is a sample course card with all features shown. Look at the small orange and blue modifiers to see how manual tracking works.',
              style: GoogleFonts.manrope(
                fontSize: 14,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 24),
            const _MockCourseCard(),
            const SizedBox(height: 24),
            _LegendBox(
              title: 'Counts Legend',
              items: [
                _LegendItem(
                  color: Colors.green.shade500,
                  label: 'Green number',
                  description: 'Official present count from EzyGo',
                ),
                _LegendItem(
                  color: Colors.orange.shade500,
                  label: 'Orange +N',
                  description: 'Correction entries (does NOT add to total)',
                ),
                _LegendItem(
                  color: Colors.blue.shade500,
                  label: 'Blue +N',
                  description: 'Extra present classes (adds to total)',
                ),
                _LegendItem(
                  color: Colors.red.shade500,
                  label: 'Red number',
                  description: 'Official absent count from EzyGo',
                ),
                _LegendItem(
                  color: Colors.orange.shade500,
                  label: 'Orange -N',
                  description: 'Correction entries (cancels absences)',
                ),
                _LegendItem(
                  color: Colors.blue.shade500,
                  label: 'Blue +N',
                  description: 'Extra absent classes (adds to total)',
                ),
                const _LegendItem(
                  color: Colors.transparent,
                  label: 'Total + Blue +N',
                  description: 'Official total + extra sessions added',
                  showIcon: false,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _LegendBox(
              title: 'Progress Bar Legend',
              items: [
                const _LegendItem(
                  color: Color(0xFF0EA5E9),
                  label: 'Sky blue bar',
                  description: 'Official attendance percentage',
                ),
                _LegendItem(
                  color: Colors.green.shade500,
                  label: 'Green overlay',
                  description: 'Tracking GAIN (adjusted % is higher)',
                ),
                _LegendItem(
                  color: Colors.red.shade700,
                  label: 'Deep red overlay',
                  description: 'Tracking LOSS (adjusted % is lower)',
                ),
              ],
            ),
            const SizedBox(height: 12),
            _LegendBox(
              title: 'Bunk Calculator',
              items: [
                _LegendItem(
                  color: Colors.blue.shade600,
                  label: 'Safe (Official)',
                  description: 'Based only on data from EzyGo',
                ),
                _LegendItem(
                  color: primary,
                  label: '+ Tracking Data',
                  description: 'Includes your manually tracked sessions',
                ),
              ],
              footer:
                  'Shows how many classes you can safely bunk (green) or must attend (amber) to stay at your target %',
            ),
            const SizedBox(height: 32),

            // --- Section 2: Correction vs Extra ---
            const _SectionHeading(
              icon: LucideIcons.layers,
              title: 'Correction vs Extra',
            ),
            const SizedBox(height: 16),
            _DiffCard(
              title: 'Correction',
              color: Colors.orange.shade600,
              description:
                  'Used when EzyGo marked you absent but you were actually present. It does NOT add to the total class count. Shown in orange on the course card.',
              example:
                  'Example: "You attended class but EzyGo shows Absent. Add a Correction → Present to fix the percentage without affecting the total."',
            ),
            const SizedBox(height: 12),
            _DiffCard(
              title: 'Extra',
              color: Colors.blue.shade600,
              description:
                  "Used for classes EzyGo doesn't know about yet. It ADDS to the total class count. Shown in blue on the course card.",
              example:
                  'Example: "Professor held an extra class that hasn\'t appeared in EzyGo yet. Add an Extra → Present so GhostClass factors it in."',
            ),
            const SizedBox(height: 32),

            // --- Section 3: Attendance Chart Explained ---
            const _SectionHeading(
              icon: LucideIcons.barChart2,
              title: 'Attendance Chart Explained',
            ),
            const SizedBox(height: 16),
            Text(
              'The attendance chart gives you a quick visual overview of all your courses. Below is a sample chart showing all possible combinations.',
              style: GoogleFonts.manrope(
                fontSize: 14,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 24),
            const _MockAttendanceChart(),
            const SizedBox(height: 24),
            _LegendBox(
              title: 'Chart Legend',
              items: [
                _LegendItem(
                  color: Colors.green.shade600,
                  label: 'Official Green',
                  description: 'Above target (safe)',
                ),
                _LegendItem(
                  color: Colors.red.shade600,
                  label: 'Official Red',
                  description: 'Below target (danger)',
                ),
                _LegendItem(
                  isStriped: true,
                  color: Colors.green.shade500,
                  label: 'Striped Green',
                  description: 'Tracking GAIN (overlay)',
                ),
                _LegendItem(
                  isStriped: true,
                  color: Colors.red.shade500,
                  label: 'Striped Red',
                  description: 'Tracking LOSS (overlay)',
                ),
                _LegendItem(
                  isDashed: true,
                  color: Colors.amber.shade500,
                  label: 'Dashed amber line',
                  description: 'Your attendance target (default 75%)',
                ),
              ],
            ),
            const SizedBox(height: 32),

            // --- Section 4: FAQ ---
            const _SectionHeading(
              icon: LucideIcons.messageSquare,
              title: 'Frequently Asked Questions',
            ),
            const SizedBox(height: 16),
            ..._faqs.map(
              (faq) => _buildFaqItem(
                context,
                faq['question']!,
                faq['answer']!,
              ),
            ),
            const SizedBox(height: 32),

            // --- Section 5: Contact ---
            _buildContactCard(context, primary),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildFaqItem(BuildContext context, String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.05),
        ),
      ),
      child: ExpansionTile(
        shape: const RoundedRectangleBorder(),
        collapsedShape: const RoundedRectangleBorder(),
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
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
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
            "Couldn't find what you were looking for? Our team is happy to help. Reach out via the contact page and we'll get back to you as soon as possible.",
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => context.push('/contact'),
            style: ElevatedButton.styleFrom(
              backgroundColor: primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('Contact Us'),
          ),
        ],
      ),
    ).animate().fadeIn(delay: 400.ms).scale(begin: const Offset(0.95, 0.95));
  }

  static const _faqs = [
    {
      'question': 'What is the bunk calculator?',
      'answer':
          'The bunk calculator tells you how many classes you can safely skip — or must attend — to stay at or above your target attendance percentage.',
    },
    {
      'question': 'Why is my attendance percentage different from EzyGo?',
      'answer':
          'GhostClass shows your official data plus any manually tracked corrections or extras. The official percentage is always shown; adjustments are displayed separately.',
    },
    {
      'question': 'Does GhostClass change my real attendance?',
      'answer':
          "No. GhostClass is a read-only calculator. It cannot modify any records in your institution's system.",
    },
    {
      'question': 'Is my EzyGo password stored anywhere?',
      'answer':
          'No. Your password is used once to authenticate and is never persisted. Only the resulting encrypted token is stored.',
    },
    {
      'question': 'What do the striped segments in the attendance chart mean?',
      'answer':
          'Striped segments represent your manually tracked data. A striped green segment shows a gain, while a striped red segment shows a loss.',
    },
    {
      'question': 'Why are some classes missing from my total?',
      'answer':
          "GhostClass intentionally excludes 'Revision' and other non-mandatory class types from the attendance calculation.",
    },
    {
      'question': 'How can I verify if this app is secure?',
      'answer':
          "Visit the 'Build Transparency' section in the GhostClass screen. It displays the build attestation information & provides real-time verification of the app instance against Google Play Integrity.",
    },
    {
      'question': 'How do I set my target attendance?',
      'answer':
          'Update the target percentage from the profile screen. The default is 75%.',
    },
    {
      'question': 'What does "syncing" mean?',
      'answer':
          'GhostClass periodically fetches your latest attendance from EzyGo. If data looks stale, use the refresh option on the dashboard.',
    },
  ];
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
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
}

class _LegendBox extends StatelessWidget {
  const _LegendBox({required this.title, required this.items, this.footer});
  final String title;
  final List<_LegendItem> items;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.9),
            ),
          ),
          const SizedBox(height: 12),
          ...items,
          if (footer != null) ...[
            const SizedBox(height: 8),
            Text(
              footer!,
              style: GoogleFonts.manrope(
                fontSize: 12,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({
    required this.color,
    required this.label,
    required this.description,
    this.isStriped = false,
    this.isDashed = false,
    this.showIcon = true,
  });
  final Color color;
  final String label;
  final String description;
  final bool isStriped;
  final bool isDashed;
  final bool showIcon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showIcon) ...[
            if (isDashed)
              Container(
                width: 16,
                height: 16,
                alignment: Alignment.center,
                child: CustomPaint(
                  size: const Size(16, 2),
                  painter: _DashedLinePainter(color: color),
                ),
              )
            else
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 3),
                decoration: BoxDecoration(
                  color: isStriped ? color.withValues(alpha: 0.2) : color,
                  borderRadius: BorderRadius.circular(2),
                  border: isStriped ? Border.all(color: color) : null,
                ),
                child: isStriped
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: CustomPaint(
                          painter: _StripedPainter(color: color),
                        ),
                      )
                    : null,
              ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: RichText(
              text: TextSpan(
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.6),
                ),
                children: [
                  TextSpan(
                    text: '$label: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.8),
                    ),
                  ),
                  TextSpan(text: description),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DiffCard extends StatelessWidget {
  const _DiffCard({
    required this.title,
    required this.color,
    required this.description,
    this.example,
  });
  final String title;
  final Color color;
  final String description;
  final String? example;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.manrope(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            description,
            style: GoogleFonts.manrope(
              fontSize: 13,
              height: 1.5,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.7),
            ),
          ),
          if (example != null) ...[
            const SizedBox(height: 12),
            Text(
              example!,
              style: GoogleFonts.manrope(
                fontSize: 11,
                fontStyle: FontStyle.italic,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StripedPainter extends CustomPainter {
  _StripedPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5;

    const double step = 4;
    for (var i = -size.height; i < size.width; i += step) {
      canvas.drawLine(
        Offset(i, 0),
        Offset(i + size.height, size.height),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _DashedLinePainter extends CustomPainter {
  _DashedLinePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    const double dashWidth = 3;
    const double dashSpace = 2;
    double startX = 0;
    while (startX < size.width) {
      canvas.drawLine(Offset(startX, 0), Offset(startX + dashWidth, 0), paint);
      startX += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _MockCourseCard extends StatelessWidget {
  const _MockCourseCard();

  @override
  Widget build(BuildContext context) {
    final ghostColors = Theme.of(context).extension<GhostColors>();
    final primary =
        ghostColors?.brandPrimary ?? Theme.of(context).colorScheme.primary;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Data Structures & Algorithms',
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      'CSE301',
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  ),
                ),
                child: Text(
                  '80%',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const _CountText(
                value: '32',
                color: Colors.green,
                label: 'present',
              ),
              const SizedBox(width: 4),
              Text(
                '+2',
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color: Colors.orange,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '+1',
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color: Colors.blue,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              const _CountText(value: '8', color: Colors.red, label: 'absent'),
              const SizedBox(width: 4),
              Text(
                '-2',
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color: Colors.orange,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              _CountText(
                value: '40',
                color: Theme.of(context).colorScheme.onSurface,
                label: 'total',
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Progress Bar
          Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Official 80%',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                  Text(
                    'Tracking 82.5%',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      color: Colors.green,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Container(
                  height: 10,
                  width: double.infinity,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.05),
                  child: Stack(
                    children: [
                      Container(
                        width: 200, // Hardcoded for mock
                        color: const Color(0xFF0EA5E9),
                      ),
                      Positioned(
                        left: 200,
                        child: Container(
                          width: 15,
                          height: 10,
                          color: Colors.green,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(
                child: _BunkPanel(
                  title: 'Safe (Official)',
                  color: Colors.blue,
                  value: '3',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _BunkPanel(
                  title: '+ Tracking Data',
                  color: primary,
                  value: '4 🥳',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CountText extends StatelessWidget {
  const _CountText({
    required this.value,
    required this.color,
    required this.label,
  });
  final String value;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          value,
          style: GoogleFonts.manrope(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: color,
          ),
        ),
        const SizedBox(width: 2),
        Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 11,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}

class _BunkPanel extends StatelessWidget {
  const _BunkPanel({
    required this.title,
    required this.color,
    required this.value,
  });
  final String title;
  final Color color;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.manrope(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Can bunk',
            style: GoogleFonts.manrope(
              fontSize: 10,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.manrope(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: Colors.green,
            ),
          ),
        ],
      ),
    );
  }
}

class _MockAttendanceChart extends StatelessWidget {
  const _MockAttendanceChart();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 220,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
      ),
      child: Stack(
        children: [
          // Target line
          Positioned(
            top: 50,
            left: 0,
            right: 0,
            child: Stack(
              alignment: Alignment.centerRight,
              children: [
                CustomPaint(
                  size: const Size(double.infinity, 2),
                  painter: _DashedLinePainter(
                    color: Colors.amber.shade400.withValues(alpha: 0.7),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(right: 32),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade700,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'Target: 75%',
                      style: GoogleFonts.manrope(
                        fontSize: 8,
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Bars
          const Positioned.fill(
            top: 20,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _MockBar(code: 'CSE301', official: 120, color: Colors.green),
                _MockBar(code: 'MAT201', official: 80, color: Colors.red),
                _MockBar(
                  code: 'PHY101',
                  official: 110,
                  color: Colors.green,
                  adjusted: 130,
                ),
                _MockBar(
                  code: 'ENG401',
                  official: 90,
                  color: Colors.red,
                  adjusted: 75,
                  isGain: false,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MockBar extends StatelessWidget {
  const _MockBar({
    required this.code,
    required this.official,
    required this.color,
    this.adjusted,
    this.isGain = true,
  });
  final String code;
  final double official;
  final Color color;
  final double? adjusted;
  final bool isGain;

  @override
  Widget build(BuildContext context) {
    final overlayHeight = adjusted != null ? (adjusted! - official).abs() : 0.0;
    final totalHeight = adjusted != null
        ? (isGain ? adjusted! : official)
        : official;

    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Container(
          width: 32,
          height: totalHeight,
          decoration: BoxDecoration(
            color: adjusted != null
                ? (isGain
                      ? color.withValues(alpha: 0.1)
                      : Colors.red.withValues(alpha: 0.1))
                : color,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
            border: adjusted != null
                ? Border.all(color: isGain ? Colors.green : Colors.red)
                : null,
          ),
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              // Base bar
              Container(
                height: isGain ? official : (adjusted ?? official),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(6),
                  ),
                ),
              ),
              // Striped overlay
              if (adjusted != null)
                Positioned(
                  bottom: isGain ? official : adjusted,
                  left: 0,
                  right: 0,
                  height: overlayHeight,
                  child: CustomPaint(
                    painter: _StripedPainter(
                      color: isGain ? Colors.green : Colors.red,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          code,
          style: GoogleFonts.manrope(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}
