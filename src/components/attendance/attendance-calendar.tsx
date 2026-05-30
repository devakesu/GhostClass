"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Sparkles,
  Trash2,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendanceReport, AttendanceEvent, Course } from "@/types";
import { ClassCourse } from "@/hooks/courses/useFetchClassCourses";
import { useProfile } from "@/hooks/users/profile";
import { createClient } from "@/lib/supabase/client"; 
import { toast } from "sonner";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useTrackingCount } from "@/hooks/tracker/useTrackingCount";
import { isDutyLeaveConstraintError, getDutyLeaveErrorMessage } from "@/lib/error-handling";
import Link from "next/link";
import { formatSessionName, generateSlotKey, normalizeCourseCode, normalizeSession, toRoman, normalizeToISODate, cn } from "@/lib/utils";
import { isLegacyRemark } from "@/lib/logic/attendance-reconciliation";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useQueryClient } from "@tanstack/react-query";

interface AttendanceCalendarProps {
  attendanceData: AttendanceReport | undefined;
  semester: "even" | "odd" | null | undefined;
  year: string | null | undefined;
  coursesData?: { courses: Record<string, Course> };
  classCourses?: ClassCourse[];
}

interface ExtendedAttendanceEvent extends AttendanceEvent {
  isExtra?: boolean;
  isCorrection?: boolean;
  hasTrackerRecord?: boolean;
  originalStatus?: string;
  remarks?: string;
  rawSession?: string;
  originalSessionId?: string;
}

interface TrackerRecord {
  course: string | number;
  date: string;
  session: string | number;
  status: string;
  attendance: string | number;
  semester?: string | null;
  year?: string | null;
  remarks?: string;
  auth_user_id?: string;
  _isoDate?: string;
}

const getNormalizedSession = (s: string | number) => parseInt(normalizeSession(s), 10) || 0;

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// --- MODULE LEVEL PURE FUNCTIONS FOR COMPLEXITY REDUCTION ---

function computeAcademicRange(semester?: "even" | "odd" | null, year?: string | null) {
  if (!semester || !year) {
    return null;
  }
  try {
    const parts = year.split("-");
    if (parts.length !== 2) {
      return null;
    }
    const startYear = parseInt(parts[0], 10);
    const endYearShort = parseInt(parts[1], 10);
    const endYear = startYear >= 2000 ? (Math.floor(startYear / 100) * 100 + endYearShort) : (2000 + endYearShort);
    
    if (semester === "odd") {
      return {
        min: new Date(startYear, 6, 1),
        max: new Date(startYear, 11, 31, 23, 59, 59),
      };
    } else {
      return {
        min: new Date(endYear, 0, 1),
        max: new Date(endYear, 5, 30, 23, 59, 59),
      };
    }
  } catch {
    return null;
  }
}

function normalizeTrackerRecords(trackingData: unknown[] | undefined, attendanceData: AttendanceReport | undefined): TrackerRecord[] {
  if (!Array.isArray(trackingData)) {
    return [];
  }
  return trackingData.map((item) => {
    const t = item as TrackerRecord;
    let sessionToUse = String(t.session);
    // eslint-disable-next-line security/detect-object-injection
    const resolvedSession = attendanceData?.sessions?.[sessionToUse];
    if (resolvedSession?.name) {
      const normalized = normalizeSession(resolvedSession.name);
      if (!isNaN(parseInt(normalized, 10))) {
        sessionToUse = normalized;
      }
    }
    return { ...t, _isoDate: normalizeToISODate(t.date), session: sessionToUse };
  });
}

function resolveCourseCode(
  id: string,
  coursesData?: { courses: Record<string, Course> },
  classCourses?: ClassCourse[],
  attendanceData?: AttendanceReport
): string {
  const normalizedInput = normalizeCourseCode(id.trim());

  // eslint-disable-next-line security/detect-object-injection
  const dictCourse = coursesData?.courses?.[id];
  if (dictCourse) {
    return normalizeCourseCode(dictCourse.code || id);
  }

  const course = Object.values(coursesData?.courses || {}).find(c => 
    String(c.id) === id || (c.code && normalizeCourseCode(c.code) === normalizedInput)
  );
  if (course?.code) {
    return normalizeCourseCode(course.code);
  }
  
  const custom = classCourses?.find(cc => 
    normalizeCourseCode(cc.course_code) === normalizedInput
  );
  if (custom) {
    return normalizeCourseCode(custom.course_code);
  }

  // eslint-disable-next-line security/detect-object-injection
  const altCourse = attendanceData?.courses?.[id];
  return normalizeCourseCode(altCourse?.code ?? id);
}

function resolveCourseName(
  id: string,
  coursesData?: { courses: Record<string, Course> },
  classCourses?: ClassCourse[],
  attendanceData?: AttendanceReport
): string {
  // eslint-disable-next-line security/detect-object-injection
  const dictCourse = coursesData?.courses?.[id];
  if (dictCourse) {
    return dictCourse.name || id;
  }
  const course = Object.values(coursesData?.courses || {}).find(c => String(c.id) === id);
  if (course?.name) {
    return course.name;
  }

  const normalizedId = normalizeCourseCode(id);
  const custom = classCourses?.find(cc => 
    normalizeCourseCode(cc.course_code) === normalizedId
  );
  if (custom) {
    return custom.course_name || custom.course_code;
  }

  // eslint-disable-next-line security/detect-object-injection
  const altCourse = attendanceData?.courses?.[id];
  return (altCourse?.name ?? "Unknown Course");
}

