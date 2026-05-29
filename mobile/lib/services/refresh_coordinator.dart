import 'package:flutter/foundation.dart';
import 'package:ghostclass/services/logger.dart';

Future<void> runUnifiedPullToRefresh({
  required VoidCallback invalidateNotifications,
  required Future<void> Function() refreshProfile,
  required Future<void> Function() refreshData,
  Future<void> Function()? syncCron,
  String logLabel = 'PullToRefresh',
}) async {
  invalidateNotifications();
  await refreshProfile();

  final syncFuture = syncCron == null
      ? Future<void>.value()
      : () async {
          try {
            await syncCron();
          } on Object catch (e, st) {
            AppLogger.e('$logLabel: cron sync failed', e, st);
            rethrow;
          }
        }();

  await Future.wait([
    syncFuture,
    refreshData(),
  ]);
}
