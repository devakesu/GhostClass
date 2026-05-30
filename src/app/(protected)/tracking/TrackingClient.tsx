"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useTrackingCount } from "@/hooks/tracker/useTrackingCount";
import { useProfile } from "@/hooks/users/profile";
import { captureSentryException } from "@/lib/sentry-lazy";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDown,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Filter,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { domAnimation, LazyMotion, m } from "framer-motion";
import { useAttendanceReport } from "@/hooks/courses/attendance";
import { useFetchAcademicYear, useFetchSemester } from "@/hooks/users/settings";
import { Loading } from "@/components/loading";
import {
  cn,
  formatSessionName,
  generateSlotKey,
  getSessionNumber,
  normalizeSession,
  normalizeToISODate,
  redact,
} from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useFetchCourses } from "@/hooks/courses/courses";
import {
  isLegacyRemark,
  getOfficialSessionRaw,
} from "@/lib/logic/attendance-reconciliation";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";
import { AttendanceReport, Course, TrackAttendance } from "@/types";

// --- Helper Functions ---

type AttendanceCode = string | number | undefined;

type AttendanceDataPayload = AttendanceReport | null | undefined;
type AttendanceSessionItem = AttendanceReport["studentAttendanceData"][string][string];
type CoursesDataPayload = { courses: Record<string, Course> } | null | undefined;

const STATUS_ORDER = ["Present", "Duty Leave", "Absent"] as const;
type StatusKey = (typeof STATUS_ORDER)[number];
const STATUS_STYLES = new Map<
  StatusKey,
  { dot: string; text: string; border: string }
>([
  [
    "Present",
    {
      dot: "bg-green-500",
      text: "text-green-600 dark:text-green-400",
      border: "border-green-500/40 dark:border-green-500/20",
    },
  ],
  [
    "Duty Leave",
    {
      dot: "bg-orange-500",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-500/40 dark:border-orange-500/20",
    },
  ],
  [
    "Absent",
    {
      dot: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
      border: "border-red-500/40 dark:border-red-500/20",
    },
  ],
]);

function getStatusKey(attendanceCode: AttendanceCode): StatusKey {
  const code = Number(attendanceCode);
  if (code === 225) return "Duty Leave";
  if (code === 111) return "Absent";
  return "Present";
}

const parseDateParts = (parts: string[]): string | null => {
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  if (c.length === 4) return `${c}${b.padStart(2, "0")}${a.padStart(2, "0")}`;
  if (a.length === 4) return `${a}${b.padStart(2, "0")}${c.padStart(2, "0")}`;
  return null;
};

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const raw = String(dateStr).trim();
  if (raw.includes("T")) return raw.split("T")[0].replace(/-/g, "");
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length === 8 && !raw.includes("/") && !raw.includes("-")) {
    return digitsOnly;
  }
  if (raw.includes("/")) {
    const res = parseDateParts(raw.split("/"));
    if (res) return res;
  }
  if (raw.includes("-")) {
    const res = parseDateParts(raw.split("-"));
    if (res) return res;
  }
  if (digitsOnly.length >= 8) return digitsOnly.slice(-8);
  return digitsOnly;
};

const formatDisplayDate = (dateStr: string): string => {
  const norm = normalizeDate(dateStr);
  if (norm.length === 8) {
    return `${norm.slice(6, 8)}/${norm.slice(4, 6)}/${norm.slice(0, 4)}`;
  }
  return dateStr;
};

const parseDateValue = (dateStr: string) => {
  const norm = normalizeDate(dateStr);
  if (norm.length === 8) {
    return new Date(
      `${norm.slice(0, 4)}-${norm.slice(4, 6)}-${norm.slice(6, 8)}`,
    ).getTime();
  }
  return new Date().getTime();
};

function getCorrectionStatusText(
  trackingItem: TrackAttendance,
  attendanceData: AttendanceDataPayload,
  officialSessionsMap: Map<string, AttendanceSessionItem>,
  userLabel: string,
): string {
  let sessionToUse = trackingItem.session;
  const sessions = attendanceData?.sessions;
  
  if (sessions && Object.prototype.hasOwnProperty.call(sessions, sessionToUse)) {
    const resolvedSession = Reflect.get(sessions, sessionToUse);
    const normalized = normalizeSession(resolvedSession?.name || "");
    if (!isNaN(parseInt(normalized, 10))) {
      sessionToUse = normalized;
    }
  }

  const itemKey = generateSlotKey(
    trackingItem.course,
    trackingItem.date,
    sessionToUse,
  );
  const officialSession = officialSessionsMap.get(itemKey);
  let officialLabel = "Absent";
  if (officialSession) {
    const offCode = Number(officialSession.attendance);
    if (offCode === 110) {
      officialLabel = "Present";
    } else if (offCode === 225) {
      officialLabel = "Duty Leave";
    }
  }
  return `${officialLabel} → ${userLabel}`;
}

