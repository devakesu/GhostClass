import 'package:flutter/foundation.dart';
import 'package:ghostclass/services/logger.dart';

Future<void> runUnifiedPullToRefresh({
  required VoidCallback invalidateNotifications,
  required Future<void> Function() refreshProfile,
  required Future<void> Function() refreshData,
  Future<dynamic> Function()? syncCron,
  void Function(dynamic result)? onSyncResult,
  String logLabel = 'PullToRefresh',
}) async {
  invalidateNotifications();
  await refreshProfile();

  if (syncCron != null) {
    try {
      final result = await syncCron();
      if (onSyncResult != null) {
        onSyncResult(result);
      }
    } on Object catch (e, st) {
      AppLogger.e('$logLabel: cron sync failed', e, st);
    }
  }

  // Invalidate notifications again after cron sync completes so that any
  // new conflict/attendance notifications written to the database during sync
  // are picked up immediately by refreshData() or active UI listeners.
  invalidateNotifications();
  await refreshData();
}
