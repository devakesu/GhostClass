import { useMemo } from "react";
import { generateSlotKey, normalizeCourseCode } from "@/lib/utils";
import {
  isPositive,
  getOfficialSessionRaw,
  ATTENDANCE_STATUS,
} from "@/lib/logic/attendance-reconciliation";
import { AttendanceReport, TrackAttendance } from "@/types";

interface UseDashboardStatsOptions {
  coursesData: { courses?: Record<string, { code?: string }> } | undefined;
  attendanceData: AttendanceReport | undefined;
  trackingData: TrackAttendance[] | undefined;
  classCourses: Array<{ course_code?: string }> | undefined;
  disabledCodes: Set<string>;
  selectedSemester: string | null;
  selectedYear: string | null;
}

interface CourseStat {
  present: number;
  total: number;
  officialPresent: number;
  officialTotal: number;
  correctionPresent: number;
  extraPresent: number;
  extrasCount: number;
  extraAbsent: number;
}

function createEmptyCourseStat(): CourseStat {
  return {
    present: 0,
    total: 0,
    officialPresent: 0,
    officialTotal: 0,
    correctionPresent: 0,
    extraPresent: 0,
    extrasCount: 0,
    extraAbsent: 0,
  };
}

interface OfficialAccumulator {
  present: number;
  absent: number;
  dl: number;
  total: number;
}

interface ModifierAccumulator {
  correctionPresent: number;
  savedAbsent: number;
  correctionDL: number;
  extraPresent: number;
  extraAbsent: number;
  extraDL: number;
}

interface OfficialSessionPayload {
  course?: string | number;
  attendance?: string | number;
  class_type?: string;
  session?: string | number | null;
}

function createCodeResolver(coursesData: UseDashboardStatsOptions["coursesData"]) {
  return (id: string): string => {
    const courses = coursesData?.courses;
    if (courses && Object.prototype.hasOwnProperty.call(courses, id)) {
      /* eslint-disable-next-line security/detect-object-injection */
      const target = courses[id];
      const codeStr = target?.code || id;
      return normalizeCourseCode(codeStr);
    }
    return normalizeCourseCode(id);
  };
}

function addCourseStatIfMissing(map: Map<string, CourseStat>, key: string) {
  if (key && !map.has(key)) {
    map.set(key, createEmptyCourseStat());
  }
}

function populateClassCourseStats(
  map: Map<string, CourseStat>,
  classCourses: UseDashboardStatsOptions["classCourses"]
) {
  if (!classCourses) return;

  for (const cc of classCourses) {
    const key = cc.course_code ? normalizeCourseCode(cc.course_code) : "";
    addCourseStatIfMissing(map, key);
  }
}

function initCourseStatsMap(
  coursesData: UseDashboardStatsOptions["coursesData"],
  classCourses: UseDashboardStatsOptions["classCourses"],
  resolveCode: (id: string) => string
): Map<string, CourseStat> {
  const map = new Map<string, CourseStat>();

  // Populate from catalog courses (resolveCode to normalize)
  if (coursesData?.courses) {
    for (const id of Object.keys(coursesData.courses)) {
      const key = resolveCode(id);
      addCourseStatIfMissing(map, key);
    }
  }

  // Populate from class courses (already contain course_code strings)
  populateClassCourseStats(map, classCourses);

  return map;
}

