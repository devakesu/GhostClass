"use client";

import { useState, useMemo } from "react";
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
import { Loader2, Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { useFetchSemester, useFetchAcademicYear } from "@/hooks/users/settings";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from "date-fns";
import { cn, toRoman, formatSessionName } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AddAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendanceData: any;
  trackingData: any[];
  coursesData: any;
  user: any;
  onSuccess: () => void;
}

const SESSIONS = ["1", "2", "3", "4", "5", "6", "7"];

export function AddAttendanceDialog({
  open,
  onOpenChange,
  attendanceData,
  trackingData,
  coursesData,
  user,
  onSuccess,
}: AddAttendanceDialogProps) {
  const { data: semester } = useFetchSemester();
  const { data: year } = useFetchAcademicYear();

  // --- STATE ---
  const [date, setDate] = useState<Date>(new Date());
  const [session, setSession] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [statusType, setStatusType] = useState<"Present" | "Absent" | "Duty Leave">("Present");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // Custom Calendar State
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // --- HELPERS ---
  const normalizeSession = (s: string) => {
    if (!s) return "";
    const norm = s.toString().toLowerCase().replace(/session/g, "").replace(/hour/g, "").trim();
    const numMap: Record<string, string> = { "1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v", "6": "vi", "7": "vii" };
    return numMap[norm] || norm;
  };

  const getDateKey = (d: Date) => format(d, "yyyyMMdd"); 

  // --- SMART DEFAULTS (Derived state to avoid cascading renders) ---
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevDate, setPrevDate] = useState(date);
  
  if (open !== prevOpen || date !== prevDate) {
    setPrevOpen(open);
    setPrevDate(date);
    
    if (open && date) {
      // 1. PREFILL SESSION
      const occupiedSessions = new Set<string>();
      const dateKey = getDateKey(date);

      // A. Official Data
      const officialDay = attendanceData?.studentAttendanceData?.[dateKey];
      if (officialDay) {
        const sortedKeys = Object.keys(officialDay).sort((a, b) => Number(a) - Number(b));
        sortedKeys.forEach((key, index) => {
           const s = officialDay[key];
           const lookupName = attendanceData?.sessions?.[key]?.name;
           if (lookupName) occupiedSessions.add(normalizeSession(lookupName));
           if (s.session) occupiedSessions.add(normalizeSession(s.session));
           if (!lookupName && !s.session && index < SESSIONS.length) {
             occupiedSessions.add(normalizeSession(SESSIONS[index]));
           }
        });
      }

      // B. Tracking Data
      const dateStr = format(date, "yyyy-MM-dd");
      trackingData?.forEach((t) => {
        let tDate = t.date;
        if (tDate.includes('/')) {
           const [d, m, y] = tDate.split('/');
           tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        if (tDate === dateStr) {
           occupiedSessions.add(normalizeSession(t.session));
        }
      });

      // C. First Free Session
      const firstFree = SESSIONS.find(s => !occupiedSessions.has(normalizeSession(s)));
      const newSession = firstFree || "";
      setSession(newSession);

      // 2. PREFILL COURSE
      if (newSession && attendanceData?.studentAttendanceData) {
        const dayOfWeek = date.getDay();
        const frequencyMap: Record<string, number> = {};
        
        Object.entries(attendanceData.studentAttendanceData).forEach(([dStr, sessions]: [string, any]) => {
           const y = parseInt(dStr.substring(0, 4));
           const m = parseInt(dStr.substring(4, 6)) - 1;
           const d = parseInt(dStr.substring(6, 8));
           const currentDay = new Date(y, m, d).getDay();

           if (currentDay === dayOfWeek) {
              const sortedKeys = Object.keys(sessions).sort((a, b) => Number(a) - Number(b));
              sortedKeys.forEach((key, index) => {
                 const s = sessions[key];
                 const lookupName = attendanceData.sessions?.[key]?.name;
                 const directName = s.session;
                 const inferredName = SESSIONS[index];
                 const target = normalizeSession(newSession);
                 
                 const isMatch = (lookupName && normalizeSession(lookupName) === target) ||
                                 (directName && normalizeSession(directName) === target) ||
                                 (!lookupName && !directName && normalizeSession(inferredName) === target);

                 if (isMatch && s.course) {
                    const cid = String(s.course);
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
        else setCourseId("");
      } else {
        setCourseId("");
      }
    } else {
      setSession("");
      setCourseId("");
    }
  }

  // --- 3. VALIDATION ---
  const isSessionBlocked = useMemo(() => {
      if (!session) return false;
      const targetSession = normalizeSession(session);
      const dateKey = getDateKey(date);
      const officialDay = attendanceData?.studentAttendanceData?.[dateKey];
      let isBlocked = false;
      
      if (officialDay) {
         const sortedKeys = Object.keys(officialDay).sort((a, b) => Number(a) - Number(b));
         isBlocked = sortedKeys.some((key, index) => {
            const s = officialDay[key];
            const lookupName = attendanceData.sessions?.[key]?.name;
            const directName = s.session;
            if (lookupName && normalizeSession(lookupName) === targetSession) return true;
            if (directName && normalizeSession(directName) === targetSession) return true;
            if (!lookupName && !directName && index < SESSIONS.length) {
               if (normalizeSession(SESSIONS[index]) === targetSession) return true;
            }
            return false;
         });
      }

      if (!isBlocked && trackingData) {
         const dateStr = format(date, "yyyy-MM-dd");
         isBlocked = trackingData.some(t => {
            let tDate = t.date;
            if (tDate.includes('/')) {
               const [d, m, y] = tDate.split('/');
               tDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
            }
            return tDate === dateStr && normalizeSession(t.session) === targetSession;
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
          session: toRoman(session.toString().toLowerCase()),
          semester: semester,
          year: year,
          status: "extra", 
          attendance: attCode,
          remarks: `Self-Marked: ${statusType}`,
        });

      if (error) throw error;

      toast.success("Extra class added successfully");
      onSuccess();
      onOpenChange(false);

    } catch (error) {
      logger.error("Add Record Failed:", error);
      Sentry.captureException(error, { tags: { type: "attendance_mutation_error", location: "AddAttendanceDialog" } });
      toast.error("Failed to add record");
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
      <DialogContent className="sm:max-w-[425px] custom-container border-border/50">
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
                      "w-full justify-start text-left font-normal bg-accent/20 border-accent/30 hover:bg-accent/30",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3 pointer-events-auto z-50" align="start">
                  
                  {/* Custom Aesthetic Calendar */}
                  <div className="flex flex-col gap-2">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="text-sm font-semibold">
                        {format(currentMonth, "MMMM yyyy")}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Days Header */}
                    <div className="grid grid-cols-7 text-center mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                        <div key={d} className="text-[0.8rem] text-muted-foreground font-medium py-1">
                          {d}
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
                        return (
                          <div key={day.toString()} className="flex justify-center">
                            <button
                              onClick={() => {
                                setDate(day);
                                setIsCalendarOpen(false);
                              }}
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-sm transition-all hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm scale-105 font-medium",
                                !isSelected && isTodayDate && "bg-accent/50 text-accent-foreground font-medium border border-border/50",
                                !isSelected && !isTodayDate && "text-foreground"
                              )}
                            >
                              {format(day, "d")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* SESSION */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-muted-foreground">Session</Label>
            <div className="col-span-3">
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger className="bg-accent/20 border-accent/30">
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
                 <p className="text-[10px] text-red-400 mt-1.5 ml-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Session occupied
                 </p>
              )}
            </div>
          </div>

          {/* COURSE */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-muted-foreground">Subject</Label>
            <div className="col-span-3">
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="bg-accent/20 border-accent/30 h-auto min-h-[40px] py-2.5 whitespace-normal text-left [&>span]:line-clamp-none">
                  <SelectValue placeholder="Select Subject" />
                </SelectTrigger>
                <SelectContent className="custom-dropdown max-h-60 w-[300px] max-w-[calc(100vw-40px)]"> 
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
               onValueChange={(v: any) => setStatusType(v)} 
               className="col-span-3 flex gap-4"
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

        </div>

        <DialogFooter>
          <Button 
             onClick={handleSubmit} 
             disabled={isSubmitting || isSessionBlocked || !session || !courseId}
             className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
