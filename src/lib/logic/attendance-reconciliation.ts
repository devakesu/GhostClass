import { TrackAttendance } from "@/types";
import { generateSlotKey } from "../utils";

interface RawSessionData {
  session?: string | number | null;
}

import { 
  ATTENDANCE_STATUS, 
  isPositiveStatus as isPositive, 
  isAbsentStatus as isAbsent,
  DUTY_LEAVE_PLACEHOLDER_REMARKS 
} from "../constants/ezygo";

export const isLegacyRemark = (remark: string | null | undefined): boolean => {
  if (!remark) return true;
  const trimmed = remark.trim();
  return DUTY_LEAVE_PLACEHOLDER_REMARKS.has(trimmed) || trimmed.startsWith("Self-Marked:");
};

export { isPositive, isAbsent, ATTENDANCE_STATUS };

export const getOfficialSessionRaw = (
  session: RawSessionData | null | undefined, 
  sessionKey: string | number
): string | number => {
  if (session && session.session != null && session.session !== "") {
    return session.session;
  }
  return sessionKey;
};

export interface ReconciledStats {
  realPresent: number;
  realTotal: number;
  realAbsent: number;
  realDL: number;
  realOther: number;
  
  finalPresent: number;
  finalTotal: number;
  
  correctionPresent: number; 
  savedAbsent: number;       
  correctionDL: number;      
  
  extraPresent: number;      
  extraAbsent: number;       
  extraDL: number;
  extrasCount: number;       
  
  officialPercentage: number;
  finalPercentage: number;
}

interface OfficialSession {
  course: string | number;
  date: string;
  session: string | number;
  attendance: string | number;
  class_type?: string;
}

interface ReconciliationAccumulator {
  realPresent: number;
  realTotal: number;
  realAbsent: number;
  realDL: number;
  realOther: number;
  correctionPresent: number;
  savedAbsent: number;
  correctionDL: number;
  extraPresent: number;
  extraAbsent: number;
  extraDL: number;
  finalPresent: number;
  finalTotal: number;
  extrasCount: number;
}

function processOfficialSessions(
  courseId: string,
  officialSessions: OfficialSession[],
  officialMap: Map<string, number>,
  stats: ReconciliationAccumulator
) {
  for (const session of officialSessions) {
    if (!session || session.class_type === "Revision") continue;
    if (String(session.course) !== String(courseId)) continue;

    const key = generateSlotKey(courseId, session.date, session.session);
    const status = Number(session.attendance);
    officialMap.set(key, status);

    stats.realTotal++;
    if (isPositive(status)) {
      stats.realPresent++;
    } else {
      stats.realAbsent++;
    }
    if (status === ATTENDANCE_STATUS.DUTY_LEAVE) {
      stats.realDL++;
    }
    if (status === ATTENDANCE_STATUS.OTHER_LEAVE) {
      stats.realOther++;
    }
  }
}

function handleExtraTrack(
  trackPos: boolean,
  trackDL: boolean,
  stats: ReconciliationAccumulator
) {
  stats.extrasCount++;
  if (trackPos) {
    stats.extraPresent++;
  } else {
    stats.extraAbsent++;
  }
  if (trackDL) {
    stats.extraDL++;
  }
}

function handleCorrectionTrack(
  trackPos: boolean,
  trackDL: boolean,
  offPos: boolean,
  offDL: boolean,
  stats: ReconciliationAccumulator
) {
  if (!offPos && trackPos) {
    stats.correctionPresent++;
    stats.savedAbsent++;
  }
  if (!offDL && trackDL) {
    stats.correctionDL++;
  }
}

function processCourseTracks(
  courseId: string,
  courseTracks: TrackAttendance[],
  officialMap: Map<string, number>,
  stats: ReconciliationAccumulator
) {
  for (const item of courseTracks) {
    if (!item) continue;
    const trackStatus = Number(item.attendance);
    if (!Number.isFinite(trackStatus)) continue;

    const key = generateSlotKey(courseId, item.date, item.session);
    const officialStatus = officialMap.get(key);

    const trackPos = isPositive(trackStatus);
    const trackDL = trackStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

    if (item.status === "extra" && officialStatus === undefined) {
      handleExtraTrack(trackPos, trackDL, stats);
    } else if (officialStatus !== undefined) {
      const offPos = isPositive(officialStatus);
      const offDL = officialStatus === ATTENDANCE_STATUS.DUTY_LEAVE;
      handleCorrectionTrack(trackPos, trackDL, offPos, offDL, stats);
    }
  }
}

export function getReconciledStats(
  courseId: string,
  officialAggregate: { present: number; absent: number; total: number },
  officialSessions: OfficialSession[] | undefined,
  courseTracks: TrackAttendance[] | undefined
): ReconciledStats {
  const stats: ReconciliationAccumulator = {
    realPresent: 0, realTotal: 0, realAbsent: 0, realDL: 0, realOther: 0,
    correctionPresent: 0, savedAbsent: 0, correctionDL: 0,
    extraPresent: 0, extraAbsent: 0, extraDL: 0,
    finalPresent: 0, finalTotal: 0, extrasCount: 0
  };

  const officialMap = new Map<string, number>();

  if (officialSessions && officialSessions.length > 0) {
    processOfficialSessions(courseId, officialSessions, officialMap, stats);
  } else {
    stats.realPresent = officialAggregate.present;
    stats.realTotal = officialAggregate.total;
    stats.realAbsent = officialAggregate.absent;
  }

  if (courseTracks && courseTracks.length > 0) {
    processCourseTracks(courseId, courseTracks, officialMap, stats);
  }

  stats.finalPresent = stats.realPresent + stats.correctionPresent + stats.extraPresent;
  stats.finalTotal   = stats.realTotal   + stats.extrasCount;

  const officialPct = stats.realTotal > 0 ? (stats.realPresent / stats.realTotal) * 100 : 0;
  const finalPct = stats.finalTotal > 0 ? (stats.finalPresent / stats.finalTotal) * 100 : 0;

  return {
    ...stats,
    officialPercentage: parseFloat(officialPct.toFixed(2)),
    finalPercentage: parseFloat(finalPct.toFixed(2))
  };
}
