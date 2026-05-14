import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:google_fonts/google_fonts.dart';

class StaticPageScreen extends StatelessWidget {
  const StaticPageScreen({
    required this.title,
    super.key,
    this.body = 'Coming soon',
  });
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          title,
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
      ),
      body: Markdown(
        data: body,
        physics: const BouncingScrollPhysics(),
        styleSheet: MarkdownStyleSheet(
          p: GoogleFonts.manrope(
            fontSize: 15,
            height: 1.6,
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.8),
          ),
          h1: GoogleFonts.manrope(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: Theme.of(context).colorScheme.onSurface,
          ),
          h2: GoogleFonts.manrope(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.onSurface,
          ),
          code: GoogleFonts.firaCode(
            backgroundColor: Theme.of(
              context,
            ).colorScheme.surfaceContainerHighest,
            fontSize: 13,
          ),
          blockquote: GoogleFonts.manrope(
            fontStyle: FontStyle.italic,
            color: Theme.of(context).colorScheme.primary,
          ),
          blockquoteDecoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: Theme.of(context).colorScheme.primary,
                width: 4,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