function resolveSessionName(
  sessionNameStr: string | undefined,
  sessionKey: string,
  index: number,
  attendanceData: AttendanceReport
): string {
  const isNumericId = (s: string) => !isNaN(parseInt(s)) && parseInt(s) > 20;

  if (!sessionNameStr || sessionNameStr === "null" || isNumericId(sessionNameStr)) {
    // eslint-disable-next-line security/detect-object-injection
    const regSession = sessionNameStr ? attendanceData.sessions?.[sessionNameStr] : undefined;
    if (sessionNameStr && isNumericId(sessionNameStr) && regSession) {
      const resolved = regSession.name;
      const normalized = normalizeSession(resolved);
      if (!isNaN(parseInt(normalized, 10))) {
        return normalized;
      }
      return resolved;
    } 
    if (!isNaN(parseInt(sessionKey)) && parseInt(sessionKey) < 20) {
      return sessionKey;
    }
    return String(index + 1); 
  }
  
  // eslint-disable-next-line security/detect-object-injection
  const regSession = attendanceData.sessions?.[sessionNameStr];
  if (regSession) {
    const resolved = regSession.name;
    const normalized = normalizeSession(resolved);
    if (!isNaN(parseInt(normalized, 10))) {
      return normalized;
    }
    return resolved;
  }
  return sessionNameStr || "1";
}

function computeRawEvents(
  attendanceData: AttendanceReport | undefined,
  getCourseCodeById: (id: string) => string,
  getCourseNameById: (id: string) => string
): ExtendedAttendanceEvent[] {
  if (!attendanceData?.studentAttendanceData) {
    return [];
  }
  const events: ExtendedAttendanceEvent[] = [];
  
  Object.entries(attendanceData.studentAttendanceData).forEach(([dateStr, sessions]) => {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    const dateObj = new Date(y, m, d);

    Object.entries(sessions).forEach(([sessionKey, sessionDataObj], index) => {
      const sessionData = sessionDataObj as { course?: string | number | null; session?: string; attendance?: string | number };
      if (sessionData.course == null) {
        return;
      }
      const rawId = String(sessionData.course);
      const courseId = getCourseCodeById(rawId) || rawId;
      const courseName = getCourseNameById(rawId);
      const sessionName = resolveSessionName(sessionData.session, sessionKey, index, attendanceData);

      let attendanceLabel = "Present";
      let statusColor = "emerald";
      const attCode = Number(sessionData.attendance);
      if (attCode === 111) { attendanceLabel = "Absent"; statusColor = "red"; }
      else if (attCode === 225) { attendanceLabel = "Duty Leave"; statusColor = "yellow"; }
      else if (attCode === 112) { attendanceLabel = "Other Leave"; statusColor = "teal"; }

      events.push({ 
        title: courseName, 
        date: dateObj, 
        sessionName, 
        rawSession: sessionName, 
        sessionKey: `${dateStr}-${courseId}-${sessionKey}`, 
        type: "normal", 
        status: attendanceLabel, 
        originalStatus: attendanceLabel, 
        statusColor, 
        courseId, 
        isExtra: false,
        isCorrection: false,
        originalSessionId: String(sessionData.session || sessionKey)
      });
    });
  });
  return events;
}

const formatDateForDB = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function checkEventStatusForDate(
  date: Date,
  rawEvents: ExtendedAttendanceEvent[],
  normalizedTrackingData: TrackerRecord[],
  semester: string | null | undefined,
  year: string | null | undefined,
  isCourseDisabled: (code: string) => boolean,
  getCourseCodeById: (id: string) => string
): string | null {
  const isSameDayLocal = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const dateEvents = rawEvents.filter((event) => isSameDayLocal(event.date, date));
  const dbDateStr = formatDateForDB(date);
  const hasExtra = normalizedTrackingData.some(t =>
     t._isoDate === dbDateStr && t.status === 'extra' && t.semester === semester && t.year === year
  );

  let hasAbsent = false;
  let hasDutyLeave = false;
  let hasOtherLeave = false;

  if (dateEvents.length > 0) {
    dateEvents.forEach(ev => {
      const finalStatus = ev.status;
      if (finalStatus === "Absent" && !isCourseDisabled(getCourseCodeById(ev.courseId))) {
        hasAbsent = true;
      } else if (finalStatus === "Duty Leave") {
        hasDutyLeave = true;
      } else if (finalStatus.includes("Leave")) {
        hasOtherLeave = true;
      }
    });
  } else if (hasExtra) {
    const dayExtras = normalizedTrackingData.filter(t =>
      t._isoDate === dbDateStr && t.status === 'extra' && t.semester === semester && t.year === year
    );
    dayExtras.forEach(t => {
      let label = "Present";
      if (Number(t.attendance) === 111) { label = "Absent"; }
      else if (Number(t.attendance) === 225) { label = "Duty Leave"; }
      
      if (label === "Absent" && !isCourseDisabled(getCourseCodeById(String(t.course)))) {
        hasAbsent = true;
      } else if (label === "Duty Leave") {
        hasDutyLeave = true;
      }
    });
  }

  if (dateEvents.length === 0 && !hasExtra) {
    return null;
  }
  if (hasAbsent) { return "absent"; }
  if (hasDutyLeave) { return "dutyLeave"; }
  if (hasOtherLeave) { return "otherLeave"; }
  return "present";
}