function TrackingRecordCard({
  trackingItem,
  attendanceData,
  officialSessionsMap,
  deleteId,
  setDeleteConfirmOpen,
  getResolvedSessionName,
}: {
  trackingItem: TrackAttendance;
  attendanceData: AttendanceDataPayload;
  officialSessionsMap: Map<string, AttendanceSessionItem>;
  deleteId: string;
  setDeleteConfirmOpen: (id: string | null) => void;
  getResolvedSessionName: (sessionValue: string, dateStr?: string) => string;
}) {
  const trackingId = `${trackingItem.auth_user_id}-${trackingItem.session}-${trackingItem.course}-${trackingItem.date}`;

  // Status Logic
  const isCorrection = trackingItem.status === "correction";
  const attCode = Number(trackingItem.attendance);
  let userLabel = "Present",
    userColor = "green";
  if (attCode === 225) {
    userLabel = "Duty Leave";
    userColor = "orange";
  } else if (attCode === 111) {
    userLabel = "Absent";
    userColor = "red";
  }

  let statusText = userLabel;
  if (isCorrection) {
    statusText = getCorrectionStatusText(
      trackingItem,
      attendanceData,
      officialSessionsMap,
      userLabel,
    );
  }

  const typeLabel = isCorrection ? "Correction" : "Extra";
  const typeColorClass = isCorrection
    ? "bg-primary/10 text-primary border-primary/40 dark:border-primary/20"
    : "bg-brand-accent/10 text-brand-accent border-brand-accent/40 dark:border-brand-accent/20";

  let statusBadgeClass = "bg-green-500/20 text-green-600 dark:text-green-400";
  let cardBgClass = "bg-green-500/5 border-green-500/35 dark:border-green-500/20";

  if (userColor === "orange") {
    statusBadgeClass = "bg-orange-500/20 text-orange-600 dark:text-orange-400";
    cardBgClass = "bg-orange-500/5 border-orange-500/35 dark:border-orange-500/20";
  } else if (userColor === "red") {
    statusBadgeClass = "bg-red-500/20 text-red-600 dark:text-red-400";
    cardBgClass = "bg-red-500/5 border-red-500/35 dark:border-red-500/20";
  }

  const remarkColorClass = attCode === 225
    ? "text-orange-600/80 dark:text-orange-400/80"
    : "text-muted-foreground/80";

  return (
    <m.div
      key={trackingId}
      className={`p-4 text-left rounded-xl border hover:bg-opacity-20 transition-all w-full ${cardBgClass}`}
    >
      <div className="flex justify-between items-start mb-2 gap-4">
        <div className="font-medium text-sm text-foreground/70">
          Session:{" "}
          <span className="text-foreground capitalize">
            {getResolvedSessionName(trackingItem.session, trackingItem.date)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 h-5 ${typeColorClass}`}
          >
            {typeLabel}
          </Badge>
          <Badge className={statusBadgeClass}>
            {statusText}
          </Badge>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center justify-between mt-2">
        <span className="font-medium">
          {formatDisplayDate(trackingItem.date)}
        </span>
        <m.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          disabled={deleteId === trackingId}
          onClick={() => setDeleteConfirmOpen(trackingId)}
          aria-label={`Remove tracking entry for ${getResolvedSessionName(
            trackingItem.session,
          )} session on ${formatDisplayDate(trackingItem.date)}`}
          className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 bg-yellow-400/6 border border-yellow-500/40 dark:border-yellow-500/20 rounded-lg font-medium text-yellow-600 dark:text-yellow-500 disabled:opacity-50"
        >
          {deleteId === trackingId ? (
            "Deleting..."
          ) : (
            <>
              <span className="max-md:hidden">Remove</span>
              <Trash2 size={15} aria-hidden="true" />
            </>
          )}
        </m.button>
      </div>
      {trackingItem.remarks && !isLegacyRemark(trackingItem.remarks) && (
        <p className={cn("text-[11px] mt-1.5 italic truncate", remarkColorClass)}>
          {trackingItem.remarks.trim()}
        </p>
      )}
    </m.div>
  );
}

function CourseSectionCard({
  courseName,
  groupedAllData,
  getCourseNameById,
  getCourseCodeById,
  isCourseDisabled,
  expandedCourses,
  recordsPerCourseInitial,
  getStatusKey,
  attendanceData,
  officialSessionsMap,
  deleteId,
  setDeleteConfirmOpen,
  getResolvedSessionName,
  toggleCourseExpansion,
  courseHeaderRefs,
}: {
  courseName: string;
  groupedAllData: Map<string, TrackAttendance[]>;
  getCourseNameById: (id: string) => string;
  getCourseCodeById: (id: string) => string;
  isCourseDisabled: (code: string) => boolean;
  expandedCourses: Set<string>;
  recordsPerCourseInitial: number;
  getStatusKey: (att: AttendanceCode) => StatusKey;
  attendanceData?: AttendanceDataPayload;
  officialSessionsMap: Map<string, AttendanceSessionItem>;
  deleteId: string;
  setDeleteConfirmOpen: (id: string | null) => void;
  getResolvedSessionName: (sessionValue: string, dateStr?: string) => string;
  toggleCourseExpansion: (courseId: string) => void;
  courseHeaderRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
}) {
  const items = groupedAllData.get(courseName) ?? [];
  const displayCourseName = getCourseNameById(courseName);
  const courseCode = getCourseCodeById(courseName).toUpperCase();
  const isCourseCurrentlyDisabled = isCourseDisabled(courseCode);

  // Performance optimization: limit records per course
  const isExpanded = expandedCourses.has(courseName);
  const visibleItems = isExpanded
    ? items
    : items.slice(0, recordsPerCourseInitial);
  const moreCount = items.length - recordsPerCourseInitial;
  const hasMore = moreCount > 0;

  // Group visible items by final/corrected status
  const statusGroups = new Map<StatusKey, TrackAttendance[]>([
    ["Present", []],
    ["Duty Leave", []],
    ["Absent", []],
  ]);
  visibleItems.forEach((item) => {
    statusGroups.get(getStatusKey(item.attendance))!.push(item);
  });
  const activeStatusLabels = STATUS_ORDER.filter((s) =>
    statusGroups.get(s)!.length > 0
  );

  const recordLabel = moreCount === 1 ? "Record" : "Records";
  const buttonTextStr = isExpanded
    ? "Show Less"
    : `Show ${moreCount} More ${recordLabel}`;

  return (
    <div
      key={courseName}
      className="scroll-mt-24 flex flex-col gap-3"
    >
      <div
        ref={(el) => {
          courseHeaderRefs.current.set(courseName, el);
        }}
        className="flex items-center gap-2 custom-container px-2 py-2"
      >
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <BookOpen size={16} aria-hidden="true" />
        </div>
        <h3 className="text-md font-semibold text-left text-foreground/90 capitalize">
          {displayCourseName.toLowerCase()}
        </h3>
        {isCourseCurrentlyDisabled && (
          <Badge className="text-[10px] px-1.5 h-4 bg-muted text-muted-foreground border-border">
            Disabled
          </Badge>
        )}
        <Badge
          variant="outline"
          className="ml-auto text-xs"
        >
          {items.length}
        </Badge>
      </div>

      <div className="flex flex-col gap-5">
        {activeStatusLabels.map((statusLabel) => {
          const groupItems = statusGroups.get(statusLabel)!;
          const { dot, text, border } =
            STATUS_STYLES.get(statusLabel)!;
          return (
            <div
              key={statusLabel}
              className="flex flex-col gap-2"
            >
              {/* Status sub-header */}
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded-md border ${border} bg-background/40`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${dot}`}
                />
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${text}`}
                >
                  {statusLabel}
                </span>
                <Badge
                  variant="outline"
                  className={`ml-auto text-[10px] px-1.5 h-4 ${text} border-current`}
                >
                  {groupItems.length}
                </Badge>
              </div>

              {/* Items for this status */}
              <div className="flex flex-col gap-3">
                {groupItems.map((trackingItem) => (
                  <TrackingRecordCard
                    key={`${trackingItem.auth_user_id}-${trackingItem.session}-${trackingItem.course}-${trackingItem.date}`}
                    trackingItem={trackingItem}
                    attendanceData={attendanceData}
                    officialSessionsMap={officialSessionsMap}
                    deleteId={deleteId}
                    setDeleteConfirmOpen={setDeleteConfirmOpen}
                    getResolvedSessionName={getResolvedSessionName}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show More/Less Button */}
      {hasMore && (
        <m.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => toggleCourseExpansion(courseName)}
          className="mt-2 w-full py-2 px-4 text-sm font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors duration-200"
        >
          {buttonTextStr}
        </m.button>
      )}
    </div>
  );
}

function getCourseFilterKeys(selectedCourseFilter: string, coursesData: CoursesDataPayload): string[] {
  const keys = new Set([selectedCourseFilter]);
  const courseList = coursesData?.courses
    ? Object.values(coursesData.courses)
    : [];

  const course = courseList.find(
    (c) =>
      c.id?.toString() === selectedCourseFilter ||
      c.code?.toUpperCase() === selectedCourseFilter.toUpperCase(),
  );

  if (course) {
    if (course.id) keys.add(course.id.toString());
    if (course.code) keys.add(course.code);
  }
  return Array.from(keys);
}

function sortAllCourseKeys(
  keys: IterableIterator<string>,
  getCourseCodeById: (id: string) => string,
  getCourseNameById: (id: string) => string,
  isCourseDisabled: (code: string) => boolean,
): string[] {
  return Array.from(keys).sort((a, b) => {
    const codeA = getCourseCodeById(a).toUpperCase();
    const codeB = getCourseCodeById(b).toUpperCase();
    const aDisabled = isCourseDisabled(codeA);
    const bDisabled = isCourseDisabled(codeB);

    if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;

    const nameA = getCourseNameById(a).toLowerCase();
    const nameB = getCourseNameById(b).toLowerCase();

    return nameA.localeCompare(nameB);
  });
}

function filterCourseKeys(
  allKeys: string[],
  selectedCourseFilter: string,
  getCourseCodeById: (id: string) => string,
  isCourseDisabled: (code: string) => boolean,
): string[] {
  if (selectedCourseFilter === "all") {
    return allKeys.filter((k) => {
      const code = getCourseCodeById(k).toUpperCase();
      return !isCourseDisabled(code);
    });
  }
  return allKeys.filter((k) => k === selectedCourseFilter);
}

function groupAndSortTrackingData(
  trackingData: TrackAttendance[] | undefined,
  semesterData: string | undefined,
  academicYearData: string | undefined,
): Map<string, TrackAttendance[]> {
  const map = new Map<string, TrackAttendance[]>();
  if (!trackingData) return map;

  trackingData.forEach((item) => {
    if (item.semester !== semesterData || item.year !== academicYearData) {
      return;
    }
    const courseKey = item.course.trim();
    if (!map.has(courseKey)) map.set(courseKey, []);
    map.get(courseKey)!.push(item);
  });

  map.forEach((items) => {
    items.sort((a, b) => {
      const dateA = parseDateValue(a.date);
      const dateB = parseDateValue(b.date);
      if (dateA !== dateB) return dateB - dateA;
      return getSessionNumber(a.session) - getSessionNumber(b.session);
    });
  });
  return map;
}

function buildSessionIndexMap(attendanceData: AttendanceDataPayload): Map<string, number> {
  const map = new Map<string, number>();
  if (!attendanceData?.studentAttendanceData) return map;

  Object.entries(attendanceData.studentAttendanceData).forEach(([dateKey, dateData]) => {
    const isoDate = normalizeToISODate(dateKey);
    Object.entries(dateData).forEach(([sessionKey, sessionData], index) => {
      const ordinal = index + 1;
      map.set(`${isoDate}|${String(sessionKey).trim().toLowerCase()}`, ordinal);

      if (sessionData?.session) {
        map.set(`${isoDate}|${String(sessionData.session).trim().toLowerCase()}`, ordinal);
      }
    });
  });
  return map;
}

function buildOfficialSessionsMap(attendanceData: AttendanceDataPayload): Map<string, AttendanceSessionItem> {
  const map = new Map<string, AttendanceSessionItem>();
  if (!attendanceData?.studentAttendanceData) return map;

  const sessionsObj = attendanceData?.sessions;

  Object.entries(attendanceData.studentAttendanceData).forEach(([dateStr, dateData]) => {
    Object.entries(dateData).forEach(([sessionKey, session], index) => {
      if (!session.course) return;

      let rawSession = getOfficialSessionRaw(session, sessionKey);
      const isLargeNumeric = !isNaN(parseInt(String(rawSession))) && parseInt(String(rawSession)) > 20;

      if (sessionsObj && Object.prototype.hasOwnProperty.call(sessionsObj, rawSession)) {
        const resolved = Reflect.get(sessionsObj, rawSession);
        const normalized = normalizeSession(resolved?.name || "");
        if (!isNaN(parseInt(normalized, 10))) {
          rawSession = normalized;
        }
      } else if (isLargeNumeric) {
        rawSession = String(index + 1);
      }

      const key = generateSlotKey(session.course, dateStr, rawSession);
      map.set(key, session);
    });
  });
  return map;
}

function resolveSessionName(
  sessionValue: string,
  dateStr: string | undefined,
  attendanceData?: AttendanceDataPayload,
  sessionIndexMap: Map<string, number> = new Map(),
): string {
  const sessions = attendanceData?.sessions;
  if (sessions && Object.prototype.hasOwnProperty.call(sessions, sessionValue)) {
    const resolved = Reflect.get(sessions, sessionValue);
    return typeof resolved?.name === "string" 
      ? resolved.name 
      : String(sessionValue);
  }

  if (dateStr && sessionIndexMap.size > 0) {
    const index = sessionIndexMap.get(`${normalizeToISODate(dateStr)}|${String(sessionValue).trim().toLowerCase()}`);
    if (index) return formatSessionName(String(index));
  }

  return formatSessionName(sessionValue);
}

function buildActiveCourseMeta(
  activeCourseKey: string | null,
  groupedAllData: Map<string, TrackAttendance[]>,
  getCourseNameById: (id: string) => string,
  getCourseCodeById: (id: string) => string,
  isCourseDisabled: (code: string) => boolean,
): { displayCourseName: string; isDisabled: boolean; count: number } | null {
  if (!activeCourseKey) return null;
  const items = groupedAllData.get(activeCourseKey);
  if (!items?.length) return null;

  const displayCourseName = getCourseNameById(activeCourseKey);
  const courseCode = getCourseCodeById(activeCourseKey).toUpperCase();

  return {
    displayCourseName,
    isDisabled: isCourseDisabled(courseCode),
    count: items.length,
  };
}

function findLastCrossedHeader(
  keys: string[],
  refsMap: Map<string, HTMLDivElement | null>,
  navOffsetPx: number,
): string | null {
  let lastCrossedHeader: string | null = null;
  for (const courseKey of keys) {
    const el = refsMap.get(courseKey);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.top <= navOffsetPx) {
      lastCrossedHeader = courseKey;
    } else {
      break;
    }
  }
  return lastCrossedHeader;
}

