class EncryptedValue {
  final String value;

  const EncryptedValue._(this.value);

  factory EncryptedValue.fromPlaintext(String value) => EncryptedValue._(value);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EncryptedValue &&
          runtimeType == other.runtimeType &&
          value == other.value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'EncryptedValue(****)';
}
