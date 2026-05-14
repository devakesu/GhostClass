class Institution {
  const Institution({required this.id, required this.name, required this.role});

  factory Institution.fromJson(Map<String, dynamic> json) {
    // Handle nested API structure: { "id": 1, "institution": { "name": "..." }, "institution_role": { "name": "..." } }
    final institution = json['institution'] as Map<String, dynamic>?;
    final roleObj = json['institution_role'] as Map<String, dynamic>?;

    return Institution(
      id: _toInt(json['id']) ?? 0,
      name: (institution?['name'] ?? json['name'] ?? 'Unknown Institution')
          .toString(),
      role: (roleObj?['name'] ?? json['role'] ?? 'institution').toString(),
    );
  }
  final int id;
  final String name;
  final String role;
}

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
