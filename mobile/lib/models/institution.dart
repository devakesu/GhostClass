class Institution {
  final int id;
  final String name;
  final String role;

  const Institution({required this.id, required this.name, required this.role});

  factory Institution.fromJson(Map<String, dynamic> json) {
    return Institution(
      id: _toInt(json['id']) ?? 0,
      name: (json['name'] ?? 'Unknown Institution').toString(),
      role: (json['role'] ?? json['institution_role'] ?? 'institution')
          .toString(),
    );
  }
}

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
