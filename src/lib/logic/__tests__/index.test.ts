import { describe, it, expect } from 'vitest';
import * as logic from '../index';

describe('Logic Barrel Index', () => {
  it('exports expected functions and constants', () => {
    expect(logic.ATTENDANCE_STATUS).toBeDefined();
    expect(logic.calculateAttendance).toBeDefined();
    expect(logic.calculateCurrentAcademicInfo).toBeDefined();
    expect(logic.getReconciledStats).toBeDefined();
    expect(logic.isPositive).toBeDefined();
    expect(logic.isAbsent).toBeDefined();
  });
});