function mapOfficialEventsWithOverrides(
  dayOfficialsRaw: ExtendedAttendanceEvent[],
  normalizedTrackingData: TrackerRecord[],
  dbDateStr: string,
  getCourseCodeById: (id: string) => string
): ExtendedAttendanceEvent[] {
  const officialsMap = new Map<string, ExtendedAttendanceEvent>();
  dayOfficialsRaw.forEach(ev => {
    const key = generateSlotKey(ev.courseId, ev.date, ev.sessionName);
    officialsMap.set(key, { ...ev });
  });
  
  return Array.from(officialsMap.values()).map(ev => {
    const override = normalizedTrackingData.find((t) => {
      const isDateMatch = t._isoDate === dbDateStr;
      const tCourseCode = getCourseCodeById(String(t.course));
      const isCourseMatch = tCourseCode === ev.courseId;
      const tSessionNorm = normalizeSession(t.session);
      const evSessionNorm = normalizeSession(ev.sessionName);
      const isKeyMatch = tSessionNorm === evSessionNorm;
      const isIdMatch = String(t.session) === ev.originalSessionId;
      return isDateMatch && isCourseMatch && (isKeyMatch || isIdMatch);
    });

    if (override) {
      let newStatus = "Present";
      if (Number(override.attendance) === 111) { newStatus = "Absent"; }
      if (Number(override.attendance) === 225) { newStatus = "Duty Leave"; }
      
      return {
        ...ev,
        status: newStatus,
        isCorrection: true, 
        originalStatus: ev.status, 
        remarks: override.remarks,
        hasTrackerRecord: true,
        rawSession: String(override.session)
      };
    }
    return ev;
  });
}

function computeExtraMergedEvents(
  normalizedTrackingData: TrackerRecord[],
  processedEvents: ExtendedAttendanceEvent[],
  semester: string | null | undefined,
  year: string | null | undefined,
  dbDateStr: string,
  selectedDate: Date,
  getCourseCodeById: (id: string) => string,
  getCourseNameById: (id: string) => string
): ExtendedAttendanceEvent[] {
  const extras: ExtendedAttendanceEvent[] = [];
  normalizedTrackingData.forEach((t) => {
    if (t.semester !== semester || t.year !== year) {
      return;
    }
    if (t._isoDate === dbDateStr) {
      const tCourseCode = getCourseCodeById(String(t.course));
      const key = generateSlotKey(tCourseCode, t.date, t.session);
      
      const alreadyMerged = processedEvents.some(ev => 
        generateSlotKey(ev.courseId, ev.date, ev.sessionName) === key
      );

      if (!alreadyMerged && t.status === 'extra') {
        let label = "Present";
        if (Number(t.attendance) === 111) { label = "Absent"; }
        else if (Number(t.attendance) === 225) { label = "Duty Leave"; }
        
        const resolvedName = getCourseNameById(String(t.course));
        
        extras.push({
          title: resolvedName, 
          date: selectedDate, 
          sessionName: String(t.session), 
          rawSession: String(t.session),
          sessionKey: `extra-${tCourseCode}-${t.session}`,
          type: "normal", 
          status: label, 
          statusColor: "emerald", 
          courseId: tCourseCode, 
          isExtra: true, 
          hasTrackerRecord: true,
          remarks: t.remarks,
          originalStatus: "" 
        });
      }
    }
  });
  return extras;
}

function mergeSelectedDateEvents(
  selectedDate: Date | null,
  rawEvents: ExtendedAttendanceEvent[],
  normalizedTrackingData: TrackerRecord[],
  semester: string | null | undefined,
  year: string | null | undefined,
  filter: string,
  getCourseCodeById: (id: string) => string,
  getCourseNameById: (id: string) => string
): ExtendedAttendanceEvent[] {
  if (!selectedDate) {
    return [];
  }
  const isSameDayLocal = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const dbDateStr = formatDateForDB(selectedDate);
  const dayOfficialsRaw = rawEvents.filter((event) => isSameDayLocal(event.date, selectedDate));
  
  const processedEvents = mapOfficialEventsWithOverrides(dayOfficialsRaw, normalizedTrackingData, dbDateStr, getCourseCodeById);
  const extraEvents = computeExtraMergedEvents(
    normalizedTrackingData, processedEvents, semester, year, dbDateStr, selectedDate, getCourseCodeById, getCourseNameById
  );

  let merged = [...processedEvents, ...extraEvents];
  if (filter !== "all") {
    merged = merged.filter(e => 
      e.status.toLowerCase().replace(" ", "") === filter.toLowerCase().replace(" ", "")
    );
  }

  return merged.sort((a, b) => getNormalizedSession(a.sessionName) - getNormalizedSession(b.sessionName));
}

function findDefaultSelectedDate(
  academicRange: { min: Date; max: Date } | null,
  attendanceData: AttendanceReport | undefined,
  trackingData: unknown[] | undefined
): Date | null {
  if (!academicRange) {
    return null;
  }
  let last: Date | null = null;
  if (attendanceData?.studentAttendanceData) {
    const dates = Object.keys(attendanceData.studentAttendanceData).sort((a, b) => b.localeCompare(a));
    for (const d of dates) {
      const dobj = new Date(parseInt(d.substring(0, 4)), parseInt(d.substring(4, 6)) - 1, parseInt(d.substring(6, 8)));
      if (dobj >= academicRange.min && dobj <= academicRange.max) { 
        last = dobj; 
        break; 
      }
    }
  }
  if (Array.isArray(trackingData)) {
    trackingData.forEach((item) => {
      const tRec = item as TrackerRecord;
      if (!tRec.date) { return; }
      const [y, m, d] = tRec.date.split("-").map(Number);
      const dobj = new Date(y, m - 1, d);
      if (dobj >= academicRange.min && dobj <= academicRange.max) {
        if (!last || dobj > last) { 
          last = dobj; 
        }
      }
    });
  }
  return last || academicRange.min;
}

