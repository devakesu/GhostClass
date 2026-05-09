import { useMemo } from "react";
import { generateSlotKey } from "@/lib/utils";
import { 
  isPositive, 
  getOfficialSessionRaw, 
  ATTENDANCE_STATUS 
} from "@/lib/logic/attendance-reconciliation";
import { AttendanceReport, TrackAttendance } from "@/types";

interface UseDashboardStatsOptions {
  coursesData: any;
  attendanceData: AttendanceReport | undefined;
  trackingData: TrackAttendance[] | undefined;
  classCourses: any;
  disabledCodes: Set<string>;
  selectedSemester: string | null;
  selectedYear: string | null;
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
    // 0. Pre-normalize course codes for O(1) lookup in loops
    const normalizedCourseMap = new Map<string, string>();
    const normalizedDisabledCodes = new Set(Array.from(disabledCodes).map(c => c.toUpperCase().replace(/\s+/g, "")));

    const getNormalizedKey = (raw: string) => raw.toUpperCase().replace(/\s+/g, "");

    const getCourseCode = (id: string) => {
      if (normalizedCourseMap.has(id)) return normalizedCourseMap.get(id)!;
      
      const numericId = parseInt(id, 10);
      let code = id;
      if (!isNaN(numericId)) {
        const course = coursesData?.courses?.[id];
        code = course?.code || id;
      }
      
      const normalized = getNormalizedKey(code);
      normalizedCourseMap.set(id, normalized);
      return normalized;
    };

    const officialStats = { present: 0, absent: 0, dl: 0, total: 0, other: 0 };
    const modifierStats = {
      correctionPresent: 0,
      savedAbsent: 0,
      correctionDL: 0,
      extraPresent: 0,
      extraAbsent: 0,
      extraDL: 0,
    };

    const courseStats: Record<
      string,
      {
        present: number;
        total: number;
        officialPresent: number;
        officialTotal: number;
        correctionPresent: number;
        extraPresent: number;
        extrasCount: number;
        extraAbsent: number;
      }
    > = {};

