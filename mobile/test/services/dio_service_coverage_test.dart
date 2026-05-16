import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/services/dio_service.dart';

void main() {
  group('DioService Lint Cleanup', () {
    test('Service can be initialized in a ProviderContainer', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final service = container.read(dioServiceProvider);
      expect(service, isA<DioService>());
    });
  });
}