function processSingleSession(
  session: OfficialSessionPayload | null | undefined,
  sessionKey: string,
  dateStr: string,
  courseStatsMap: Map<string, CourseStat>,
  officialMap: Map<string, number>,
  normalizedDisabledCodes: Set<string>,
  officialStats: OfficialAccumulator,
  resolveCode: (id: string) => string
) {
  if (!session || !session.course || session.class_type === "Revision") return;

  const cid = String(session.course);
  const status = Number(session.attendance);
  const rawSession = getOfficialSessionRaw(session, sessionKey);
  const statsKey = resolveCode(cid);

  const slotKey = generateSlotKey(statsKey, dateStr, rawSession);
  officialMap.set(slotKey, status);

  const cStat = courseStatsMap.get(statsKey);
  if (!cStat) return;

  if ([110, 111, 225, 112].includes(status)) {
    cStat.total++;
    cStat.officialTotal++;
    if (isPositive(status)) {
      cStat.present++;
      cStat.officialPresent++;
    }
  }

  if (!normalizedDisabledCodes.has(statsKey)) {
    if (isPositive(status)) {
      officialStats.present++;
      officialStats.total++;
      if (status === ATTENDANCE_STATUS.DUTY_LEAVE) officialStats.dl++;
    } else if (status === ATTENDANCE_STATUS.ABSENT) {
      officialStats.absent++;
      officialStats.total++;
    }
  }
}

function processOfficialAttendance(
  attendanceData: AttendanceReport | undefined,
  courseStatsMap: Map<string, CourseStat>,
  officialMap: Map<string, number>,
  normalizedDisabledCodes: Set<string>,
  officialStats: OfficialAccumulator,
  resolveCode: (id: string) => string
) {
  if (!attendanceData?.studentAttendanceData) return;

  for (const [dateStr, dateData] of Object.entries(attendanceData.studentAttendanceData)) {
    if (!dateData) continue;
    for (const [sessionKey, session] of Object.entries(dateData)) {
      processSingleSession(
        session as OfficialSessionPayload | null | undefined,
        sessionKey,
        dateStr,
        courseStatsMap,
        officialMap,
        normalizedDisabledCodes,
        officialStats,
        resolveCode
      );
    }
  }
}

function updateCourseStatForTrack(
  cStat: CourseStat,
  isTrulyExtra: boolean,
  trackPos: boolean,
  offPos: boolean
) {
  if (isTrulyExtra) {
    cStat.total++;
    cStat.extrasCount++;
    if (trackPos) {
      cStat.present++;
      cStat.extraPresent++;
    } else {
      cStat.extraAbsent++;
    }
  } else {
    if (!offPos && trackPos) {
      cStat.present++;
      cStat.correctionPresent++;
    } else if (offPos && !trackPos) {
      cStat.present = Math.max(0, cStat.present - 1);
      cStat.correctionPresent = Math.max(0, cStat.correctionPresent - 1);
    }
  }
}

function updateModifierStatsForTrack(
  modifierStats: ModifierAccumulator,
  isTrulyExtra: boolean,
  trackPos: boolean,
  trackDL: boolean,
  offPos: boolean,
  offDL: boolean
) {
  if (isTrulyExtra) {
    if (trackPos) {
      modifierStats.extraPresent++;
    } else {
      modifierStats.extraAbsent++;
    }
    if (trackDL) {
      modifierStats.extraDL++;
    }
  } else {
    if (!offPos && trackPos) {
      modifierStats.correctionPresent++;
      modifierStats.savedAbsent++;
    }
    if (!offDL && trackDL) {
      modifierStats.correctionDL++;
    }
  }
}

function processSingleTrackItem(
  item: TrackAttendance,
  selectedSemester: string | null,
  selectedYear: string | null,
  courseStatsMap: Map<string, CourseStat>,
  officialMap: Map<string, number>,
  normalizedDisabledCodes: Set<string>,
  modifierStats: ModifierAccumulator,
  resolveCode: (id: string) => string
) {
  if (!item || item.semester !== selectedSemester || item.year !== selectedYear || !item.course) {
    return;
  }

  const statsKey = resolveCode(String(item.course));
  const slotKey = generateSlotKey(statsKey, item.date, item.session);
  const officialStatus = officialMap.get(slotKey);
  const isTrulyExtra = item.status === "extra" && officialStatus === undefined;

  const trackAttendanceNum = Number(item.attendance);
  const trackPos = isPositive(trackAttendanceNum);
  const trackDL = trackAttendanceNum === ATTENDANCE_STATUS.DUTY_LEAVE;
  const offPos = officialStatus !== undefined ? isPositive(officialStatus) : false;
  const offDL = officialStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

  const cStat = courseStatsMap.get(statsKey);
  if (cStat) {
    updateCourseStatForTrack(cStat, isTrulyExtra, trackPos, offPos);
  }

  if (!normalizedDisabledCodes.has(statsKey)) {
    updateModifierStatsForTrack(modifierStats, isTrulyExtra, trackPos, trackDL, offPos, offDL);
  }
}