function determineInitialDate(
  academicRange: { min: Date; max: Date } | null,
  attendanceData: AttendanceReport | undefined,
  trackingData: unknown[] | undefined
): Date | null {
  if (!academicRange) {
    return null;
  }
  try {
    const stored = sessionStorage.getItem("selected_date");
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime()) && d >= academicRange.min && d <= academicRange.max) {
        return d;
      }
    }
  } catch { /* ignore */ }

  const now = new Date();
  if (now >= academicRange.min && now <= academicRange.max) {
    return now;
  }

  return findDefaultSelectedDate(academicRange, attendanceData, trackingData);
}

function computeCellClassName(
  status: string | null,
  isSelected: boolean,
  isOutOfRange: boolean,
  isTodayLocal: boolean
): string {
  let baseClass = "h-10 w-10 mx-auto rounded-full flex items-center justify-center text-sm transition-all duration-200 ";
  if (isOutOfRange) {
    return baseClass + "opacity-20 cursor-not-allowed pointer-events-none grayscale";
  }
  baseClass += "cursor-pointer hover:scale-104 ";
  if (isSelected) { 
    baseClass += "bg-primary text-white font-medium shadow-lg scale-110"; 
  } else if (status === "absent") { 
    baseClass += "bg-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/30 border border-red-500/50 dark:border-red-500/30"; 
  } else if (status === "otherLeave") { 
    baseClass += "bg-blue-500/20 text-blue-500 dark:text-blue-400 hover:bg-blue-500/30 border border-blue-500/50 dark:border-blue-500/30"; 
  } else if (status === "dutyLeave") { 
    baseClass += "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/50 dark:border-yellow-500/30"; 
  } else if (status === "present") { 
    baseClass += "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 dark:border-emerald-500/30"; 
  } else if (status === "normal") { 
    baseClass += "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/50 dark:border-indigo-500/30"; 
  } else if (status !== null) { 
    baseClass += "ring-1 ring-gray-500/30 hover:ring-gray-500/50"; 
  } else { 
    baseClass += "hover:bg-accent/50"; 
  }

  if (isTodayLocal) { 
    baseClass += " ring-2 ring-offset-1 ring-offset-background ring-primary"; 
  }
  return baseClass;
}

// --- SUBCOMPONENTS FOR CARD ACTIONS TO REDUCE COMPLEXITY ---

