import { describe, it, expect } from 'vitest';
import { 
  isLegacyRemark, 
  isPositive, 
  isAbsent, 
  getOfficialSessionRaw, 
  getReconciledStats,
  ATTENDANCE_STATUS
} from '../attendance-reconciliation';
import { TrackAttendance } from '@/types';

describe('attendance-reconciliation logic', () => {
  describe('isLegacyRemark', () => {
    it('returns true for null/undefined/empty', () => {
      expect(isLegacyRemark(null)).toBe(true);
      expect(isLegacyRemark(undefined)).toBe(true);
      expect(isLegacyRemark('')).toBe(true);
    });

    it('returns true for placeholders', () => {
      expect(isLegacyRemark('Duty Leave')).toBe(true);
      expect(isLegacyRemark('Self-Marked: Present')).toBe(true);
      expect(isLegacyRemark('Self-Marked: Something')).toBe(true);
    });

    it('returns false for real remarks', () => {
      expect(isLegacyRemark('Participated in hackathon')).toBe(false);
    });
  });

  describe('isPositive and isAbsent', () => {
    it('identifies positive statuses', () => {
      expect(isPositive(ATTENDANCE_STATUS.PRESENT)).toBe(true);
      expect(isPositive(ATTENDANCE_STATUS.DUTY_LEAVE)).toBe(true);
      expect(isPositive(ATTENDANCE_STATUS.ABSENT)).toBe(false);
    });

    it('identifies absent status', () => {
      expect(isAbsent(ATTENDANCE_STATUS.ABSENT)).toBe(true);
      expect(isAbsent(ATTENDANCE_STATUS.PRESENT)).toBe(false);
    });
  });

  describe('getOfficialSessionRaw', () => {
    it('returns session if present', () => {
      expect(getOfficialSessionRaw({ session: 'S1' }, 'K1')).toBe('S1');
    });

    it('returns sessionKey as fallback', () => {
      expect(getOfficialSessionRaw(null, 'K1')).toBe('K1');
      expect(getOfficialSessionRaw({ session: '' }, 'K1')).toBe('K1');
    });
  });

  describe('getReconciledStats', () => {
    const courseId = 'CS101';
    const officialAggregate = { present: 10, absent: 2, total: 12 };

    it('uses fallback when officialSessions is empty', () => {
      const sessions: any[] = [];
      const stats = getReconciledStats(courseId, officialAggregate, sessions, []);
      expect(stats.realPresent).toBe(10);
      expect(stats.realTotal).toBe(12);
      expect(stats.finalPercentage).toBe(83.33);
    });

    it('calculates stats correctly from official sessions', () => {
      const sessions: any[] = [
        { course: 'CS101', date: '2023-01-01', session: 1, attendance: 110 },
        { course: 'CS101', date: '2023-01-01', session: 2, attendance: 111 },
        { course: 'CS101', date: '2023-01-01', session: 3, attendance: 225 }, // DL
        { course: 'OTHER', date: '2023-01-01', session: 4, attendance: 110 }, // Other course
        { course: 'CS101', date: '2023-01-01', session: 5, attendance: 110, class_type: 'Revision' }, // Revision
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, []);
      expect(stats.realPresent).toBe(2); // 110 and 225
      expect(stats.realTotal).toBe(3);   // 110, 111, 225
      expect(stats.realDL).toBe(1);
    });

    it('reconciles tracker data (corrections)', () => {
      const sessions: any[] = [
        { course: 'CS101', date: '2023-01-01', session: 1, attendance: 111 }, // Official Absent
      ];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 110, // Marked as Present in tracker
          status: 'sync',
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.realPresent).toBe(0);
      expect(stats.correctionPresent).toBe(1);
      expect(stats.savedAbsent).toBe(1);
      expect(stats.finalPresent).toBe(1);
    });

    it('reconciles tracker data (extras present)', () => {
      const sessions: any[] = [];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 110, 
          status: 'extra', // Truly extra
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.realPresent).toBe(10); // From fallback
      expect(stats.extraPresent).toBe(1);
      expect(stats.extrasCount).toBe(1);
      expect(stats.finalTotal).toBe(13);
      expect(stats.finalPresent).toBe(11);
    });

    it('reconciles tracker data (extras absent)', () => {
      const sessions: any[] = [];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 111, // Absent
          status: 'extra', 
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.extraAbsent).toBe(1);
      expect(stats.extrasCount).toBe(1);
      expect(stats.finalTotal).toBe(13);
      expect(stats.finalPresent).toBe(10); // From fallback
    });

    it('handles OTHER_LEAVE and extraDL', () => {
      const sessions: any[] = [
        { course: 'CS101', date: '2023-01-01', session: 1, attendance: 112 }, // OTHER_LEAVE
      ];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-02', 
          session: 1, 
          attendance: 225, // DL
          status: 'extra',
          created_at: '',
          user_id: ''
        } as any,
        { 
          id: 't2', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 'INVALID', // Should be ignored
          status: 'sync',
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.realOther).toBe(1);
      expect(stats.extraDL).toBe(1);
      expect(stats.extraPresent).toBe(1); // DL is positive
    });

    it('handles correctionDL', () => {
      const sessions: any[] = [
        { course: 'CS101', date: '2023-01-01', session: 1, attendance: 111 }, // Official Absent
      ];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 225, // DL correction
          status: 'sync',
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.correctionDL).toBe(1);
      expect(stats.correctionPresent).toBe(1);
    });

    it('handles offPos return and offPos false/trackPos false', () => {
      const sessions: any[] = [
        { course: 'CS101', date: '2023-01-01', session: 1, attendance: 110 }, // Official Present
        { course: 'CS101', date: '2023-01-01', session: 2, attendance: 111 }, // Official Absent
      ];
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 111, // Ignored because offPos is true
          status: 'sync',
          created_at: '',
          user_id: ''
        } as any,
        { 
          id: 't2', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 2, 
          attendance: 111, // Both absent
          status: 'sync',
          created_at: '',
          user_id: ''
        } as any,
      ];

      const stats = getReconciledStats(courseId, officialAggregate, sessions, tracking.filter(t => t.course === courseId));
      expect(stats.correctionPresent).toBe(0);
    });

    it('handles zero totals for percentages', () => {
      const stats = getReconciledStats(courseId, { present: 0, absent: 0, total: 0 }, [], []);
      expect(stats.officialPercentage).toBe(0);
      expect(stats.finalPercentage).toBe(0);
    });

    it('handles undefined trackingData and missing official for sync status', () => {
      // 1. undefined trackingData
      const stats1 = getReconciledStats(courseId, officialAggregate, [], undefined);
      expect(stats1.finalPresent).toBe(10);

      // 2. sync status but no official record (implicit else of else if)
      const tracking: TrackAttendance[] = [
        { 
          id: 't1', 
          course: 'CS101', 
          date: '2023-01-01', 
          session: 1, 
          attendance: 110, 
          status: 'sync', // NOT extra, but no official record
          created_at: '',
          user_id: ''
        } as any,
      ];
      const stats2 = getReconciledStats(courseId, officialAggregate, [], tracking.filter(t => t.course === courseId));
      expect(stats2.correctionPresent).toBe(0);
      expect(stats2.extraPresent).toBe(0);
    });
  });
});
