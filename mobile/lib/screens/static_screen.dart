import 'package:flutter/material.dart';

class StaticPageScreen extends StatelessWidget {
  final String title;
  final String body;

  const StaticPageScreen({
    super.key,
    required this.title,
    this.body = 'Coming soon',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(padding: const EdgeInsets.all(24), child: Text(body)),
      ),
    );
  }
}
