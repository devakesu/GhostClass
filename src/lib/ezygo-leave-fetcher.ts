import 'server-only';
import { fetchEzygoData } from './ezygo-batch-fetcher';
import { logger } from './logger';

export async function fetchLeaveData(token: string) {
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
        return { student_leaves: [], student_leave_sessions: [], admin: [], hod: [], advisor: [], counts: [] };
    }),
    fetchEzygoData<any>('/usersubgroups', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch usersubgroups', { error: String(e) });
        return [];
    }),
    fetchEzygoData<any>('/attendancetypes', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch attendancetypes', { error: String(e) });
        return [];
    }),
    fetchEzygoData<any>('/sessions', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch sessions', { error: String(e) });
        return [];
    }),
    fetchEzygoData<any>('/events', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch events', { error: String(e) });
        return [];
    }),
    fetchEzygoData<any>('/institution/setting/mandatory_event_coordinator', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch mandatory_event_coordinator', { error: String(e) });
        return [];
    }),
    fetchEzygoData<any>('/institution/setting/student_leave_approval_level', token).catch(e => {
        logger.error('[EzyGo] Failed to fetch student_leave_approval_level', { error: String(e) });
        return 2;
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
  return fetchEzygoData<any>('/attendancereports/student/detailed', token, 'POST', {
    start_date: startDate,
    upto_date: uptoDate,
    from_student_leave_application: true
  }).catch(e => {
      logger.error('[EzyGo] Failed to fetch leave attendance details', { error: String(e), startDate, uptoDate });
      return null;
  });
}
