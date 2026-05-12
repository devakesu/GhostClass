import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/logic/support_helper.dart';

void main() {
  group('SupportHelper', () {
    test('persistenceMessage returns non-empty string', () {
      expect(SupportHelper.persistenceMessage.isNotEmpty, true);
      expect(
        SupportHelper.persistenceMessage,
        'If this issue persists even after some time and repeated attempts, please contact us.',
      );
    });

    test('contactViaEmail constructs email uri and catches missing plugin exception gracefully', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      await SupportHelper.contactViaEmail(subject: 'Test Subject', customBody: 'Test Body');
    });
  });
}
