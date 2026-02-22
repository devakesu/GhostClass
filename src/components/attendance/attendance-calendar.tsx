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
import { AttendanceReport, AttendanceEvent } from "@/types/attendance";
import { useUser } from "@/hooks/users/user";
import { createClient } from "@/lib/supabase/client"; 
import { toast } from "sonner";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useFetchSemester, useFetchAcademicYear } from "@/hooks/users/settings";
import { useTrackingCount } from "@/hooks/tracker/useTrackingCount";
import { useFetchCourses } from "@/hooks/courses/courses";
import { isDutyLeaveConstraintError, getDutyLeaveErrorMessage } from "@/lib/error-handling";
import Link from "next/link";
import { formatSessionName, generateSlotKey, normalizeSession, toRoman, normalizeToISODate } from "@/lib/utils";

interface AttendanceCalendarProps {
  attendanceData: AttendanceReport | undefined;
}

interface ExtendedAttendanceEvent extends AttendanceEvent {
  isExtra?: boolean;
  isCorrection?: boolean;
  hasTrackerRecord?: boolean;
  originalStatus?: string;
  remarks?: string;
  rawSession?: string;
}

const getNormalizedSession = (s: string | number) => parseInt(normalizeSession(s), 10) || 0;

/**
 * Interactive attendance calendar component for viewing and managing attendance records.
 * Displays monthly view with color-coded attendance events, filtering, and record management.
 * 
 * @param attendanceData - Attendance report data containing courses, sessions, and records
 * @returns Calendar view with attendance events and management features
 * 
 * Features:
 * - Monthly calendar view with navigation
 * - Color-coded attendance status (present, absent, on-duty)
 * - Filter by course or status
 * - Add/delete attendance records
 * - Automatic sync with tracking data
 * - Optimistic UI updates
 * 
 * @example
 * ```tsx
 * <AttendanceCalendar attendanceData={reportData} />
 * ```
 */
