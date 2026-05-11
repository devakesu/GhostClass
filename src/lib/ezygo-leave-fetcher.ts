import 'server-only';
import { fetchEzygoData } from './ezygo-batch-fetcher';
import { logger } from './logger';

export async function fetchLeaveData(token: string) {
  // Fail-fast on any EzyGo failure — do not return partial data
  // If any required endpoint fails, propagate the error immediately
  const [
    studentLeaves,
    userSubgroups,
    attendanceTypes,
    sessions,
    events,
    mandatoryEventCoordinator,
    leaveApprovalLevel,
  ] = await Promise.all([
    fetchEzygoData<any>('/studentleaves', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch studentleaves', { error: String(e) });
        throw new Error(`Failed to fetch leave data: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/usersubgroups', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch usersubgroups', { error: String(e) });
        throw new Error(`Failed to fetch usersubgroups: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/attendancetypes', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch attendancetypes', { error: String(e) });
        throw new Error(`Failed to fetch attendancetypes: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/sessions', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch sessions', { error: String(e) });
        throw new Error(`Failed to fetch sessions: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/events', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch events', { error: String(e) });
        throw new Error(`Failed to fetch events: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/institution/setting/mandatory_event_coordinator', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch mandatory_event_coordinator', { error: String(e) });
        throw new Error(`Failed to fetch mandatory_event_coordinator: ${e instanceof Error ? e.message : String(e)}`);
    }),
    fetchEzygoData<any>('/institution/setting/student_leave_approval_level', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch student_leave_approval_level', { error: String(e) });
        throw new Error(`Failed to fetch student_leave_approval_level: ${e instanceof Error ? e.message : String(e)}`);
    })
  ]);

  return {
    studentLeaves,
    userSubgroups,
    attendanceTypes,
    sessions,
    events,
    mandatoryEventCoordinator,
    leaveApprovalLevel,
  };
}

export async function fetchLeaveAttendanceDetails(token: string, startDate: string, uptoDate: string) {
  // Fail-fast: propagate errors instead of returning null
  // Partial/missing leave data can lead to incorrect leave calculations
  return fetchEzygoData<any>('/attendancereports/student/detailed', token, 'POST', {
    start_date: startDate,
    upto_date: uptoDate,
    from_student_leave_application: true
  }).catch(e => {
      logger.error('[EzyGo] Failed to fetch leave attendance details', { error: String(e), startDate, uptoDate });
      throw new Error(`Failed to fetch leave attendance details: ${e instanceof Error ? e.message : String(e)}`);
  });
}