    // 1. Initialize course stats
    if (coursesData?.courses) {
      Object.keys(coursesData.courses).forEach((id) => {
        const key = getCourseCode(id);
        if (!courseStats[key]) {
          courseStats[key] = {
            present: 0, total: 0, officialPresent: 0, officialTotal: 0,
            correctionPresent: 0, extraPresent: 0, extrasCount: 0, extraAbsent: 0,
          };
        }
      });
    }

    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const key = getNormalizedKey(cc.course_code);
        if (!courseStats[key]) {
          courseStats[key] = {
            present: 0, total: 0, officialPresent: 0, officialTotal: 0,
            correctionPresent: 0, extraPresent: 0, extrasCount: 0, extraAbsent: 0,
          };
        }
      });
    }

    const resolveCode = (cid: string): string => {
      return getCourseCode(cid);
    };

    const isCourseDisabled = (cid: string): boolean => {
      const code = resolveCode(cid);
      return normalizedDisabledCodes.has(code);
    };

    const officialMap = new Map<string, number>();
    if (attendanceData?.studentAttendanceData) {
      Object.entries(attendanceData.studentAttendanceData).forEach(
        ([dateStr, dateData]) => {
          Object.entries(dateData).forEach(([sessionKey, session]) => {
            if (session.course && session.class_type !== "Revision") {
              const cid = String(session.course);
              const status = Number(session.attendance);
              const rawSession = getOfficialSessionRaw(session, sessionKey);

              const courseDisabled = isCourseDisabled(cid);
              const statsKey = resolveCode(cid);

              const key = generateSlotKey(statsKey, dateStr, rawSession);
              officialMap.set(key, status);

              if (courseStats[statsKey]) {
                const isValidCode = [110, 111, 225, 112].includes(status);
                if (isValidCode) {
                  courseStats[statsKey].total++;
                  courseStats[statsKey].officialTotal++;
                if (
                  status === ATTENDANCE_STATUS.PRESENT ||
                  status === ATTENDANCE_STATUS.DUTY_LEAVE ||
                  status === ATTENDANCE_STATUS.OTHER_LEAVE
                ) {
                    courseStats[statsKey].present++;
                    courseStats[statsKey].officialPresent++;
                  }
                }
              }

              if (courseStats[statsKey] && !courseDisabled) {
                if (
                  status === ATTENDANCE_STATUS.PRESENT ||
                  status === ATTENDANCE_STATUS.DUTY_LEAVE ||
                  status === ATTENDANCE_STATUS.OTHER_LEAVE
                ) {
                  officialStats.present++;
                  officialStats.total++;
                } else if (status === ATTENDANCE_STATUS.ABSENT) {
                  officialStats.absent++;
                  officialStats.total++;
                }

                if (status === ATTENDANCE_STATUS.DUTY_LEAVE) officialStats.dl++;
              }
            }
          });
        },
      );
    }

    if (trackingData) {
      trackingData.forEach((item) => {
        if (item.semester !== selectedSemester || item.year !== selectedYear) {
          return;
        }

        if (!item.course) return;
        const cid = String(item.course);
        const statsKey = resolveCode(cid);
        const key = generateSlotKey(statsKey, item.date, item.session);

        let trackerStatus: number = ATTENDANCE_STATUS.PRESENT;
        if (typeof item.attendance === "number") {
          trackerStatus = item.attendance;
        }

        const officialStatus = officialMap.get(key);
        const isTrulyExtra = item.status === "extra" && officialStatus === undefined;

        const trackerPositive = isPositive(trackerStatus);
        const trackerDL = trackerStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

        const officialPositive = officialStatus !== undefined ? isPositive(officialStatus) : false;
        const officialDL = officialStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

        const courseDisabled = isCourseDisabled(cid);

        const updateCourse = (
          isExtraClass: boolean,
          offPos: boolean,
          trackPos: boolean,
          isExtraAbsent: boolean = false
        ) => {
          if (courseStats[statsKey]) {
            if (isExtraClass) {
              courseStats[statsKey].total++;
              courseStats[statsKey].extrasCount++;
              if (trackPos) {
                courseStats[statsKey].present++;
                courseStats[statsKey].extraPresent++;
              } else if (isExtraAbsent) {
                courseStats[statsKey].extraAbsent++;
              }
            } else {
              if (!offPos && trackPos) {
                courseStats[statsKey].present++;
                courseStats[statsKey].correctionPresent++;
              } else if (offPos && !trackPos) {
                courseStats[statsKey].present--;
                courseStats[statsKey].correctionPresent--;
              }
            }
          }
        };

        if (isTrulyExtra) {
          updateCourse(true, false, trackerPositive, !trackerPositive);
          if (!courseDisabled) {
            if (trackerPositive) modifierStats.extraPresent++;
            else modifierStats.extraAbsent++;
            if (trackerDL) modifierStats.extraDL++;
          }
        } else {
          updateCourse(false, officialPositive, trackerPositive);
          if (!courseDisabled) {
            if (!officialPositive && trackerPositive) {
              modifierStats.correctionPresent++;
            }
            if (!officialPositive && trackerPositive) {
              modifierStats.savedAbsent++;
            }
            if (!officialDL && trackerDL) modifierStats.correctionDL++;
          }
        }
      });
    }

    const finalTotal = officialStats.total + modifierStats.extraPresent + modifierStats.extraAbsent;
    const finalPresent = officialStats.present + modifierStats.correctionPresent + modifierStats.extraPresent;

    const percentage = finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0;
    const officialPercentage = officialStats.total > 0 ? (officialStats.present / officialStats.total) * 100 : 0;
    
    const formatPct = (val: number) => 
      val % 1 === 0 ? Math.round(val) : parseFloat(val.toFixed(2));

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
      otherLeave: officialStats.other,
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
