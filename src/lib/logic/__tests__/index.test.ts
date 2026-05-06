import { describe, it, expect } from 'vitest';
import * as logic from '../index';

describe('logic barrel', () => {
  it('exports all expected members', () => {
    expect(logic.ATTENDANCE_STATUS).toBeDefined();
    expect(logic.isPositive).toBeDefined();
    expect(logic.isAbsent).toBeDefined();
    expect(logic.getOfficialSessionRaw).toBeDefined();
    expect(logic.getReconciledStats).toBeDefined();
    expect(logic.calculateAttendance).toBeDefined();
    expect(logic.calculateCurrentAcademicInfo).toBeDefined();
  });
});