export function AttendanceCalendar({
  attendanceData,
}: AttendanceCalendarProps) {
  const [currentDate, setCurrentDate] = useState<{ year: number | null; month: number | null }>({ 
    year: null, 
    month: null 
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  const clickedButtons = useRef<Set<string>>(new Set());

  // Initialize dates on mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const dateSelected = sessionStorage.getItem("selected_date");
      if (dateSelected) {
        const parsedDate = new Date(dateSelected);
        setSelectedDate(parsedDate);
        setCurrentDate({ month: parsedDate.getMonth(), year: parsedDate.getFullYear() });
      } else {
        const now = new Date();
        setCurrentDate({ year: now.getFullYear(), month: now.getMonth() });
        setSelectedDate(now);
      }
    } catch (error) {
      // Fallback if sessionStorage is unavailable or throws
      Sentry.captureException(error);
      const now = new Date();
      setCurrentDate({ year: now.getFullYear(), month: now.getMonth() });
      setSelectedDate(now);
    }
  }, []);

  const { data: semester } = useFetchSemester();
  const { data: year } = useFetchAcademicYear();
  const { data: user } = useUser(); 
  const { refetch: refetchCount } = useTrackingCount(user);
  const { data: trackingData, refetch: refetchTrackData } = useTrackingData(user);

  // Pre-normalize all tracker dates once so find()/some() callbacks are O(1) per item
  // rather than calling normalizeToISODate() on every trackingData item for every calendar
  // event on every render. Without this the hot path is O(events × trackingData). (L-D)
  const normalizedTrackingData = useMemo(
    () => (trackingData ?? []).map(t => ({ ...t, _isoDate: normalizeToISODate(t.date) })),
    [trackingData]
  );

  const { data: coursesData } = useFetchCourses(); 
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();

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

  const formatDateForDB = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

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

        if (error) throw error;
        toast.success("Record deleted");
        await Promise.all([refetchTrackData(), refetchCount()]); 
      } catch (error: any) {
        toast.error("Error deleting: " + error.message);
      } finally { 
        setLoadingStates((prev) => ({ ...prev, [buttonKey]: false })); 
      }
  };

  const handleWriteTracking = async (
    courseId: string, dateStr: string, status: string, sessionName: string, attendanceCode: number, remarks: string
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
          // Check for duty leave constraint violation
          if (isDutyLeaveConstraintError(error)) {
            toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
            return;
          }
          throw error;
        }
        toast.success("Added to tracking", { style: { backgroundColor: "rgba(34, 197, 94, 0.1)", color: "rgb(74, 222, 128)", border: "1px solid rgba(34, 197, 94, 0.2)", backdropFilter: "blur(5px)" } });
        await refetchTrackData(); 
        await refetchCount();
      } catch (error: any) { 
        // Check for duty leave constraint violation in catch block as well
        if (isDutyLeaveConstraintError(error)) {
          toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
          // Expected business constraint violation; do not report to Sentry
          return;
        } 
        toast.error("Failed to add record");
        Sentry.captureException(error, { tags: { type: "tracking_add_error", location: "AttendanceCalendar/handleWriteTracking" }, extra: { courseId, dateStr, status, sessionName, attendanceCode, remarks } });
      } finally { 
        setLoadingStates((prev) => ({ ...prev, [buttonKey]: false })); 
        clickedButtons.current?.delete(buttonKey); 
      }
  };

  // --- 1. PARSE OFFICIAL API DATA ---
  const rawEvents = useMemo(() => {
    if (!attendanceData?.studentAttendanceData) return [];
    const events: ExtendedAttendanceEvent[] = [];
    
    Object.entries(attendanceData.studentAttendanceData).forEach(([dateStr, sessions]) => {
        const y = parseInt(dateStr.substring(0, 4), 10);
        const m = parseInt(dateStr.substring(4, 6), 10) - 1;
        const d = parseInt(dateStr.substring(6, 8), 10);
        const dateObj = new Date(y, m, d);

        Object.entries(sessions).forEach(([sessionKey, sessionData]: [string, any], index) => {
            if (!sessionData.course) return;
            const courseId = sessionData.course.toString();
            const courseName = attendanceData.courses?.[courseId]?.name || coursesData?.courses?.[courseId].name || "Unknown Course";

            let sessionName = sessionData.session;
            if (!sessionName || sessionName === "null") {
               if (!isNaN(parseInt(sessionKey)) && parseInt(sessionKey) < 20) {
                   sessionName = sessionKey;
               } else {
                   sessionName = String(index + 1); 
               }
            }

            let attendanceLabel = "Present";
            let statusColor = "blue";
            switch (Number(sessionData.attendance)) {
                case 110: attendanceLabel = "Present"; statusColor = "blue"; break;
                case 111: attendanceLabel = "Absent"; statusColor = "red"; break;
                case 225: attendanceLabel = "Duty Leave"; statusColor = "yellow"; break;
                case 112: attendanceLabel = "Other Leave"; statusColor = "teal"; break;
            }

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
                isCorrection: false 
            });
        });
    });
    return events;
  }, [attendanceData, coursesData]);

  const handlePreviousMonth = () => { 
    // If the calendar is still initializing, provide feedback instead of appearing unresponsive
    if (currentDate.month === null || currentDate.year === null) {
      toast.info("Calendar is still loading. Please wait...");
      return;
    }

    setCurrentDate(prev => {
      // Guard against null values to satisfy TypeScript strict null checks
      if (prev.month === null || prev.year === null) return prev;
      
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      } else {
        return { year: prev.year, month: prev.month - 1 };
      }
    });
  };
  const handleNextMonth = () => { 
    // If the calendar is still initializing, provide feedback instead of appearing unresponsive
    if (currentDate.month === null || currentDate.year === null) {
      toast.info("Calendar is still loading. Please wait...");
      return;
    }

    setCurrentDate(prev => {
      // Guard against null values to satisfy TypeScript strict null checks
      if (prev.month === null || prev.year === null) return prev;
      
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
      // Guard against null values (matches pattern in handlePreviousMonth/handleNextMonth)
      if (prev.month === null || prev.year === null) return prev;
      return { ...prev, month: parseInt(value, 10) };
    });
  };
  
  const handleYearChange = (value: string) => {
    const newYear = parseInt(value, 10);
    if (newYear >= 2018) {
      setCurrentDate(prev => {
        // Guard against null values (matches pattern in handlePreviousMonth/handleNextMonth)
        if (prev.month === null || prev.year === null) return prev;
        return { ...prev, year: newYear };
      });
    }
  };
  
  const getDaysInMonth = useCallback((year: number, month: number) => new Date(year, month + 1, 0).getDate(), []);
  const getFirstDayOfMonth = useCallback((year: number, month: number) => new Date(year, month, 1).getDay(), []);
  const isSameDay = useCallback((d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(), []);
  const isToday = useCallback((d: Date) => isSameDay(d, new Date()), [isSameDay]);

  // Dot status logic
  const getEventStatus = useCallback((date: Date): string | null => {
      const dateEvents = rawEvents.filter((event) => isSameDay(event.date, date));
      const dbDateStr = formatDateForDB(date);
      const hasExtra = normalizedTrackingData.some(t =>
         t._isoDate === dbDateStr && t.status === 'extra' && t.semester === semesterData && t.year === academicYearData
      );

      let hasAbsent = false;
      let hasLeave = false;

      dateEvents.forEach(ev => {
          const key = generateSlotKey(ev.courseId, date, ev.sessionName);
          const override = normalizedTrackingData.find(t =>
             t._isoDate === dbDateStr && generateSlotKey(t.course, t._isoDate, t.session) === key
          );

          let finalStatus = ev.status;
          if (override) {
             if (Number(override.attendance) === 111) finalStatus = "Absent";
             else if (Number(override.attendance) === 225) finalStatus = "Duty Leave";
             else finalStatus = "Present";
          }

          if (finalStatus === "Absent") hasAbsent = true;
          else if (finalStatus.includes("Leave")) hasLeave = true;
      });

      if (dateEvents.length === 0 && !hasExtra) return null;
      if (hasAbsent) return "absent";
      if (hasLeave) return "dutyLeave";
      return "present";
  }, [rawEvents, isSameDay, normalizedTrackingData, semesterData, academicYearData]);

  // --- 2. MERGE LOGIC ---
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    
    const dbDateStr = formatDateForDB(selectedDate);
    const dayOfficialsRaw = rawEvents.filter((event) => isSameDay(event.date, selectedDate));
    
    // 1. Deduplicate Officials (Last Write Wins per Course+Session)
    const officialsMap = new Map<string, ExtendedAttendanceEvent>();
    dayOfficialsRaw.forEach(ev => {
        const key = generateSlotKey(ev.courseId, selectedDate, ev.sessionName);
        officialsMap.set(key, { ...ev });
    });
    
    // 2. Process Official Events
    const processedEvents = Array.from(officialsMap.values()).map(ev => {
        const key = generateSlotKey(ev.courseId, selectedDate, ev.sessionName);

        const override = normalizedTrackingData.find(t => {
            const isDateMatch = t._isoDate === dbDateStr;
            const isKeyMatch = generateSlotKey(t.course, t._isoDate, t.session) === key;
            return isDateMatch && isKeyMatch;
        });

        if (override) {
            let newStatus = "Present";
            if (Number(override.attendance) === 111) newStatus = "Absent";
            if (Number(override.attendance) === 225) newStatus = "Duty Leave";
            
            return {
                ...ev,
                status: newStatus,
                isCorrection: true, 
                originalStatus: ev.status, 
                remarks: override.remarks,
                hasTrackerRecord: true,
                rawSession: override.session
            };
        }
        return ev;
    });

    // 3. Process Extras
    if (normalizedTrackingData.length > 0) {
        normalizedTrackingData.forEach(t => {

            if (t.semester !== semesterData || t.year !== academicYearData) {
              return;
            }

            if (t._isoDate === dbDateStr) {
                const key = generateSlotKey(t.course, t.date, t.session);
                
                const alreadyMerged = processedEvents.some(ev => 
                    generateSlotKey(ev.courseId, ev.date, ev.sessionName) === key
                );

                if (!alreadyMerged && t.status === 'extra') {
                    let label = "Present";
                    if (t.attendance === 111) label = "Absent";
                    else if (t.attendance === 225) label = "Duty Leave";
                    
                    const cId = t.course.toString();
                    const resolvedName = attendanceData?.courses?.[cId]?.name || coursesData?.courses?.[cId]?.name || t.course;
                    
                    processedEvents.push({
                        title: resolvedName, 
                        date: selectedDate, 
                        sessionName: t.session, 
                        rawSession: t.session,
                        sessionKey: `extra-${cId}-${t.session}`,
                        type: "normal", 
                        status: label, 
                        statusColor: "blue", 
                        courseId: cId, 
                        isExtra: true, 
                        hasTrackerRecord: true,
                        remarks: t.remarks,
                        originalStatus: "" 
                    });
                }
            }
        });
    }

    let merged = processedEvents;
    if (filter !== "all") {
        merged = merged.filter(e => 
            e.status.toLowerCase().replace(" ", "") === filter.toLowerCase().replace(" ", "")
        );
    }

    return merged.sort((a, b) => getNormalizedSession(a.sessionName) - getNormalizedSession(b.sessionName));
  }, [selectedDate, rawEvents, filter, normalizedTrackingData, attendanceData, coursesData, semesterData, academicYearData, isSameDay]);
  
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = useMemo(
    () => [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    []
  );
  const yearOptions = useMemo(() => Array.from({ length: new Date().getFullYear() + 1 - 2018 + 1 }, (_, i) => 2018 + i), []);
  
  const calendarCells = useMemo(() => {
    if (!selectedDate || currentDate.year === null || currentDate.month === null) return [];
    
    // Extract non-null values for use in closures below
    const year = currentDate.year;
    const month = currentDate.month;
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getFirstDayOfMonth(year, month);
    const leadingEmptyCells = Array(firstDayOfMonth).fill(null).map((_, index) => <div key={`empty-leading-${index}`} className="h-10 w-full" />);
    const dayCells = Array(daysInMonth).fill(null).map((_, index) => {
        const date = new Date(year, month, index + 1);
        const status = getEventStatus(date);
        const hasEvents = status !== null; 
        const isSelected = isSameDay(date, selectedDate);
        let className = "h-10 w-10 mx-auto rounded-full flex items-center justify-center text-sm cursor-pointer transition-all duration-200 hover:scale-104 ";
        if (isSelected) className += "bg-primary text-primary-foreground font-medium shadow-lg scale-110";
        else if (status === "absent") className += "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30";
        else if (status === "otherLeave") className += "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 border border-teal-500/30";
        else if (status === "dutyLeave") className += "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30";
        else if (status === "present") className += "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30";
        else if (status === "normal") className += "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30";
        else if (hasEvents) className += "ring-1 ring-gray-500/30 hover:ring-gray-500/50";
        else className += "hover:bg-accent/50";
        if (isToday(date)) className += " ring-2 ring-offset-1 ring-offset-background ring-primary";
        
        const handleDateSelect = () => {
          const dateString = date.toISOString();
          sessionStorage.setItem("selected_date", dateString);
          setSelectedDate(date);
          setCurrentDate({ month: date.getMonth(), year: date.getFullYear() });
        };
        
        const dateLabel = `${monthNames[date.getMonth()]} ${index + 1}, ${date.getFullYear()}${isSelected ? ', selected' : ''}${status ? `, ${status}` : ''}`;
        
        return (
          <div key={`day-${index}`} className="flex items-center justify-center">
            <button 
              type="button"
              onClick={handleDateSelect}
              className={className}
              aria-label={dateLabel}
              aria-pressed={isSelected}
            >
              {index + 1}
            </button>
          </div>
        );
    });
    return [...leadingEmptyCells, ...dayCells];
  }, [currentDate.year, currentDate.month, selectedDate, getDaysInMonth, getFirstDayOfMonth, getEventStatus, isSameDay, isToday, monthNames]);

  // Show loading state while dates are initializing
  if (currentDate.year === null || currentDate.month === null || !selectedDate) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden border border-border/40 custom-container h-full flex flex-col items-center justify-center min-h-100">
          <div className="text-muted-foreground">Loading calendar...</div>
        </Card>
        <Card className="border border-border/40 custom-container">
          <CardContent className="p-6">
            <div className="text-muted-foreground">Loading details...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // After the null check above, we know currentDate.year and currentDate.month are not null
  // Non-null assertions in this block are safe due to the guard condition at line 516
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="overflow-hidden border border-border/40 custom-container h-full flex flex-col">
        {/* Header */}
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
            <Select value={currentDate.month!.toString()} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-32.5 h-9 bg-background/60 border-border/60 text-sm capitalize custom-dropdown" aria-label="Select month">
                <SelectValue>{monthNames[currentDate.month!]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background/90 border-border/60 backdrop-blur-md custom-dropdown max-h-70">
                {monthNames.map((month, index) => (
                  <SelectItem key={month} value={index.toString()} className={currentDate.month === index ? "bg-white/5 mt-0.5" : "capitalize"}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currentDate.year!.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-22.5 h-9 bg-background/60 border-border/60 text-sm custom-dropdown" aria-label="Select year">
                <SelectValue>{currentDate.year}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background/90 border-border/60 max-h-70 backdrop-blur-md custom-dropdown">
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()} className={currentDate.year === year ? "bg-white/5 mt-0.5" : "mt-0.5"}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={handlePreviousMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center" aria-label="Previous month" ><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button><Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center" aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button></div>
        </CardHeader>
        <CardContent className="p-4 flex-1 flex flex-col h-full">
          <div className="grid grid-cols-7 mb-2 shrink-0">{daysOfWeek.map((day, index) => <div key={index} className="text-xs font-medium text-muted-foreground text-center py-2">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-1 pb-2 flex-1 auto-rows-[1fr]" style={{ gridAutoRows: '1fr' }}>{calendarCells}</div>
          <div className="flex flex-wrap gap-4 mt-6 text-muted-foreground text-xs justify-center border-t border-border/40 pt-4 shrink-0">
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/30" /><span>absent</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-teal-500/20 border border-teal-500/30" /><span>other leave</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/30" /><span>duty leave</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-blue-500/20 border border-blue-500/30" /><span>present</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full outline-2 outline-primary" /><span>today</span></div>
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
                      badgeClass = "text-green-500 border-green-500/20 bg-green-500/10";
                      Icon = CheckCircle2;
                      cardStyle = "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500";
                    } 
                    else if (event.status === "Absent") {
                      badgeClass = "text-red-500 border-red-500/20 bg-red-500/10";
                      Icon = AlertCircle;
                      cardStyle = "border-red-500/50 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500";
                    } 
                    else if (event.status === "Duty Leave") {
                      badgeClass = "text-yellow-500 border-yellow-500/20 bg-yellow-500/10";
                      cardStyle = "border-yellow-500/50 bg-yellow-500/5 hover:bg-yellow-500/10 hover:border-yellow-500";
                    } 
                    else if (event.status.includes("Leave")) {
                      badgeClass = "text-teal-500 border-teal-500/20 bg-teal-500/10";
                      cardStyle = "border-teal-500/50 bg-teal-500/5 hover:bg-teal-500/10 hover:border-teal-500";
                    }

                    const dbDate = formatDateForDB(selectedDate);
                    const sNum = getNormalizedSession(event.rawSession || event.sessionName);
                    const sessionForDB = toRoman(sNum); 
                    
                    const buttonKey = `${event.courseId}-${dbDate}-${sNum}`;
                    const deleteKey = `delete-${event.courseId}-${sNum}-${dbDate}`;
                    
                    const isDeleting = loadingStates[deleteKey];
                    const isLoading = loadingStates[buttonKey];

                    const renderActions = () => {
                        if (event.isExtra) {
                            return (
                                <div className="shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
                                    <Badge variant="outline" className="text-[10px] h-6 px-2 bg-indigo-500/10 text-indigo-400 border-indigo-500/20 gap-1.5"><Sparkles className="w-3 h-3" aria-hidden="true" />Self-Marked</Badge>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/10" 
                                        disabled={isDeleting} 
                                        onClick={() => setDeleteConfirmOpen(`${event.courseId}|${dbDate}|${sessionForDB}`)} 
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

                        const hasTracking = event.isCorrection || (event.hasTrackerRecord && !event.isExtra);
                        
                        if (hasTracking) {
                            return (
                                <div className="shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
                                    {event.isCorrection && (
                                        <Badge variant="outline" className="text-[10px] h-6 px-2 bg-orange-500/10 text-orange-400 border-orange-500/20 gap-1.5">
                                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />Official: {event.originalStatus}
                                        </Badge>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="View tracking details" asChild>
                                      <Link href="/tracking"><ArrowUpRight className="w-3 h-3" aria-hidden="true" /></Link>
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-500/10" disabled={isDeleting} onClick={() => setDeleteConfirmOpen(`${event.courseId}|${dbDate}|${sessionForDB}`)}>{isDeleting ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Deleting" /> : <Trash2 className="h-3 w-3" aria-label="Delete record" />}</Button>
                                </div>
                            );
                        }
                        
                        if (event.status === "Absent") {
                            return (
                                <div className="shrink-0 w-full sm:w-auto">
                                    <div className="flex flex-row gap-2 w-full">
                                        <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { if (clickedButtons.current?.has(buttonKey)) return; clickedButtons.current?.add(buttonKey); if (authUserId) handleWriteTracking(event.courseId, dbDate, "correction", sessionForDB, 225, "Duty Leave"); }} aria-label={`Mark ${event.title} as Duty Leave for ${event.sessionName}`} className={`flex-1 h-auto min-h-8 py-1.5 text-xs gap-1.5 border-dashed transition-all ${isLoading ? "opacity-70 cursor-wait" : "border-yellow-500/40 text-yellow-600 hover:bg-yellow-500/10 hover:border-yellow-500 hover:text-yellow-700 dark:text-yellow-500"}`}>{isLoading ? "..." : <><Briefcase className="w-3 h-3 shrink-0" aria-hidden="true"/><span>Mark DL</span></>}</Button>
                                        <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { if (clickedButtons.current?.has(buttonKey)) return; clickedButtons.current?.add(buttonKey); if (authUserId) handleWriteTracking(event.courseId, dbDate, "correction", sessionForDB, 110, "Incorrectly marked absent"); }} aria-label={`Mark ${event.title} as Present for ${event.sessionName}`} className={`flex-1 h-auto min-h-8 py-1.5 text-xs gap-1.5 border-dashed transition-all ${isLoading ? "opacity-70 cursor-wait" : "border-green-500/40 text-green-600 hover:bg-green-500/10 hover:border-green-500 hover:text-green-700 dark:text-green-500"}`}>{isLoading ? "..." : <><CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" /><span>Mark Present</span></>}</Button>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    };

                    return (
                      <motion.div key={`event-${event.sessionKey}-${index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all gap-4 ${cardStyle}`}>
                        <div className="flex flex-col gap-1.5">
                          <h3 className="font-semibold text-sm text-foreground leading-tight capitalize flex items-center gap-2">{event.title.toLowerCase()}</h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="bg-background/50 px-1.5 py-0.5 rounded border border-border/30">{event.sessionName ? formatSessionName(event.sessionName) : `Session ${event.sessionKey}`}</span>
                            <Badge variant="outline" className={`h-5 px-1.5 gap-1 font-medium ${badgeClass}`}><Icon className="w-3 h-3" aria-hidden="true" />{event.status}</Badge>
                          </div>
                        </div>
                        {renderActions()}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
                  <div className="rounded-full bg-accent/30 p-4 mb-3 ring-1 ring-border/50"><CalendarIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" /></div>
                  <h3 className="text-sm font-semibold text-foreground">No Classes Found</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-50">Enjoy your free time! No classes recorded for this date.</p>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToToday}>Jump to Today</Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmOpen} onOpenChange={(open) => !open && setDeleteConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tracking Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this attendance tracking record. This action cannot be undone.
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
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}