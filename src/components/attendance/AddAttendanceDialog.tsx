"use client";

import { useState, useEffect, useMemo } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDay, 
  isSameDay, 
  isToday,
  isBefore,
  isAfter,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { normalizeSession, toRoman, formatSessionName, normalizeDate } from "@/lib/utils";
import { isDutyLeaveConstraintError, getDutyLeaveErrorMessage } from "@/lib/error-handling";
import { AttendanceReport, TrackAttendance, Course } from "@/types";

interface User {
  id: string | number;
  auth_id?: string;
}

/**
 * Props for AddAttendanceDialog component.
 */
interface AddAttendanceDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Attendance report data for validation */
  attendanceData?: AttendanceReport;
  /** User's tracking records */
  trackingData: TrackAttendance[];
  /** Available courses data */
  coursesData?: { courses: Record<string, Course> };
  /** Current user */
  user: User;
  /** Callback on successful submission */
  onSuccess: () => void;
  /** Selected semester filter */
  selectedSemester?: "odd" | "even";
  /** Selected academic year */
  selectedYear?: string;
}

const SESSIONS = ["1", "2", "3", "4", "5", "6", "7"];

/**
 * Dialog for manually adding attendance records.
 * Allows users to track additional attendance or corrections.
 * 
 * Features:
 * - Course selection with semester filtering
 * - Date picker with semester bounds
 * - Session selection (1-7)
 * - Status selection (Present/Absent/Duty Leave)
 * - Duplicate detection
 * - Optimistic UI updates
 * 
 * @example
 * ```tsx
 * <AddAttendanceDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   user={user}
 *   onSuccess={handleSuccess}
 * />
 * ```
 */
