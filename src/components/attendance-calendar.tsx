"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import Link from "next/link";

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

// Convert Number to Roman (for DB)
const toRoman = (num: number): string => {
  const romans = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  return romans[num - 1] || String(num);
};

// Normalize Session (Strict Number)
const getNormalizedSession = (session: string | number): number => {
  const s = String(session).toLowerCase().replace(/session|lecture|lab|hour|hr|period|st|nd|rd|th|\s/gi, "").trim();
  const num = parseInt(s, 10);
  if (!isNaN(num)) return num;
  
  const romans: Record<string, number> = { 
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10 
  };
  return romans[s] || 0;
};

// Display Name (1st Hour, etc.)
const formatSessionName = (sessionName: string): string => {
    const num = getNormalizedSession(sessionName);
    if (num > 0) {
        if (num === 1) return "1st Hour";
        if (num === 2) return "2nd Hour";
        if (num === 3) return "3rd Hour";
        return `${num}th Hour`;
    }
    return sessionName || "Unknown";
};

// Unique Slot Key
const getSlotKey = (courseId: string | number, session: string | number) => {
    const sNum = getNormalizedSession(session);
    return `${String(courseId).trim()}-${sNum}`; 
};

export function AttendanceCalendar({
  attendanceData,
}: AttendanceCalendarProps) {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<string>("all");
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const clickedButtons = useRef<Set<string>>(new Set());

  const { data: semester } = useFetchSemester();
  const { data: year } = useFetchAcademicYear();
  const { data: user } = useUser(); 
  const { refetch: refetchCount } = useTrackingCount(user);
  const { data: trackingData, refetch: refetchTrackData } = useTrackingData(user);
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

  useEffect(() => {
    const dateSelected = sessionStorage.getItem("selected_date");
    if (dateSelected) {
      const parsedDate = new Date(dateSelected);
      setSelectedDate(parsedDate);
      setCurrentMonth(parsedDate.getMonth());
      setCurrentYear(parsedDate.getFullYear());
    }
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

        if (error) throw error;
        toast.success("Added to tracking", { style: { backgroundColor: "rgba(34, 197, 94, 0.1)", color: "rgb(74, 222, 128)", border: "1px solid rgba(34, 197, 94, 0.2)", backdropFilter: "blur(5px)" } });
        await refetchTrackData(); 
        await refetchCount();
      } catch (error: any) { 
        toast.error("Failed to add record"); 
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

  const handlePreviousMonth = () => { setCurrentMonth((p) => p === 0 ? 11 : p - 1); if(currentMonth === 0) setCurrentYear(y => y-1); };
  const handleNextMonth = () => { setCurrentMonth((p) => p === 11 ? 0 : p + 1); if(currentMonth === 11) setCurrentYear(y => y+1); };
  const goToToday = () => { const t = new Date(); setCurrentYear(t.getFullYear()); setCurrentMonth(t.getMonth()); setSelectedDate(t); };
  
  const getDaysInMonth = useCallback((year: number, month: number) => new Date(year, month + 1, 0).getDate(), []);
  const getFirstDayOfMonth = useCallback((year: number, month: number) => new Date(year, month, 1).getDay(), []);
  const isSameDay = useCallback((d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(), []);
  const isToday = useCallback((d: Date) => isSameDay(d, new Date()), [isSameDay]);

  // Dot status logic
  const getEventStatus = useCallback((date: Date): string | null => {
      const dateEvents = rawEvents.filter((event) => isSameDay(event.date, date));
      const dbDateStr = formatDateForDB(date);
      const hasExtra = trackingData?.some(t => {
         let tDate = t.date;
         if (tDate.includes('T')) tDate = tDate.split('T')[0];
         if (tDate.includes('/')) { const [d,m,y] = tDate.split('/'); tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
         return tDate === dbDateStr && t.status === 'extra' && t.semester === semesterData && t.year === academicYearData;
      });

      let hasAbsent = false;
      let hasLeave = false;

      dateEvents.forEach(ev => {
          const key = getSlotKey(ev.courseId, ev.sessionName);
          const override = trackingData?.find(t => {
             let tDate = t.date;
             if (tDate.includes('/')) { const [d,m,y] = tDate.split('/'); tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
             return tDate === dbDateStr && getSlotKey(t.course, t.session) === key;
          });

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
  }, [rawEvents, isSameDay, trackingData]);

  // --- 2. MERGE LOGIC ---
  const selectedDateEvents = useMemo(() => {
    const dbDateStr = formatDateForDB(selectedDate);
    const dayOfficialsRaw = rawEvents.filter((event) => isSameDay(event.date, selectedDate));
    
    // 1. Deduplicate Officials (Last Write Wins per Course+Session)
    const officialsMap = new Map<string, ExtendedAttendanceEvent>();
    dayOfficialsRaw.forEach(ev => {
        const key = getSlotKey(ev.courseId, ev.sessionName);
        officialsMap.set(key, { ...ev });
    });
    
    // 2. Process Official Events
    const processedEvents = Array.from(officialsMap.values()).map(ev => {
        const key = getSlotKey(ev.courseId, ev.sessionName);

        const override = trackingData?.find(t => {
            let tDate = t.date;
            if (tDate.includes('/')) { const [d,m,y] = tDate.split('/'); tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
            
            const isDateMatch = tDate === dbDateStr;
            const isKeyMatch = getSlotKey(t.course, t.session) === key;
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
                hasTrackerRecord: true
            };
        }
        return ev;
    });

    // 3. Process Extras
    if (trackingData) {
        trackingData.forEach(t => {

            if (t.semester !== semesterData || t.year !== academicYearData) {
              return;
            }

            let tDate = t.date;
            if (tDate.includes('/')) { const [d,m,y] = tDate.split('/'); tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
            
            if (tDate === dbDateStr) {
                const key = getSlotKey(t.course, t.session);
                
                const alreadyMerged = processedEvents.some(ev => 
                    getSlotKey(ev.courseId, ev.sessionName) === key
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
  }, [selectedDate, rawEvents, filter, trackingData, attendanceData, coursesData]);
  
  const calendarCells = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);
    const leadingEmptyCells = Array(firstDayOfMonth).fill(null).map((_, index) => <div key={`empty-leading-${index}`} className="h-10 w-full" />);
    const dayCells = Array(daysInMonth).fill(null).map((_, index) => {
        const date = new Date(currentYear, currentMonth, index + 1);
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
        return ( <div key={`day-${index}`} className="flex items-center justify-center" onClick={() => { const dateString = date.toISOString(); sessionStorage.setItem("selected_date", dateString); setSelectedDate(date); setCurrentMonth(date.getMonth()); setCurrentYear(date.getFullYear()); }}><div className={className}>{index + 1}</div></div> );
    });
    return [...leadingEmptyCells, ...dayCells];
  }, [currentYear, currentMonth, selectedDate, getDaysInMonth, getFirstDayOfMonth, getEventStatus, isSameDay, isToday]);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
  const yearOptions = useMemo(() => Array.from({ length: new Date().getFullYear() + 1 - 2018 + 1 }, (_, i) => 2018 + i), []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="overflow-hidden border border-border/40 shadow-md backdrop-blur-sm custom-container h-full flex flex-col">
        {/* Header */}
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-center sm:justify-between gap-2 border-b border-border/40">
          <div className="flex items-center gap-2 max-sm:contents">
            <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[130px] h-9 bg-background/60 border-border/60 text-sm capitalize custom-dropdown"><SelectValue>{filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}</SelectValue></SelectTrigger><SelectContent className="bg-background/90 border-border/60 backdrop-blur-md custom-dropdown max-h-70"><SelectItem value="all">All</SelectItem><SelectItem value="present">Present</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="dutyLeave">Duty Leave</SelectItem><SelectItem value="otherLeave">Other Leave</SelectItem></SelectContent></Select>
            <Select value={currentMonth.toString()} onValueChange={(value) => setCurrentMonth(parseInt(value, 10))}><SelectTrigger className="w-[130px] h-9 bg-background/60 border-border/60 text-sm capitalize custom-dropdown"><SelectValue>{monthNames[currentMonth]}</SelectValue></SelectTrigger><SelectContent className="bg-background/90 border-border/60 backdrop-blur-md custom-dropdown max-h-70">{monthNames.map((month, index) => (<SelectItem key={month} value={index.toString()} className={currentMonth === index ? "bg-white/5 mt-0.5" : "capitalize"}>{month}</SelectItem>))}</SelectContent></Select>
            <Select value={currentYear.toString()} onValueChange={(value) => { const newYear = parseInt(value, 10); if (newYear >= 2018) setCurrentYear(newYear); }}><SelectTrigger className="w-[90px] h-9 bg-background/60 border-border/60 text-sm custom-dropdown"><SelectValue>{currentYear}</SelectValue></SelectTrigger><SelectContent className="bg-background/90 border-border/60 max-h-70 backdrop-blur-md custom-dropdown">{yearOptions.map((year) => (<SelectItem key={year} value={year.toString()} className={currentYear === year ? "bg-white/5 mt-0.5" : "mt-0.5"}>{year}</SelectItem>))}</SelectContent></Select>
          </div>
          <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={handlePreviousMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center"><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-9 w-9 rounded-lg bg-accent/50 flex justify-center items-center"><ChevronRight className="h-4 w-4" /></Button></div>
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
            <div className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-primary" />{selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            <Badge variant="secondary" className="font-normal text-xs bg-background/80">{selectedDateEvents.length} Sessions</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div key={selectedDate.toString()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col">
              {selectedDateEvents.length > 0 ? (
                <div className="flex flex-col gap-3 p-4">
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
                                <div className="flex-shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
                                    <Badge variant="outline" className="text-[10px] h-6 px-2 bg-indigo-500/10 text-indigo-400 border-indigo-500/20 gap-1.5"><Sparkles className="w-3 h-3" />Self-Marked</Badge>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/10" disabled={isDeleting} onClick={() => handleDeleteTrackData(sessionForDB, event.courseId, dbDate)}>{isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}</Button>
                                </div>
                            );
                        }

                        const hasTracking = event.isCorrection || (event.hasTrackerRecord && !event.isExtra);
                        
                        if (hasTracking) {
                            return (
                                <div className="flex-shrink-0 w-full sm:w-auto flex items-center justify-end gap-2">
                                    {event.isCorrection && (
                                        <Badge variant="outline" className="text-[10px] h-6 px-2 bg-orange-500/10 text-orange-400 border-orange-500/20 gap-1.5">
                                            <AlertTriangle className="w-3 h-3" />Official: {event.originalStatus}
                                        </Badge>
                                    )}
                                    <Link href="/tracking">
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"><ArrowUpRight className="w-3 h-3" /></Button>
                                    </Link>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/10" disabled={isDeleting} onClick={() => handleDeleteTrackData(sessionForDB, event.courseId, dbDate)}>{isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}</Button>
                                </div>
                            );
                        }
                        
                        if (event.status === "Absent") {
                            return (
                                <div className="flex-shrink-0 w-full sm:w-auto">
                                    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full">
                                        <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { if (clickedButtons.current?.has(buttonKey)) return; clickedButtons.current?.add(buttonKey); if (authUserId) handleWriteTracking(event.courseId, dbDate, "correction", sessionForDB, 225, "Duty Leave"); }} className={`w-full sm:w-auto h-auto min-h-[32px] py-1.5 text-xs gap-1.5 border-dashed transition-all ${isLoading ? "opacity-70 cursor-wait" : "border-yellow-500/40 text-yellow-600 hover:bg-yellow-500/10 hover:border-yellow-500 hover:text-yellow-700 dark:text-yellow-500"}`}>{isLoading ? "..." : <><Briefcase className="w-3 h-3 shrink-0" /><span className="truncate">Mark DL</span></>}</Button>
                                        <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { if (clickedButtons.current?.has(buttonKey)) return; clickedButtons.current?.add(buttonKey); if (authUserId) handleWriteTracking(event.courseId, dbDate, "correction", sessionForDB, 110, "Incorrectly marked absent"); }} className={`w-full sm:w-auto h-auto min-h-[32px] py-1.5 text-xs gap-1.5 border-dashed transition-all ${isLoading ? "opacity-70 cursor-wait" : "border-green-500/40 text-green-600 hover:bg-green-500/10 hover:border-green-500 hover:text-green-700 dark:text-green-500"}`}>{isLoading ? "..." : <><CheckCircle2 className="w-3 h-3 shrink-0" /><span className="truncate">Mark Present</span></>}</Button>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    };

                    return (
                      <motion.div key={`event-${event.sessionKey}-${index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all gap-4 ${cardStyle}`}>
                        <div className="flex flex-col gap-1.5">
                          <h4 className="font-semibold text-sm text-foreground leading-tight capitalize flex items-center gap-2">{event.title.toLowerCase()}</h4>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="bg-background/50 px-1.5 py-0.5 rounded border border-border/30">{event.sessionName ? formatSessionName(event.sessionName) : `Session ${event.sessionKey}`}</span>
                            <Badge variant="outline" className={`h-5 px-1.5 gap-1 font-medium ${badgeClass}`}><Icon className="w-3 h-3" />{event.status}</Badge>
                          </div>
                        </div>
                        {renderActions()}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
                  <div className="rounded-full bg-accent/30 p-4 mb-3 ring-1 ring-border/50"><CalendarIcon className="h-6 w-6 text-muted-foreground/60" /></div>
                  <h3 className="text-sm font-semibold text-foreground">No Classes Found</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-[200px]">Enjoy your free time! No classes recorded for this date.</p>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToToday}>Jump to Today</Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