function getNextExpandedCourses(prev: Set<string>, courseName: string): Set<string> {
  const newSet = new Set(prev);
  if (newSet.has(courseName)) {
    newSet.delete(courseName);
  } else {
    newSet.add(courseName);
  }
  return newSet;
}

function useActiveCourseScrollSync(
  currentCourseKeys: string[],
  courseHeaderRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>,
) {
  const [activeCourseKey, setActiveCourseKey] = useState<string | null>(null);
  const [showPinnedCourse, setShowPinnedCourse] = useState(false);
  const lastActiveCourseKeyRef = useRef<string | null>(null);
  const lastShowPinnedCourseRef = useRef(false);

  useEffect(() => {
    if (currentCourseKeys.length === 0) return;

    const navOffsetPx = 80; // matches protected layout navbar height (h-20)

    const updateActiveCourse = () => {
      const lastCrossedHeader = findLastCrossedHeader(
        currentCourseKeys,
        courseHeaderRefs.current,
        navOffsetPx,
      );

      const newKey = lastCrossedHeader;
      const newShow = lastCrossedHeader !== null;

      if (newKey !== lastActiveCourseKeyRef.current) {
        lastActiveCourseKeyRef.current = newKey;
        setActiveCourseKey(newKey);
      }
      if (newShow !== lastShowPinnedCourseRef.current) {
        lastShowPinnedCourseRef.current = newShow;
        setShowPinnedCourse(newShow);
      }
    };

    let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActiveCourse();
      });
    };

    updateActiveCourse();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [currentCourseKeys, courseHeaderRefs]);

  return {
    activeCourseKey,
    showPinnedCourse,
    setActiveCourseKey,
    setShowPinnedCourse,
  };
}