function processTrackingData(
  trackingData: TrackAttendance[] | undefined,
  selectedSemester: string | null,
  selectedYear: string | null,
  courseStatsMap: Map<string, CourseStat>,
  officialMap: Map<string, number>,
  normalizedDisabledCodes: Set<string>,
  modifierStats: ModifierAccumulator,
  resolveCode: (id: string) => string
) {
  if (!trackingData) return;
  for (const item of trackingData) {
    processSingleTrackItem(
      item,
      selectedSemester,
      selectedYear,
      courseStatsMap,
      officialMap,
      normalizedDisabledCodes,
      modifierStats,
      resolveCode
    );
  }
}

export function useDashboardStats({
  coursesData,
  attendanceData,
  trackingData,
  classCourses,
  disabledCodes,
  selectedSemester,
  selectedYear,
}: UseDashboardStatsOptions) {
  return useMemo(() => {
    const resolveCode = createCodeResolver(coursesData);

    const normalizedDisabledCodes = new Set(
      Array.from(disabledCodes).map((c) => normalizeCourseCode(c))
    );

    const officialStats: OfficialAccumulator = { present: 0, absent: 0, dl: 0, total: 0 };
    const modifierStats: ModifierAccumulator = {
      correctionPresent: 0,
      savedAbsent: 0,
      correctionDL: 0,
      extraPresent: 0,
      extraAbsent: 0,
      extraDL: 0,
    };

    const courseStatsMap = initCourseStatsMap(coursesData, classCourses, resolveCode);
    const officialMap = new Map<string, number>();

    processOfficialAttendance(
      attendanceData,
      courseStatsMap,
      officialMap,
      normalizedDisabledCodes,
      officialStats,
      resolveCode
    );

    processTrackingData(
      trackingData,
      selectedSemester,
      selectedYear,
      courseStatsMap,
      officialMap,
      normalizedDisabledCodes,
      modifierStats,
      resolveCode
    );

    const finalTotal =
      officialStats.total +
      modifierStats.extraPresent +
      modifierStats.extraAbsent;
    const finalPresent =
      officialStats.present +
      modifierStats.correctionPresent +
      modifierStats.extraPresent;

    const percentage = finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0;
    const officialPercentage =
      officialStats.total > 0
        ? (officialStats.present / officialStats.total) * 100
        : 0;

    const formatPct = (val: number) =>
      val % 1 === 0 ? Math.round(val) : parseFloat(val.toFixed(2));

    const courseStats = Object.fromEntries(courseStatsMap);

    return {
      percentage: formatPct(percentage),
      rawPercentage: percentage,
      officialPercentage: formatPct(officialPercentage),
      rawOfficialPercentage: officialPercentage,
      realPresent: officialStats.present,
      correctionPresent: modifierStats.correctionPresent,
      extraPresent: modifierStats.extraPresent,
      realAbsent: officialStats.absent,
      savedAbsent: modifierStats.savedAbsent,
      extraAbsent: modifierStats.extraAbsent,
      realDL: officialStats.dl,
      correctionDL: modifierStats.correctionDL,
      extraDL: modifierStats.extraDL,
      otherLeave: 0,
      realTotal: officialStats.total,
      finalTotal,
      finalPresent,
      courseStats,
    };
  }, [
    coursesData,
    attendanceData,
    trackingData,
    classCourses,
    disabledCodes,
    selectedSemester,
    selectedYear,
  ]);
}