function RenderTrackedActions({
  event,
  dbDate,
  sessionForDB,
  isDeleting,
  onDeleteConfirm
}: {
  event: ExtendedAttendanceEvent;
  dbDate: string;
  sessionForDB: string;
  isDeleting: boolean;
  onDeleteConfirm: (info: string) => void;
}) {
  return (
    <div className="shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
      {event.isCorrection && (
        <Badge variant="outline" className="text-[10px] h-6 px-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/40 dark:border-orange-500/25 gap-1.5">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />Official: {event.originalStatus}
        </Badge>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="View tracking details" asChild>
        <Link href="/tracking"><ArrowUpRight className="w-3 h-3" aria-hidden="true" /></Link>
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-500/10" disabled={isDeleting} onClick={() => onDeleteConfirm(`${event.courseId}|${dbDate}|${sessionForDB}`)} aria-label="Delete record">
        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3 w-3" aria-hidden="true" />}
      </Button>
    </div>
  );
}

function RenderSelfMarkedActions({
  event,
  dbDate,
  sessionForDB,
  isDeleting,
  onDeleteConfirm
}: {
  event: ExtendedAttendanceEvent;
  dbDate: string;
  sessionForDB: string;
  isDeleting: boolean;
  onDeleteConfirm: (info: string) => void;
}) {
  return (
    <div className="shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
      <Badge variant="outline" className="text-[10px] h-6 px-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 dark:border-indigo-500/25 gap-1.5">
        <Sparkles className="w-3 h-3" aria-hidden="true" />Self-Marked
      </Badge>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/10" 
        disabled={isDeleting} 
        onClick={() => onDeleteConfirm(`${event.courseId}|${dbDate}|${sessionForDB}`)} 
        aria-label={`Delete self-marked ${event.status} record for ${event.title} ${event.sessionName}`}
      >
        {isDeleting ? (
          <Loader2 className="h-3 w-3 text-primary animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function RenderAbsentActions({
  isLoading,
  onMarkAction
}: {
  isLoading: boolean;
  onMarkAction: (targetStatus: number, title: string, placeholder: string, defaultRemark: string) => void;
}) {
  return (
    <div className="shrink-0 w-full sm:w-auto">
      <div className="flex flex-row gap-2 w-full">
        <Button 
          variant="outline" 
          size="sm" 
          disabled={isLoading} 
          onClick={() => onMarkAction(225, "Duty Leave Reason", "Programme/Activity Name", "Duty Leave")} 
          className={cn(
            "flex-1 h-auto min-h-8 py-1.5 text-xs gap-1.5 border-dashed transition-all",
            isLoading 
              ? "opacity-70 cursor-wait" 
              : "border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 hover:border-yellow-500 hover:text-yellow-700 dark:border-yellow-500/70 dark:text-yellow-400 dark:hover:text-yellow-300"
          )}
        >
          {isLoading ? "..." : <><Briefcase className="w-3 h-3 shrink-0" aria-hidden="true"/><span>Mark DL</span></>}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          disabled={isLoading} 
          onClick={() => onMarkAction(110, "Correction Remark", "Incorrectly marked absent", "Incorrectly marked absent")} 
          className={cn(
            "flex-1 h-auto min-h-8 py-1.5 text-xs gap-1.5 border-dashed transition-all",
            isLoading 
              ? "opacity-70 cursor-wait" 
              : "border-green-500 text-green-600 hover:bg-green-500/10 hover:border-green-500 hover:text-green-700 dark:border-green-500/70 dark:text-green-400 dark:hover:text-green-300"
          )}
        >
          {isLoading ? "..." : <><CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" /><span>Mark Present</span></>}
        </Button>
      </div>
    </div>
  );
}

/**
 * Interactive attendance calendar component for viewing and managing attendance records.
 * Displays monthly view with color-coded attendance events, filtering, and record management.
 */
export function AttendanceCalendar({
  attendanceData,
  semester,
  year,
  coursesData,
  classCourses,
}: AttendanceCalendarProps) {
  const [currentDate, setCurrentDate] = useState<{ year: number | null; month: number | null }>({ 
    year: null, 
    month: null 
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [pendingRemarkAction, setPendingRemarkAction] = useState<{ 
    courseId: string; 
    dbDate: string; 
    sessionForDB: string; 
    buttonKey: string;
    targetStatus: number;
    title: string;
    description: string;
    placeholder: string;
    defaultRemark: string;
  } | null>(null);
  const clickedButtons = useRef<Set<string>>(new Set());

  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const { refetch: refetchCount } = useTrackingCount(profile);
  const { data: trackingData, refetch: refetchTrackData } = useTrackingData(profile);

  const academicRange = useMemo(() => {
    return computeAcademicRange(semester, year);
  }, [semester, year]);

  const normalizedTrackingData = useMemo(() => {
    return normalizeTrackerRecords(trackingData, attendanceData);
  }, [trackingData, attendanceData]);

  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const { isDisabled: isCourseDisabled } = useDisabledCourses({
    academicYear: year,
    semester: semester,
  });

  const getCourseCodeById = useCallback((id: string): string => {
    return resolveCourseCode(id, coursesData, classCourses, attendanceData);
  }, [attendanceData, coursesData, classCourses]);

  const getCourseNameById = useCallback((id: string): string => {
    return resolveCourseName(id, coursesData, classCourses, attendanceData);
  }, [attendanceData, coursesData, classCourses]);

  useEffect(() => {
    const getAuthId = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        setAuthUserId(data.session.user.id);
      }
    };
    getAuthId();
  }, []);

  const [prevTermKey, setPrevTermKey] = useState<string | null>(null);
  const currentTermKey = `${semester}-${year}`;

  // Use useEffect to initialize date selection cleanly
  useEffect(() => {
    if (academicRange && semester && year && prevTermKey !== currentTermKey) {
      const initDate = determineInitialDate(academicRange, attendanceData, trackingData);
      if (initDate) {
        queueMicrotask(() => {
          setCurrentDate({ year: initDate.getFullYear(), month: initDate.getMonth() });
          setSelectedDate(initDate);
          setPrevTermKey(currentTermKey);
        });
      }
    }
  }, [academicRange, semester, year, prevTermKey, currentTermKey, attendanceData, trackingData]);

  const handleDeleteTrackData = async (session: string, course: string, date: string) => {
    const sNum = getNormalizedSession(session);
    const buttonKey = `delete-${course}-${sNum}-${date}`;
    setLoadingStates((prev) => ({ ...prev, [buttonKey]: true }));
    
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('tracker')
        .delete()
        .match({ session, course, date })
        .eq('auth_user_id', authUserId);

      if (error) { throw error; }
      toast.success("Record deleted");
      
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
      
      await Promise.all([refetchTrackData(), refetchCount()]); 
    } catch {
      toast.error(
        "We encountered an error while deleting this record. Please try again later. If the issue persists, please contact us.",
      );
    } finally { 
      setLoadingStates((prev) => ({ ...prev, [buttonKey]: false })); 
    }
  };

  const handleWriteTracking = async (
    courseId: string, dateStr: string, status: string, sessionName: string, attendanceCode: number, remarks: string | null
  ) => {
    const sNum = getNormalizedSession(sessionName);
    const buttonKey = `${courseId}-${dateStr}-${sNum}`;
    
    setLoadingStates((prev) => ({ ...prev, [buttonKey]: true }));
    
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('tracker')
        .insert({ 
          auth_user_id: authUserId, 
          course: courseId, 
          date: dateStr, 
          status, 
          session: sessionName, 
          semester, 
          year, 
          attendance: attendanceCode, 
          remarks 
        });

      if (error) {
        if (isDutyLeaveConstraintError(error)) {
          toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
          return;
        }
        throw error;
      }
      toast.success("Added to tracking");
      
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
      
      await refetchTrackData(); 
      await refetchCount();
    } catch (error) { 
      if (isDutyLeaveConstraintError(error)) {
        toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
        return;
      } 
      toast.error(
        "We encountered an error while adding this record. Please try again later. If the issue persists, please contact us.",
      );
      Sentry.captureException(error, { 
        tags: { type: "tracking_add_error", location: "AttendanceCalendar/handleWriteTracking" }, 
        extra: { courseId, dateStr, status, sessionName, attendanceCode, remarks } 
      });
    } finally { 
      setLoadingStates((prev) => ({ ...prev, [buttonKey]: false })); 
      clickedButtons.current?.delete(buttonKey); 
    }
  };

  const handleRemarkConfirm = () => {
    if (pendingRemarkAction && authUserId) {
      handleWriteTracking(
        pendingRemarkAction.courseId,
        pendingRemarkAction.dbDate,
        "correction",
        pendingRemarkAction.sessionForDB,
        pendingRemarkAction.targetStatus,
        remark.trim() || null
      );
    }
    setRemarkDialogOpen(false);
    setRemark("");
    setPendingRemarkAction(null);
  };

  const handleRemarkCancel = () => {
    if (pendingRemarkAction) {
      clickedButtons.current?.delete(pendingRemarkAction.buttonKey);
    }
    setRemarkDialogOpen(false);
    setRemark("");
    setPendingRemarkAction(null);
  };

  const rawEvents = useMemo(() => {
    return computeRawEvents(attendanceData, getCourseCodeById, getCourseNameById);
  }, [attendanceData, getCourseCodeById, getCourseNameById]);

  const getDaysInMonth = useCallback((year: number, month: number) => new Date(year, month + 1, 0).getDate(), []);
  const getFirstDayOfMonth = useCallback((year: number, month: number) => new Date(year, month, 1).getDay(), []);
  const isSameDay = useCallback((d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(), []);
  const isToday = useCallback((d: Date) => isSameDay(d, new Date()), [isSameDay]);

  const handlePreviousMonth = () => { 
    if (currentDate.month === null || currentDate.year === null) {
      toast.info("Calendar is still loading. Please wait...");
      return;
    }
    if (academicRange) {
      const prevDate = new Date(currentDate.year, currentDate.month - 1, getDaysInMonth(currentDate.year, currentDate.month - 1));
      if (prevDate < academicRange.min) {
        toast.info(`Start of ${semester} semester reached.`);
        return;
      }
    }
    setCurrentDate(prev => {
      if (prev.month === null || prev.year === null) { return prev; }
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      } else {
        return { year: prev.year, month: prev.month - 1 };
      }
    });
  };

  const handleNextMonth = () => { 
    if (currentDate.month === null || currentDate.year === null) {
      toast.info("Calendar is still loading. Please wait...");
      return;
    }
    if (academicRange) {
      const nextDate = new Date(currentDate.year, currentDate.month + 1, 1);
      if (nextDate > academicRange.max) {
        toast.info(`End of ${semester} semester reached.`);
        return;
      }
    }
    setCurrentDate(prev => {
      if (prev.month === null || prev.year === null) { return prev; }
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      } else {
        return { year: prev.year, month: prev.month + 1 };
      }
    });
  };

  const goToToday = () => { 
    const t = new Date(); 
    setCurrentDate({ year: t.getFullYear(), month: t.getMonth() }); 
    setSelectedDate(t); 
  };
  
  const handleMonthChange = (value: string) => {
    setCurrentDate(prev => {
      if (prev.month === null || prev.year === null) { return prev; }
      return { ...prev, month: parseInt(value, 10) };
    });
  };
  
  const handleYearChange = (value: string) => {
    const newYear = parseInt(value, 10);
    if (newYear >= 2018) {
      setCurrentDate(prev => {
        if (prev.month === null || prev.year === null) { return prev; }
        return { ...prev, year: newYear };
      });
    }
  };

  const getEventStatus = useCallback((date: Date): string | null => {
    return checkEventStatusForDate(date, rawEvents, normalizedTrackingData, semester, year, isCourseDisabled, getCourseCodeById);
  }, [rawEvents, normalizedTrackingData, semester, year, isCourseDisabled, getCourseCodeById]);

  const selectedDateEvents = useMemo(() => {
    return mergeSelectedDateEvents(
      selectedDate, rawEvents, normalizedTrackingData, semester, year, filter, getCourseCodeById, getCourseNameById
    );
  }, [selectedDate, rawEvents, normalizedTrackingData, semester, year, filter, getCourseCodeById, getCourseNameById]);
  
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  const monthOptions = useMemo(() => {
    return monthNames.map((name, index) => {
      const isDisabled = academicRange && currentDate.year !== null ? 
        (new Date(currentDate.year, index, 1) > academicRange.max || 
         new Date(currentDate.year, index, getDaysInMonth(currentDate.year, index)) < academicRange.min) : 
        false;
      return { name, index, isDisabled };
    });
  }, [academicRange, currentDate.year, getDaysInMonth]);

  const yearOptions = useMemo(() => {
    const baseYears = Array.from({ length: new Date().getFullYear() + 1 - 2018 + 1 }, (_, i) => 2018 + i);
    return baseYears.map(y => {
      const isDisabled = academicRange ? 
        (new Date(y, 0, 1) > academicRange.max || 
         new Date(y, 11, 31) < academicRange.min) : 
        false;
      return { year: y, isDisabled };
    });
  }, [academicRange]);
  
  const calendarCells = useMemo(() => {
    if (!selectedDate || currentDate.year === null || currentDate.month === null) { return []; }
    
    const cYear = currentDate.year;
    const cMonth = currentDate.month;
    
    const daysInMonth = getDaysInMonth(cYear, cMonth);
    const firstDayOfMonth = getFirstDayOfMonth(cYear, cMonth);
    const leadingEmptyCells = Array(firstDayOfMonth).fill(null).map((_, index) => (
      <div key={`empty-leading-${index}`} className="h-10 w-full" />
    ));
    
    const dayCells = Array(daysInMonth).fill(null).map((_, index) => {
      const date = new Date(cYear, cMonth, index + 1);
      const status = getEventStatus(date);
      const isSelected = isSameDay(date, selectedDate);
      const isOutOfRange = academicRange ? (date < academicRange.min || date > academicRange.max) : false;
      const isTodayLocal = isToday(date);

      const className = computeCellClassName(status, isSelected, isOutOfRange, isTodayLocal);
      
      const handleDateSelect = () => {
        const dateString = date.toISOString();
        sessionStorage.setItem("selected_date", dateString);
        setSelectedDate(date);
        setCurrentDate({ month: date.getMonth(), year: date.getFullYear() });
      };
      
      const statusSuffix = status ? `, ${status}` : '';
      const selectSuffix = isSelected ? ', selected' : '';
      const dateLabel = `${monthNames[date.getMonth()]} ${index + 1}, ${date.getFullYear()}${selectSuffix}${statusSuffix}`;
      
      return (
        <div key={`day-${index}`} className="flex items-center justify-center">
          <button 
            type="button"
            onClick={isOutOfRange ? undefined : handleDateSelect}
            className={className}
            aria-label={dateLabel}
            aria-current={isSelected ? "date" : undefined}
            disabled={isOutOfRange}
          >
            {index + 1}
          </button>
        </div>
      );
    });
    return [...leadingEmptyCells, ...dayCells];
  }, [currentDate.year, currentDate.month, selectedDate, getDaysInMonth, getFirstDayOfMonth, getEventStatus, isSameDay, isToday, academicRange]);

  const isTodayInRange = useMemo(() => {
    if (!academicRange) { return true; }
    const now = new Date();
    return now >= academicRange.min && now <= academicRange.max;
  }, [academicRange]);

  if (currentDate.year === null || currentDate.month === null || !selectedDate) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden border border-border/40 custom-container h-full flex flex-col items-center justify-center min-h-100">
          <div className="text-muted-foreground">Loading your calendar...</div>
        </Card>
        <Card className="border border-border/40 custom-container">
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Waking up EzyGo...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const shouldShowJumpToToday = selectedDate && !isToday(selectedDate) && isTodayInRange;

  const renderEventCardActions = (event: ExtendedAttendanceEvent, dbDate: string, sNum: number, sessionForDB: string) => {
    const buttonKey = `${event.courseId}-${dbDate}-${sNum}`;
    const deleteKey = `delete-${event.courseId}-${sNum}-${dbDate}`;
    // eslint-disable-next-line security/detect-object-injection
    const isDeleting = loadingStates[deleteKey];
    // eslint-disable-next-line security/detect-object-injection
    const isLoading = loadingStates[buttonKey];

    const handleDeleteClick = (info: string) => {
      setDeleteConfirmOpen(info);
    };

    const handleMarkActionClick = (targetStatus: number, title: string, placeholder: string, defaultRemark: string) => {
      if (!authUserId || clickedButtons.current?.has(buttonKey)) { return; } 
      clickedButtons.current?.add(buttonKey); 
      setPendingRemarkAction({ 
        courseId: event.courseId, 
        dbDate, 
        sessionForDB, 
        buttonKey, 
        targetStatus, 
        title, 
        description: `Enter a remark for marking this session as ${defaultRemark}.`, 
        placeholder, 
        defaultRemark 
      }); 
      setRemark(targetStatus === 110 ? "Incorrectly marked absent" : ""); 
      setRemarkDialogOpen(true); 
    };

    if (event.isExtra) {
      return (
        <RenderSelfMarkedActions 
          event={event} 
          dbDate={dbDate} 
          sessionForDB={sessionForDB} 
          isDeleting={isDeleting} 
          onDeleteConfirm={handleDeleteClick} 
        />
      );
    }

    const hasTracking = event.isCorrection || (event.hasTrackerRecord && !event.isExtra);
    if (hasTracking) {
      return (
        <RenderTrackedActions 
          event={event} 
          dbDate={dbDate} 
          sessionForDB={sessionForDB} 
          isDeleting={isDeleting} 
          onDeleteConfirm={handleDeleteClick} 
        />
      );
    }
    
    if (event.status === "Absent") {
      return (
        <RenderAbsentActions 
          isLoading={isLoading} 
          onMarkAction={handleMarkActionClick} 
        />
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="overflow-hidden border border-border/40 custom-container h-full flex flex-col">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-center sm:justify-between gap-2 border-b border-border/40">
          <div className="flex items-center gap-2 max-sm:contents">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32.5 h-9 bg-background/60 border-border/60 text-sm capitalize custom-dropdown" aria-label="Filter attendance by status">
                <SelectValue>{filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background/90 border-border/60 backdrop-blur-md custom-dropdown max-h-70">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="dutyLeave">Duty Leave</SelectItem>
                <SelectItem value="otherLeave">Other Leave</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currentDate.month.toString()} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-32.5 h-9 bg-background/60 border-border/60 text-sm capitalize custom-dropdown" aria-label="Select month">
                <SelectValue>{monthOptions[currentDate.month].name}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background/90 border-border/60 backdrop-blur-md custom-dropdown max-h-70">
                {monthOptions.map((option) => (
                  <SelectItem key={option.name} value={option.index.toString()} disabled={option.isDisabled} className={currentDate.month === option.index ? "bg-foreground/5 mt-0.5" : "capitalize"}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currentDate.year.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-22.5 h-9 bg-background/60 border-border/60 text-sm custom-dropdown" aria-label="Select year">
                <SelectValue>{currentDate.year}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background/90 border-border/60 max-h-70 backdrop-blur-md custom-dropdown">
                {yearOptions.map((option) => (
                  <SelectItem key={option.year} value={option.year.toString()} disabled={option.isDisabled} className={currentDate.year === option.year ? "bg-foreground/5 mt-0.5" : "mt-0.5"}>
                    {option.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePreviousMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center" aria-label="Previous month" >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 flex-1 flex flex-col h-full">
          <div className="grid grid-cols-7 mb-2 shrink-0">
            {daysOfWeek.map((day, index) => (
              <div key={index} className="text-xs font-medium text-muted-foreground text-center py-2">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 pb-2 flex-1 auto-rows-[1fr]" style={{ gridAutoRows: '1fr' }}>
            {calendarCells}
          </div>
          <div className="flex flex-wrap gap-4 mt-6 text-muted-foreground text-xs justify-center border-t border-border/40 pt-4 shrink-0">
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/30" /><span>absent</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-blue-500/20 border border-blue-500/30" /><span>other leave</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/30" /><span>duty leave</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-emerald-500/20 border border-emerald-500/30" /><span>present</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full ring-2 ring-primary ring-offset-1" /><span>today</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/40 shadow-sm bg-card/50 flex flex-col h-full">
        <CardHeader className="border-b border-border/40 py-4 px-6 bg-muted/20">
          <CardTitle className="text-sm flex items-center justify-between font-semibold">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div id="selected-date-label" className="flex flex-col leading-tight">
                <span className="font-semibold">{selectedDate.toLocaleDateString("en-US", { weekday: "long" })}</span>
                <span className="text-sm font-normal text-muted-foreground">{selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
              </div>
            </div>
            <Badge variant="secondary" className="font-normal text-xs bg-background/80" aria-label={`${selectedDateEvents.length} attendance sessions`}>
              {selectedDateEvents.length} Sessions
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col" role="region" aria-labelledby="selected-date-label" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={selectedDate.toString()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col">
              {selectedDateEvents.length > 0 ? (
                <div className="flex flex-col gap-5 p-4">
                  {selectedDateEvents.map((event, index) => {
                    let badgeClass = "text-muted-foreground border-border";
                    let Icon = Clock;
                    let cardStyle = "border-border/40 bg-card hover:bg-accent/30 hover:border-border/60";
                    if (event.status === "Present") {
                      badgeClass = "text-green-500 border-green-500/40 bg-green-500/10";
                      Icon = CheckCircle2;
                      cardStyle = "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500";
                    } else if (event.status === "Absent") {
                      badgeClass = "text-red-500 border-red-500/40 bg-red-500/10";
                      Icon = AlertCircle;
                      cardStyle = "border-red-500/50 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500";
                    } else if (event.status === "Duty Leave") {
                      badgeClass = "text-yellow-500 border-yellow-500/40 bg-yellow-500/10";
                      cardStyle = "border-yellow-500/50 bg-yellow-500/5 hover:bg-yellow-500/10 hover:border-yellow-500";
                    } else if (event.status.includes("Leave")) {
                      badgeClass = "text-blue-500 border-blue-500/40 bg-blue-500/10";
                      cardStyle = "border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500";
                    }

                    const dbDate = formatDateForDB(selectedDate);
                    const sNum = getNormalizedSession(event.rawSession || event.sessionName);
                    const sessionForDB = toRoman(sNum); 

                    return (
                      <motion.div key={`event-${event.sessionKey}-${index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={cn("group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all gap-4", cardStyle)}>
                        <div className="flex flex-col gap-1.5">
                          <h3 className="font-semibold text-sm text-foreground leading-tight capitalize flex items-center gap-2">{event.title.toLowerCase()}</h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="bg-background/50 px-1.5 py-0.5 rounded border border-border/50">{event.sessionName ? formatSessionName(event.sessionName) : `Session ${event.sessionKey}`}</span>
                            <Badge variant="outline" className={cn("h-5 px-1.5 gap-1 font-medium", badgeClass)}>
                              <Icon className="w-3 h-3" aria-hidden="true" />{event.status}
                            </Badge>
                            {isCourseDisabled(getCourseCodeById(event.courseId)) && (
                              <Badge variant="outline" className="h-5 px-1.5 gap-1 font-medium text-gray-500 border-gray-500/40 bg-gray-500/10">Disabled</Badge>
                            )}
                          </div>
                          {event.remarks && !isLegacyRemark(event.remarks) && (
                            <p className={cn(
                              "text-[11px] italic truncate max-w-50 sm:max-w-xs mt-1",
                              event.status === "Duty Leave"
                                ? "text-yellow-600/80 dark:text-yellow-400/80"
                                : "text-muted-foreground/80"
                            )}>
                              {event.remarks.trim()}
                            </p>
                          )}
                        </div>
                        {renderEventCardActions(event, dbDate, sNum, sessionForDB)}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
                  <div className="rounded-full bg-accent/30 p-4 mb-3 ring-1 ring-border/50"><CalendarIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" /></div>
                  <h3 className="text-sm font-semibold text-foreground">No classes recorded for this day.</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-50">Enjoy your free time!</p>
                  {shouldShowJumpToToday && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToToday}>Jump to Today</Button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
      
      <AlertDialog open={!!deleteConfirmOpen} onOpenChange={(open) => { if (!open) { setDeleteConfirmOpen(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tracking record? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteConfirmOpen) {
                  const [course, date, session] = deleteConfirmOpen.split('|');
                  await handleDeleteTrackData(session, course, date);
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

      <Dialog open={remarkDialogOpen} onOpenChange={(open) => { if (!open) { handleRemarkCancel(); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingRemarkAction?.title || "Add Remark"}</DialogTitle>
            <DialogDescription>
              {pendingRemarkAction?.description || "Enter a remark for this action."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="remark-calendar" className="text-sm mb-1.5 block">Remark (Optional)</Label>
            <Input
              id="remark-calendar"
              placeholder={pendingRemarkAction?.placeholder || "Enter remark..."}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { handleRemarkConfirm(); } }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleRemarkCancel}>Cancel</Button>
            <Button 
              onClick={handleRemarkConfirm} 
              className={cn(
                "text-white",
                pendingRemarkAction?.targetStatus === 225 
                  ? "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700"
                  : "bg-green-600 hover:bg-green-700"
              )}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}