function CourseFilterControls({
  selectedCourseFilter,
  setSelectedCourseFilter,
  setCurrentPage,
  allCourseKeys,
  getCourseNameById,
  getCourseCodeById,
  isCourseDisabled,
  groupedAllData,
  count,
  setDeleteAllConfirmOpen,
}: {
  selectedCourseFilter: string;
  setSelectedCourseFilter: (val: string) => void;
  setCurrentPage: (p: number) => void;
  allCourseKeys: string[];
  getCourseNameById: (id: string) => string;
  getCourseCodeById: (id: string) => string;
  isCourseDisabled: (code: string) => boolean;
  groupedAllData: Map<string, TrackAttendance[]>;
  count: number | undefined;
  setDeleteAllConfirmOpen: (open: boolean) => void;
}) {
  const isAll = selectedCourseFilter === "all";
  const labelSuffix = count === 1 ? "" : "es";
  const buttonLabel = isAll
    ? `Delete all ${count} tracked class${labelSuffix}`
    : `Clear all records for this subject`;

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full max-w-md mx-auto px-1">
        <Select
          value={selectedCourseFilter}
          onValueChange={(val) => {
            setSelectedCourseFilter(val);
            setCurrentPage(0);
          }}
        >
          <SelectTrigger className="bg-background/40 hover:bg-background/60 border-border/50 h-auto min-h-11 py-2 w-full backdrop-blur-md shadow-sm transition-all duration-300 ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 whitespace-normal text-left [&>span]:line-clamp-none">
            <div className="flex items-center gap-2.5 w-full">
              <Filter
                size={15}
                className={cn(
                  "shrink-0 transition-colors",
                  selectedCourseFilter !== "all"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
              <SelectValue placeholder="All Subjects" />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-75 w-full min-w-(--radix-select-trigger-width) max-w-[calc(100vw-40px)]">
            <SelectItem value="all">
              <span className="font-medium text-primary">
                All Subjects
              </span>
            </SelectItem>
            {allCourseKeys.map((courseKey) => {
              const displayCourseName = getCourseNameById(courseKey);
              const courseCount =
                groupedAllData.get(courseKey)?.length || 0;
              const courseCode = getCourseCodeById(courseKey).toUpperCase();
              const isDisabled = isCourseDisabled(courseCode);

              return (
                <SelectItem
                  key={courseKey}
                  value={courseKey}
                  className="whitespace-normal py-2"
                  textValue={`${displayCourseName}${isDisabled ? " (Disabled)" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4 w-full py-0.5">
                    <span
                      className={cn(
                        "flex-1 leading-tight text-left capitalize whitespace-normal wrap-break-word",
                        isDisabled && "opacity-60 italic",
                      )}
                    >
                      {displayCourseName.toLowerCase()}
                      {isDisabled && " (Disabled)"}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-4 px-1 text-[10px] shrink-0 bg-primary/10 text-primary border-none"
                    >
                      {courseCount}
                    </Badge>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-center">
        <Badge className="text-sm py-1 px-3 bg-yellow-500/12 text-yellow-600 dark:text-yellow-400 border border-yellow-500/40 dark:border-yellow-500/20">
          {selectedCourseFilter === "all"
            ? (
              <>
                You have added <strong>{count}</strong>{" "}
                {count === 1 ? "class" : "classes"}.
              </>
            )
            : (
              <>
                <strong>
                  {groupedAllData.get(selectedCourseFilter)?.length}
                </strong>{" "}
                recorded for this subject.
              </>
            )}
        </Badge>
        <button
          onClick={() => setDeleteAllConfirmOpen(true)}
          aria-label={buttonLabel}
          className="text-sm cursor-pointer justify-between items-center gap-2 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/15 duration-300 border border-brand-accent/40 dark:border-brand-accent/20 py-1 px-3 rounded-md flex"
        >
          {selectedCourseFilter === "all"
            ? "DELETE ALL"
            : "CLEAR SUBJECT"}{" "}
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function TrackingModals({
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  deleteAllConfirmOpen,
  setDeleteAllConfirmOpen,
  selectedCourseFilter,
  setSelectedCourseFilter,
  count,
  semesterData,
  academicYearData,
  activeCourseMeta,
  trackingData,
  handleDeleteTrackData,
  deleteAllTrackingData,
  setCurrentPage,
}: {
  deleteConfirmOpen: string | null;
  setDeleteConfirmOpen: (id: string | null) => void;
  deleteAllConfirmOpen: boolean;
  setDeleteAllConfirmOpen: (open: boolean) => void;
  selectedCourseFilter: string;
  setSelectedCourseFilter: (val: string) => void;
  count: number | undefined;
  semesterData: string | undefined;
  academicYearData: string | undefined;
  activeCourseMeta: { displayCourseName: string } | null;
  trackingData: TrackAttendance[] | undefined;
  handleDeleteTrackData: (
    uniqueId: string,
    session: string,
    course: string,
    date: string,
  ) => Promise<void>;
  deleteAllTrackingData: () => Promise<void>;
  setCurrentPage: (p: number) => void;
}) {
  const recordSuffix = count === 1 ? "" : "s";
  return (
    <>
      {/* Delete Single Item Confirmation */}
      <AlertDialog
        open={!!deleteConfirmOpen}
        onOpenChange={(open) => !open && setDeleteConfirmOpen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tracking record? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteConfirmOpen) {
                  const trackingItem = trackingData?.find((item) =>
                    `${item.auth_user_id}-${item.session}-${item.course}-${item.date}` ===
                      deleteConfirmOpen
                  );
                  if (trackingItem) {
                    await handleDeleteTrackData(
                      deleteConfirmOpen,
                      trackingItem.session,
                      trackingItem.course,
                      trackingItem.date,
                    );
                  }
                  setDeleteConfirmOpen(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              DELETE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Confirmation */}
      <AlertDialog
        open={deleteAllConfirmOpen}
        onOpenChange={setDeleteAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedCourseFilter === "all"
                ? "Delete All Records"
                : "Clear Subject Records"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCourseFilter === "all"
                ? `This will permanently delete all ${count} tracking record${recordSuffix} for the ${semesterData?.toUpperCase()} ${academicYearData} academic term.`
                : `This will permanently delete all tracking records for ${
                  activeCourseMeta?.displayCourseName || selectedCourseFilter
                }.`} This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteAllTrackingData();
                  setSelectedCourseFilter("all");
                  setCurrentPage(0);
                } catch {
                  // Error is already handled inside deleteAllTrackingData
                }
                setDeleteAllConfirmOpen(false);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {selectedCourseFilter === "all"
                ? "DELETE ALL"
                : "CLEAR SUBJECT"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CourseListContainer({
  currentCourseKeys,
  groupedAllData,
  getCourseNameById,
  getCourseCodeById,
  isCourseDisabled,
  expandedCourses,
  recordsPerCourseInitial,
  getStatusKey,
  attendanceData,
  officialSessionsMap,
  deleteId,
  setDeleteConfirmOpen,
  getResolvedSessionName,
  toggleCourseExpansion,
  courseHeaderRefs,
  totalPages,
  currentPage,
  goToPrevPage,
  goToNextPage,
}: {
  currentCourseKeys: string[];
  groupedAllData: Map<string, TrackAttendance[]>;
  getCourseNameById: (id: string) => string;
  getCourseCodeById: (id: string) => string;
  isCourseDisabled: (code: string) => boolean;
  expandedCourses: Set<string>;
  recordsPerCourseInitial: number;
  getStatusKey: (att: AttendanceCode) => StatusKey;
  attendanceData: AttendanceDataPayload;
  officialSessionsMap: Map<string, AttendanceSessionItem>;
  deleteId: string;
  setDeleteConfirmOpen: (id: string | null) => void;
  getResolvedSessionName: (session: string, dateStr?: string) => string;
  toggleCourseExpansion: (name: string) => void;
  courseHeaderRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
  totalPages: number;
  currentPage: number;
  goToPrevPage: () => void;
  goToNextPage: () => void;
}) {
  return (
    <div className="relative mx-auto flex w-full max-w-175 flex-col gap-4 overflow-visible">
      <div
        key={currentPage}
        className="flex flex-col gap-6 overflow-visible"
      >
        {currentCourseKeys.map((courseName) => (
          <CourseSectionCard
            key={courseName}
            courseName={courseName}
            groupedAllData={groupedAllData}
            getCourseNameById={getCourseNameById}
            getCourseCodeById={getCourseCodeById}
            isCourseDisabled={isCourseDisabled}
            expandedCourses={expandedCourses}
            recordsPerCourseInitial={recordsPerCourseInitial}
            getStatusKey={getStatusKey}
            attendanceData={attendanceData}
            officialSessionsMap={officialSessionsMap}
            deleteId={deleteId}
            setDeleteConfirmOpen={setDeleteConfirmOpen}
            getResolvedSessionName={getResolvedSessionName}
            toggleCourseExpansion={toggleCourseExpansion}
            courseHeaderRefs={courseHeaderRefs}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-8 pb-8">
          <m.button
            onClick={goToPrevPage}
            disabled={currentPage === 0}
            className={`h-8 w-8 flex justify-center items-center rounded-lg ${
              currentPage === 0
                ? "text-muted-foreground bg-accent/30"
                : "text-primary bg-accent hover:bg-accent/40"
            }`}
            aria-label="Previous page"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </m.button>
          <div className="text-sm text-muted-foreground font-medium">
            Page {currentPage + 1} of {totalPages}
          </div>
          <m.button
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1}
            className={`h-8 w-8 flex justify-center items-center rounded-lg ${
              currentPage === totalPages - 1
                ? "text-muted-foreground bg-accent/30"
                : "text-primary bg-accent hover:bg-accent/40"
            }`}
            aria-label="Next page"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </m.button>
        </div>
      )}
    </div>
  );
}

async function executeDeleteSingleRecord({
  uniqueId,
  session,
  course,
  date,
  profile,
  setDeleteId,
  queryClient,
  refetchTrackingData,
  refetchCount,
  groupedAllData,
  currentCourseKeys,
  currentPage,
  setCurrentPage,
}: {
  uniqueId: string;
  session: string;
  course: string;
  date: string;
  profile: { id: string | number } | null | undefined;
  setDeleteId: (id: string) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  refetchTrackingData: () => Promise<unknown>;
  refetchCount: () => Promise<unknown>;
  groupedAllData: Map<string, TrackAttendance[]>;
  currentCourseKeys: string[];
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (!profile) return;
  setDeleteId(uniqueId);
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  try {
    const { error } = await supabase
      .from("tracker")
      .delete()
      .eq("session", session)
      .eq("course", course)
      .eq("date", date)
      .eq("auth_user_id", authUser?.id);

    if (error) throw error;

    toast.success("Delete successful");
    
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    
    await Promise.all([refetchTrackingData(), refetchCount()]);

    const remainingInCourse = groupedAllData.get(course)?.length || 0;
    if (
      remainingInCourse <= 1 && currentCourseKeys.length === 1 &&
      currentPage > 0
    ) {
      setCurrentPage((prev) => prev - 1);
    }
  } catch (error) {
    toast.error(
      "We encountered an error while deleting this record. Please try again later. If the issue persists, please contact us.",
    );
    captureSentryException(error, {
      tags: {
        type: "tracking_delete_single",
        location: "TrackingClient/handleDeleteTrackData",
      },
      extra: {
        userId: redact("id", String(profile?.id)),
        session,
        course,
        date,
      },
    });
  } finally {
    setDeleteId("");
  }
}

async function executeDeleteAllRecords({
  profile,
  setIsProcessing,
  semesterData,
  academicYearData,
  selectedCourseFilter,
  coursesData,
  queryClient,
  setCurrentPage,
}: {
  profile: { id: string | number } | null | undefined;
  setIsProcessing: (val: boolean) => void;
  semesterData: string | null;
  academicYearData: string | null;
  selectedCourseFilter: string;
  coursesData: CoursesDataPayload;
  queryClient: ReturnType<typeof useQueryClient>;
  setCurrentPage: (p: number) => void;
}) {
  if (!profile) return;
  try {
    setIsProcessing(true);
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    let query = supabase
      .from("tracker")
      .delete()
      .eq("auth_user_id", authUser?.id)
      .eq("semester", semesterData)
      .eq("year", academicYearData);

    if (selectedCourseFilter !== "all") {
      const keys = getCourseFilterKeys(selectedCourseFilter, coursesData);
      query = query.in("course", keys);
    }

    const { error } = await query;

    if (error) throw error;

    toast.success(
      selectedCourseFilter === "all"
        ? "All records cleared."
        : "Subject records cleared.",
    );
    
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    queryClient.invalidateQueries({ queryKey: ["track_data"] });
    queryClient.invalidateQueries({ queryKey: ["tracking_count"] });
    setCurrentPage(0);
  } catch (error) {
    toast.error(
      "We encountered an error while deleting tracking data. Please try again later. If the issue persists, please contact us.",
    );
    captureSentryException(error, {
      tags: {
        type: "tracking_delete_all",
        location: "TrackingClient/deleteAllTrackingData",
      },
      extra: { userId: redact("id", String(profile?.id)) },
    });
  } finally {
    setIsProcessing(false);
  }
}

export default function TrackingClient() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  const [deleteId, setDeleteId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(
    null,
  );
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const enabled = !!profile;

  const courseHeaderRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Per-course record limits (for performance with 100+ records)
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    new Set(),
  );
  const recordsPerCourseInitial = 10;
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>(
    "all",
  );

  // Reset to first page when filter changes is handled by the Select onValueChange.


  // Use a unique ID per mount to detect Strict Mode remounts (now managed inside useSyncOnMount)

  const coursesPerPage = 3;

  const {
    data: semesterData,
    isError: isSemesterError,
  } = useFetchSemester();
  const {
    data: academicYearData,
    isError: isAcademicYearError,
  } = useFetchAcademicYear();

  const {
    data: coursesData,
    isError: isCoursesError,
    refetch: refetchCourses,
  } = useFetchCourses({
    semester: semesterData || undefined,
    year: academicYearData || undefined,
    enabled: !!semesterData && !!academicYearData,
  });
  const {
    data: count,
    isError: isCountError,
    refetch: refetchCount,
  } = useTrackingCount(enabled ? profile : null);
  const {
    data: trackingData,
    isLoading: isDataLoading,
    isError: isTrackingError,
    refetch: refetchTrackingData,
  } = useTrackingData(enabled ? profile : null);
  const {
    data: attendanceData,
    isError: isAttendanceError,
    refetch: refetchAttendance,
  } = useAttendanceReport(
    semesterData || undefined,
    academicYearData || undefined,
    { enabled: !!semesterData && !!academicYearData },
  );
  const {
    data: classCourses,
  } = useFetchClassCourses({
    semester: semesterData as string | undefined,
    year: academicYearData as string | undefined,
    enabled: !!semesterData && !!academicYearData,
  });

  const { isDisabled: isCourseDisabled } = useDisabledCourses({
    academicYear: academicYearData,
    semester: semesterData,
  });

  const { getCourseCodeById, getCourseNameById } = useCourseLookup({
    coursesData,
    classCourses,
    attendanceData,
  });

  /** Pre-calculate session indices for all official records to ensure consistent display */
  const sessionIndexMap = useMemo(() => buildSessionIndexMap(attendanceData), [attendanceData]);

  /** Resolve session name using available registries and pre-calculated indices */
  const getResolvedSessionName = useCallback(
    (sessionValue: string, dateStr?: string): string =>
      resolveSessionName(sessionValue, dateStr, attendanceData, sessionIndexMap),
    [attendanceData, sessionIndexMap],
  );



  // --- AUTO SYNC ---
  const { isSyncing, syncSettled, syncFailed } = useSyncOnMount({
    username: profile?.username,
    userId: profile?.id,
    sentryLocation: "TrackingClient",
    sentryTag: "tracking_sync",
    onPartialSync: async () => {
      toast.warning("Partial Sync Completed", {
        description:
          "Some tracking records couldn't be synced. Your data may be incomplete.",
      });
      await Promise.all([
        refetchTrackingData(),
        refetchCount(),
        refetchAttendance(),
        refetchCourses(),
      ]);
    },
    onSuccess: async (data) => {
      const removed = data.deletions ?? 0;
      if (removed > 0) {
        toast.info("Data Synced", {
          description: `${removed} outdated record${
            removed === 1 ? "" : "s"
          } removed.`,
        });
      }
      await Promise.all([
        refetchTrackingData(),
        refetchCount(),
        refetchAttendance(),
        refetchCourses(),
      ]);
    },
  });

  const syncSuccess = !!(syncSettled && !syncFailed);

  // --- 1. GROUP AND SORT DATA ---
  const groupedAllData = useMemo(
    () => groupAndSortTrackingData(trackingData, semesterData ?? undefined, academicYearData ?? undefined),
    [trackingData, semesterData, academicYearData],
  );

  const allCourseKeys = useMemo(
    () => sortAllCourseKeys(groupedAllData.keys(), getCourseCodeById, getCourseNameById, isCourseDisabled),
    [groupedAllData, isCourseDisabled, getCourseCodeById, getCourseNameById],
  );

  const effectiveCourseFilter =
    selectedCourseFilter !== "all" && (!groupedAllData.get(selectedCourseFilter)?.length)
      ? "all"
      : selectedCourseFilter;

  const filteredCourseKeys = useMemo(
    () => filterCourseKeys(allCourseKeys, effectiveCourseFilter, getCourseCodeById, isCourseDisabled),
    [allCourseKeys, effectiveCourseFilter, isCourseDisabled, getCourseCodeById],
  );

  const totalPages = Math.ceil(filteredCourseKeys.length / coursesPerPage);

  const currentCourseKeys = useMemo(() => {
    const startIndex = currentPage * coursesPerPage;
    return filteredCourseKeys.slice(startIndex, startIndex + coursesPerPage);
  }, [currentPage, filteredCourseKeys, coursesPerPage]);

  const { activeCourseKey, showPinnedCourse } = useActiveCourseScrollSync(
    currentCourseKeys,
    courseHeaderRefs,
  );


  const activeCourseMeta = useMemo(
    () => buildActiveCourseMeta(activeCourseKey, groupedAllData, getCourseNameById, getCourseCodeById, isCourseDisabled),
    [activeCourseKey, groupedAllData, getCourseNameById, getCourseCodeById, isCourseDisabled],
  );

  const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));

  const toggleCourseExpansion = (courseName: string) => {
    setExpandedCourses((prev) => getNextExpandedCourses(prev, courseName));
  };

  const handleDeleteTrackData = (
    uniqueId: string,
    session: string,
    course: string,
    date: string,
  ) =>
    executeDeleteSingleRecord({
      uniqueId,
      session,
      course,
      date,
      profile,
      setDeleteId,
      queryClient,
      refetchTrackingData,
      refetchCount,
      groupedAllData,
      currentCourseKeys,
      currentPage,
      setCurrentPage,
    });

  const deleteAllTrackingData = () =>
    executeDeleteAllRecords({
      profile,
      setIsProcessing,
      semesterData: semesterData ?? null,
      academicYearData: academicYearData ?? null,
      selectedCourseFilter: effectiveCourseFilter,
      coursesData,
      queryClient,
      setCurrentPage,
    });

  const scrollToBottom = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  };

  // --- 2. OFFICIAL SESSION LOOKUP MAP ---
  const officialSessionsMap = useMemo(() => buildOfficialSessionsMap(attendanceData), [attendanceData]);

  // Block rendering until tracking is enabled, base data has loaded, and initial sync has completed.
  const isInitialLoading = !enabled || isDataLoading || isSyncing ||
    !syncSuccess;

  const hasBaseErrors = isTrackingError || isCountError || isCoursesError ||
    isAttendanceError || isSemesterError || isAcademicYearError;

  if (isInitialLoading && !hasBaseErrors) {
    return <Loading />;
  }

  if (isProcessing) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  const hasRecordsToDisplay = trackingData && allCourseKeys.length > 0;
  const hasCount = (count ?? 0) > 0;

  if (!hasRecordsToDisplay) {
    return (
      <LazyMotion features={domAnimation}>
        <div className="flex-1 container mx-auto max-w-7xl px-4 md:px-6 pt-4 md:pt-6">
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center flex-1 min-h-[50vh]"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-linear-to-tr from-amber-500/20 to-orange-500/20 rounded-full blur-2xl transform scale-150 opacity-60" />
              <div className="relative bg-background/50 backdrop-blur-sm border border-border/50 p-6 rounded-full shadow-sm ring-1 ring-border/50">
                <CircleAlert
                  className="w-10 h-10 text-muted-foreground/60"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            <h3 className="text-xl font-semibold text-foreground mb-2 tracking-tight">
              No Tracking History
            </h3>
            <p className="text-sm text-muted-foreground max-w-70 leading-relaxed">
              Your custom attendance records will appear here once you start
              tracking.
            </p>
          </m.div>
        </div>

        <TrackingModals
          deleteConfirmOpen={deleteConfirmOpen}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
          deleteAllConfirmOpen={deleteAllConfirmOpen}
          setDeleteAllConfirmOpen={setDeleteAllConfirmOpen}
          selectedCourseFilter={effectiveCourseFilter}
          setSelectedCourseFilter={setSelectedCourseFilter}
          count={count}
          semesterData={semesterData ?? undefined}
          academicYearData={academicYearData ?? undefined}
          activeCourseMeta={activeCourseMeta}
          trackingData={trackingData}
          handleDeleteTrackData={handleDeleteTrackData}
          deleteAllTrackingData={deleteAllTrackingData}
          setCurrentPage={setCurrentPage}
        />
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex-1 container mx-auto max-w-7xl px-4 md:px-6 pt-4 md:pt-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 mb-6 text-left">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Attendance Tracker
            </h1>
            <p className="text-muted-foreground">
              These are custom-marked attendance records or the absences you have marked for re-checking or duty leave.
            </p>
          </div>
          {isSyncing && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-600 dark:text-blue-400 animate-pulse"
            >
              <Loader2 size={12} className="animate-spin" />
              Syncing with EzyGo...
            </m.div>
          )}

          {hasCount && (
            <CourseFilterControls
              selectedCourseFilter={effectiveCourseFilter}
              setSelectedCourseFilter={setSelectedCourseFilter}
              setCurrentPage={setCurrentPage}
              allCourseKeys={allCourseKeys}
              getCourseNameById={getCourseNameById}
              getCourseCodeById={getCourseCodeById}
              isCourseDisabled={isCourseDisabled}
              groupedAllData={groupedAllData}
              count={count}
              setDeleteAllConfirmOpen={setDeleteAllConfirmOpen}
            />
          )}

          {hasCount && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Scroll to end of tracking page"
              className="fixed right-5 bottom-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary shadow-md backdrop-blur-sm transition-colors hover:bg-primary/25 md:right-7 md:bottom-7 dark:border-primary/30 dark:text-primary-foreground"
            >
              <ArrowDown size={18} aria-hidden="true" />
            </button>
          )}

          {showPinnedCourse && activeCourseMeta && (
            <div className="fixed top-22 left-1/2 z-30 flex w-[min(44rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 custom-container px-3 py-2">
              <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                <BookOpen size={16} aria-hidden="true" />
              </div>
              <h3 className="text-left text-sm font-semibold text-foreground/90 capitalize">
                {activeCourseMeta.displayCourseName.toLowerCase()}
              </h3>
              {activeCourseMeta.isDisabled && (
                <Badge className="h-4 border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                  Disabled
                </Badge>
              )}
              <Badge variant="outline" className="ml-auto text-xs">
                {activeCourseMeta.count}
              </Badge>
            </div>
          )}

          <CourseListContainer
            currentCourseKeys={currentCourseKeys}
            groupedAllData={groupedAllData}
            getCourseNameById={getCourseNameById}
            getCourseCodeById={getCourseCodeById}
            isCourseDisabled={isCourseDisabled}
            expandedCourses={expandedCourses}
            recordsPerCourseInitial={recordsPerCourseInitial}
            getStatusKey={getStatusKey}
            attendanceData={attendanceData as AttendanceDataPayload}
            officialSessionsMap={officialSessionsMap as Map<string, AttendanceSessionItem>}
            deleteId={deleteId}
            setDeleteConfirmOpen={setDeleteConfirmOpen}
            getResolvedSessionName={getResolvedSessionName}
            toggleCourseExpansion={toggleCourseExpansion}
            courseHeaderRefs={courseHeaderRefs}
            totalPages={totalPages}
            currentPage={currentPage}
            goToPrevPage={goToPrevPage}
            goToNextPage={goToNextPage}
          />
        </div>
      </div>

      <TrackingModals
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
        deleteAllConfirmOpen={deleteAllConfirmOpen}
        setDeleteAllConfirmOpen={setDeleteAllConfirmOpen}
        selectedCourseFilter={effectiveCourseFilter}
        setSelectedCourseFilter={setSelectedCourseFilter}
        count={count}
        semesterData={semesterData ?? undefined}
        academicYearData={academicYearData ?? undefined}
        activeCourseMeta={activeCourseMeta}
        trackingData={trackingData}
        handleDeleteTrackData={handleDeleteTrackData}
        deleteAllTrackingData={deleteAllTrackingData}
        setCurrentPage={setCurrentPage}
      />
    </LazyMotion>
  );
}
