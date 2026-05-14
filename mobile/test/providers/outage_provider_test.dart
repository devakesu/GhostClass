import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/providers/outage_provider.dart';

void main() {
  test('builds false and updates state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(outageProvider), false);

    container.read(outageProvider.notifier).update(true);

    expect(container.read(outageProvider), true);
  });
}