export function AddAttendanceDialog({
  open,
  onOpenChange,
  attendanceData,
  trackingData,
  coursesData,
  user,
  onSuccess,
  selectedSemester,
  selectedYear,
}: AddAttendanceDialogProps) {

  // --- STATE ---
  const [date, setDate] = useState<Date>(new Date());
  const [session, setSession] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [statusType, setStatusType] = useState<"Present" | "Absent" | "Duty Leave">("Present");
  const [dlReason, setDlReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // Custom Calendar State
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const getDateKey = (d: Date) => normalizeDate(d);

  // 1. CALCULATE SEMESTER BOUNDS
  const semesterBounds = useMemo(() => {
    if (!selectedYear || !selectedSemester) return { min: undefined, max: undefined };

    try {
      const startYear = parseInt(selectedYear.split("-")[0], 10);
      if (isNaN(startYear)) throw new Error("Invalid year format");

      const endYear = startYear + 1;

      if (selectedSemester === "odd") {
        return {
          min: new Date(startYear, 6, 1), 
          max: new Date(startYear, 11, 31)
        };
      } else {
        return {
          min: new Date(endYear, 0, 1),   
          max: new Date(endYear, 5, 30)   
        };
      }
    } catch (e) {
      logger.warn("Invalid semester bounds:", e);
      return { min: undefined, max: undefined };
    }
  }, [selectedSemester, selectedYear]);

  // 2. VALIDATE CURRENT DATE ON OPEN
  useEffect(() => {
    if (open && semesterBounds.min && semesterBounds.max) {
      if (isBefore(date, semesterBounds.min)) {
        const newDate = semesterBounds.min;
        setDate(newDate);
        setCurrentMonth(newDate);
      } else if (isAfter(date, semesterBounds.max)) {
        const newDate = semesterBounds.max;
        setDate(newDate);
        setCurrentMonth(newDate);
      }
    }
  }, [open, semesterBounds, date]);

  // --- 3. SMART DEFAULTS (Occupancy Check) ---
  useEffect(() => {
    if (open && attendanceData) {
      const occupiedSessions = new Set<string>();
      const dateKey = getDateKey(date);

      // A. Official Data
      const officialDay = attendanceData.studentAttendanceData?.[dateKey];
      if (officialDay) {
          Object.entries(officialDay).forEach(([key, s], index) => {
            const slot = s as { course: string | number | null; session?: string | number | null };
           
            if (slot.course == null || slot.course === "null" || slot.course === 0 || slot.course === "0") return;

            let effectiveName: string | undefined = attendanceData.sessions?.[key]?.name;
            if (!effectiveName && slot.session && slot.session !== "null") effectiveName = String(slot.session);

           if (!effectiveName) {
               const keyInt = parseInt(key);
               effectiveName = (!isNaN(keyInt) && keyInt < 20) ? key : String(index + 1);
           }

           if (effectiveName) occupiedSessions.add(normalizeSession(effectiveName));
        });
      }

      // B. Tracking Data
      const targetDbDate = normalizeDate(date);
      trackingData?.forEach((t) => {
        const trackerDateKey = normalizeDate(t.date);
        if (trackerDateKey === targetDbDate) {
           occupiedSessions.add(normalizeSession(t.session));
        }
      });

      // C. First Free
      const firstFree = SESSIONS.find(s => !occupiedSessions.has(normalizeSession(s)));
      if (firstFree) setSession(firstFree);
      else setSession("");
    }
  }, [date, open, attendanceData, trackingData]);

  // --- 4. PREFILL COURSE ---
  useEffect(() => {
    if (session && attendanceData?.studentAttendanceData) {
      const dayOfWeek = date.getDay();
      const frequencyMap: Record<string, number> = {};
      const target = normalizeSession(session);
      
      Object.entries(attendanceData.studentAttendanceData).forEach(([dStr, sessions]: [string, any]) => {
         const y = parseInt(dStr.substring(0, 4));
         const m = parseInt(dStr.substring(4, 6)) - 1;
         const d = parseInt(dStr.substring(6, 8));
         const currentDay = new Date(y, m, d).getDay();

         if (currentDay === dayOfWeek) {
            Object.entries(sessions).forEach(([key, s], index) => {
              const slot = s as { course: string | number | null; session?: string | number | null };
              if (slot.course == null || slot.course === "null" || slot.course === 0 || slot.course === "0") return;

               let effectiveName: string | undefined = attendanceData.sessions?.[key]?.name;
               if (!effectiveName && slot.session && slot.session !== "null") effectiveName = String(slot.session);
               
               if (!effectiveName) {
                   const keyInt = parseInt(key);
                   effectiveName = (!isNaN(keyInt) && keyInt < 20) ? key : String(index + 1);
               }

               if (effectiveName && normalizeSession(effectiveName) === target) {
                  const cid = String(slot.course);
                  frequencyMap[cid] = (frequencyMap[cid] || 0) + 1;
               }
            });
         }
      });

      let bestCourse = "";
      let maxCount = 0;
      Object.entries(frequencyMap).forEach(([cid, count]) => {
         if (count > maxCount) {
            maxCount = count;
            bestCourse = cid;
         }
      });

      if (bestCourse) setCourseId(bestCourse);
    }
  }, [session, date, attendanceData]);

  // --- 5. VALIDATION (Is Session Blocked?) ---
  const isSessionBlocked = useMemo(() => {
      if (!session) return false;
      
      const targetSession = normalizeSession(session);
      const dateKey = getDateKey(date);
      const officialDay = attendanceData?.studentAttendanceData?.[dateKey];
      let isBlocked = false;
      
      if (officialDay) {
         isBlocked = Object.entries(officialDay).some(([key, s], index) => {
            const slot = s as { course: string | number | null; session?: string | number | null };

            if (slot.course == null || slot.course === "null" || slot.course === 0 || slot.course === "0") {
                return false;
            }

            let effectiveName: string | undefined = attendanceData.sessions?.[key]?.name;

            if (!effectiveName && slot.session && slot.session !== "null") {
                effectiveName = String(slot.session);
            }
            
            if (!effectiveName) {
                const keyInt = parseInt(key);
                effectiveName = (!isNaN(keyInt) && keyInt < 20) ? key : String(index + 1);
            }

            if (effectiveName && normalizeSession(effectiveName) === targetSession) {
                return true;
            }
            return false;
         });
      }

      if (!isBlocked && trackingData) {
          const targetDbDate = normalizeDate(date);
          isBlocked = trackingData.some(t => {
             const isMatch = normalizeDate(t.date) === targetDbDate && normalizeSession(t.session) === targetSession;
             return isMatch;
          });
      }
      
      return isBlocked;
  }, [date, session, attendanceData, trackingData]);

  const handleSubmit = async () => {
    if (!user?.id || !courseId || !session) {
      toast.error("Please fill all fields");
      return;
    }
    if (isSessionBlocked) {
      toast.error("This session is already marked!");
      return;
    }
    setIsSubmitting(true);

    try {
      let attCode = 110;
      if (statusType === "Absent") attCode = 111;
      if (statusType === "Duty Leave") attCode = 225;

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        toast.error("You must be logged in");
        return;
      }

      const { error } = await supabase
        .from('tracker')
        .insert({
          auth_user_id: authUser.id,
          course: courseId,
          date: format(date, "yyyy-MM-dd"), 
          session: toRoman(session),
          semester: selectedSemester, 
          year: selectedYear,         
          status: "extra", 
          attendance: attCode,
          remarks: statusType === "Duty Leave"
            ? (dlReason.trim() || "Duty Leave")
            : `Self-Marked: ${statusType}`,
        });

      if (error) {
        // Check for duty leave constraint violation
        if (isDutyLeaveConstraintError(error)) {
          toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
          return;
        }
        throw error;
      }

      toast.success("Extra class added successfully");
      onSuccess();
      onOpenChange(false);

    } catch (error: any) {
      // Check for duty leave constraint violation in catch block as well
      if (isDutyLeaveConstraintError(error)) {
        toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
        // Expected business constraint violation; do not report to Sentry or log as error
        return;
      }
      
      // Only log and report unexpected errors
      logger.error("Add Record Failed:", error);
      toast.error("Failed to add record");
      
      Sentry.captureException(error, {
          tags: { type: "add_attendance_failure", location: "AddAttendanceDialog/handleSubmit" },
          extra: { 
              courseId, 
              date: format(date, "yyyy-MM-dd"),
              session 
          }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CUSTOM CALENDAR LOGIC ---
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });
  const startDay = getDay(startOfMonth(currentMonth));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 custom-container border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl">
        <DialogHeader>
          <DialogTitle>Add Extra Class</DialogTitle>
          <DialogDescription>
            Record a class that isn&apos;t added by your teacher yet.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-5 py-4">
          
          {/* AESTHETIC DATE PICKER */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-muted-foreground">Date</Label>
            <div className="col-span-3">
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-accent/20 border-border/50 hover:bg-accent/30"
                    )}
                    aria-label={`Selected date: ${format(date, 'MMMM d, yyyy')}. Click to change date`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {format(date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-70 p-3 pointer-events-auto z-50" align="start">
                  
                  {/* Custom Aesthetic Calendar */}
                  <div className="flex flex-col gap-2">
                    {/* Header */}
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} aria-label="Previous month">
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <div className="text-sm font-semibold">
                          {format(currentMonth, "MMMM yyyy")}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="Next month">
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>

                      {/* Days Header */}
                      <div className="grid grid-cols-7 text-center mb-1">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dayLabel) => (
                          <div key={dayLabel} className="text-[0.8rem] text-muted-foreground font-medium py-1">
                            {dayLabel}
                          </div>
                        ))}
                      </div>

                      {/* Days Grid */}
                      <div className="grid grid-cols-7 gap-y-1">
                        {Array.from({ length: startDay }).map((_, i) => (
                          <div key={`empty-${i}`} />
                        ))}
                        {daysInMonth.map((day) => {
                          const isSelected = isSameDay(day, date);
                          const isTodayDate = isToday(day);
                        
                        // CHECK IF DATE IS VALID
                        let isDisabled = false;
                        if (semesterBounds.min && semesterBounds.max) {
                            isDisabled = isBefore(day, semesterBounds.min) || isAfter(day, semesterBounds.max);
                        }

                        return (
                          <div key={day.toString()} className="flex justify-center">
                            <button
                              disabled={isDisabled}
                              onClick={() => {
                                setDate(day);
                                setIsCalendarOpen(false);
                              }}
                              aria-label={`${format(day, "MMMM d, yyyy")}${isSelected ? ', selected' : ''}${isTodayDate ? ', today' : ''}${isDisabled ? ', unavailable' : ''}`}
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                !isDisabled && "hover:bg-accent hover:text-foreground cursor-pointer",
                                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm scale-105 font-medium",
                                !isSelected && isTodayDate && !isDisabled && "bg-accent/50 text-accent-foreground font-medium border border-border/50",
                                !isSelected && !isTodayDate && !isDisabled && "text-foreground",
                                isDisabled && "text-muted-foreground/30 cursor-not-allowed pointer-events-none"
                              )}
                            >
                              {format(day, "d")}
                            </button>
                          </div>
                        );
                      })}
                        </div>
                      </>
                  </div>

                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* SESSION */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="session-select" className="text-right text-muted-foreground">Session</Label>
            <div className="col-span-3">
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger id="session-select" className="bg-accent/20 border-border/50" aria-label="Select class session">
                  <SelectValue placeholder="Select Session" />
                </SelectTrigger>
                <SelectContent className="custom-dropdown max-h-60">
                  {SESSIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                        {formatSessionName(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSessionBlocked && (
                 <p id="session-blocked-warning" className="text-[10px] text-red-600 dark:text-red-400 mt-1.5 ml-1 flex items-center gap-1" role="alert" aria-live="polite">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                    Session occupied
                 </p>
              )}
            </div>
          </div>

          {/* COURSE */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="course-select" className="text-right text-muted-foreground">Subject</Label>
            <div className="col-span-3">
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="course-select" className="bg-accent/20 border-border/50 h-auto min-h-10 py-2.5 whitespace-normal text-left [&>span]:line-clamp-none" aria-label="Select course or subject">
                  <SelectValue placeholder="Select Subject" />
                </SelectTrigger>
                <SelectContent className="custom-dropdown max-h-60 w-75 max-w-[calc(100vw-40px)]">
                  {coursesData?.courses && Object.values(coursesData.courses).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)} className="whitespace-normal">
                      <span className="capitalize leading-tight">{c.name.toLowerCase()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* STATUS */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-muted-foreground">Status</Label>
            <RadioGroup 
               value={statusType} 
               onValueChange={(v: any) => { setStatusType(v); if (v !== "Duty Leave") setDlReason(""); }} 
               className="col-span-3 flex gap-4"
               aria-label="Select attendance status"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Present" id="r1" className="text-green-500 border-green-500/50" />
                <Label htmlFor="r1" className="cursor-pointer text-green-500 font-normal">Present</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Absent" id="r2" className="text-red-500 border-red-500/50" />
                <Label htmlFor="r2" className="cursor-pointer text-red-500 font-normal">Absent</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Duty Leave" id="r3" className="text-yellow-500 border-yellow-500/50" />
                <Label htmlFor="r3" className="cursor-pointer text-yellow-500 font-normal">DL</Label>
              </div>
            </RadioGroup>
          </div>

          {/* DL REASON */}
          {statusType === "Duty Leave" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dl-reason-dialog" className="text-right text-muted-foreground">Reason (optional)</Label>
              <div className="col-span-3">
                <Input
                  id="dl-reason-dialog"
                  placeholder="Programme/Activity"
                  value={dlReason}
                  onChange={(e) => setDlReason(e.target.value)}
                  className="bg-accent/20 border-border/50"
                />
              </div>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button 
             onClick={handleSubmit} 
             disabled={isSubmitting || isSessionBlocked || !session || !courseId}
             className="bg-primary text-primary-foreground hover:bg-primary/90"
             aria-label="Submit and add attendance record"
             aria-describedby={isSessionBlocked ? 'session-blocked-warning' : undefined}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" aria-hidden="true" />}
            Add Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}