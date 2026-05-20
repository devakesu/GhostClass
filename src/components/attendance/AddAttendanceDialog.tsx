"use client";

import { useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import { optionalReasonSchema } from "@/lib/validation/text";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatSessionName,
  normalizeDate,
  normalizeSession,
  toRoman,
} from "@/lib/utils";
import {
  getHumanReadableError,
  getDutyLeaveErrorMessage,
  isDutyLeaveConstraintError,
} from "@/lib/error-handling";
import { AttendanceReport, Course, TrackAttendance } from "@/types";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";

interface User {
  id: string | number;
  auth_id?: string;
}

type AttendanceStatusType = "Present" | "Absent" | "Duty Leave";

type AttendanceSlot = {
  course: string | number | null;
  session?: string | number | null;
};

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

// --- HELPER FUNCTIONS FOR USEMEMOs ---

function computeSortedCourses(
  coursesData: { courses: Record<string, Course> } | undefined,
  classCourses: { course_code: string; course_name: string }[] | undefined,
  isDisabled: (code: string) => boolean,
  getCourseCodeById: (id: string) => string
) {
  const courses: { key: string; name: string }[] = [];
  
  if (coursesData?.courses) {
    Object.entries(coursesData.courses).forEach(([key, c]) => {
      courses.push({ key, name: c.name });
    });
  }
  
  if (classCourses) {
    classCourses.forEach(cc => {
      const code = cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");
      if (!courses.some(c => c.key.toUpperCase().replace(/[\s\u00A0-]/g, "") === code)) {
        courses.push({ key: cc.course_code, name: cc.course_name });
      }
    });
  }

  return courses.sort((a, b) => {
    const codeA = getCourseCodeById(a.key);
    const codeB = getCourseCodeById(b.key);
    const disabledA = isDisabled(codeA);
    const disabledB = isDisabled(codeB);
    if (disabledA && !disabledB) return 1;
    if (!disabledA && disabledB) return -1;
    return a.name.localeCompare(b.name);
  });
}

function computeSemesterBounds(selectedSemester?: "odd" | "even", selectedYear?: string) {
  if (!selectedYear || !selectedSemester) {
    return { min: undefined, max: undefined };
  }

  try {
    const startYear = parseInt(selectedYear.split("-")[0], 10);
    if (isNaN(startYear)) throw new Error("Invalid year format");

    const endYear = startYear + 1;

    if (selectedSemester === "odd") {
      return {
        min: new Date(startYear, 6, 1),
        max: new Date(startYear, 11, 31),
      };
    } else {
      return {
        min: new Date(endYear, 0, 1),
        max: new Date(endYear, 5, 30),
      };
    }
  } catch (e) {
    logger.warn("Invalid semester bounds:", e);
    return { min: undefined, max: undefined };
  }
}

function computeAutoSession(open: boolean, attendanceData: AttendanceReport | undefined, trackingData: TrackAttendance[], date: Date) {
  if (!open || !attendanceData) return "";
  const occupiedSessions = new Set<string>();
  const dateKey = normalizeDate(date);

  // eslint-disable-next-line security/detect-object-injection
  const officialDay = attendanceData.studentAttendanceData?.[dateKey];
  if (officialDay) {
    Object.entries(officialDay).forEach(([key, s], index) => {
      const slot = s as AttendanceSlot;
      if (
        slot.course == null || slot.course === "null" ||
        slot.course === 0 || slot.course === "0"
      ) return;

      // eslint-disable-next-line security/detect-object-injection
      let name = attendanceData.sessions?.[key]?.name;
      if (!name && slot.session && slot.session !== "null") name = String(slot.session);
      if (!name) {
        const keyInt = parseInt(key);
        name = (!isNaN(keyInt) && keyInt < 20) ? key : String(index + 1);
      }
      if (name) occupiedSessions.add(normalizeSession(name));
    });
  }

  const targetDbDate = normalizeDate(date);
  trackingData?.forEach((t) => {
    if (normalizeDate(t.date) === targetDbDate) {
      occupiedSessions.add(normalizeSession(t.session));
    }
  });

  return SESSIONS.find((s) => !occupiedSessions.has(normalizeSession(s))) || "";
}

function computeBestCourse(
  session: string, 
  date: Date, 
  attendanceData: AttendanceReport | undefined, 
  getCourseCodeById: (id: string) => string
) {
  if (!session || !attendanceData?.studentAttendanceData) return "";
  const dayOfWeek = date.getDay();
  const frequencyMap: Record<string, number> = {};
  const target = normalizeSession(session);

  Object.entries(attendanceData.studentAttendanceData).forEach(
    ([dStr, sessions]: [string, Record<string, unknown>]) => {
      const y = parseInt(dStr.substring(0, 4));
      const m = parseInt(dStr.substring(4, 6)) - 1;
      const d = parseInt(dStr.substring(6, 8));
      if (new Date(y, m, d).getDay() === dayOfWeek) {
        Object.entries(sessions).forEach(([key, s], index) => {
          const slot = s as AttendanceSlot;
          if (slot.course == null || slot.course === "null" || slot.course === 0 || slot.course === "0") return;

          // eslint-disable-next-line security/detect-object-injection
          let name = attendanceData.sessions?.[key]?.name;
          if (!name && slot.session && slot.session !== "null") name = String(slot.session);
          if (!name) {
            const keyInt = parseInt(key);
            name = (!isNaN(keyInt) && keyInt < 20) ? key : String(index + 1);
          }
          if (name && normalizeSession(name) === target) {
            const cid = getCourseCodeById(String(slot.course));
            // eslint-disable-next-line security/detect-object-injection
            frequencyMap[cid] = (frequencyMap[cid] || 0) + 1;
          }
        });
      }
    },
  );

  let best = "";
  let max = 0;
  Object.entries(frequencyMap).forEach(([cid, count]) => {
    if (count > max) { max = count; best = cid; }
  });
  return best;
}

function checkIfSessionBlocked(
  session: string, 
  date: Date, 
  attendanceData: AttendanceReport | undefined, 
  trackingData: TrackAttendance[]
) {
  if (!session) return false;

  const targetSession = normalizeSession(session);
  const dateKey = normalizeDate(date);
  // eslint-disable-next-line security/detect-object-injection
  const officialDay = attendanceData?.studentAttendanceData?.[dateKey];
  let isBlocked = false;

  if (officialDay) {
    isBlocked = Object.entries(officialDay).some(([key, s], index) => {
      const slot = s as AttendanceSlot;

      if (
        slot.course == null || slot.course === "null" || slot.course === 0 ||
        slot.course === "0"
      ) {
        return false;
      }

      // eslint-disable-next-line security/detect-object-injection
      let effectiveName: string | undefined = attendanceData.sessions?.[key]?.name;

      if (!effectiveName && slot.session && slot.session !== "null") {
        effectiveName = String(slot.session);
      }

      if (!effectiveName) {
        const keyInt = parseInt(key);
        effectiveName = (!isNaN(keyInt) && keyInt < 20)
          ? key
          : String(index + 1);
      }

      if (effectiveName && normalizeSession(effectiveName) === targetSession) {
        return true;
      }
      return false;
    });
  }

  if (!isBlocked && trackingData) {
    const targetDbDate = normalizeDate(date);
    isBlocked = trackingData.some((t) => {
      const isMatch = normalizeDate(t.date) === targetDbDate &&
        normalizeSession(t.session) === targetSession;
      return isMatch;
    });
  }

  return isBlocked;
}

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
  const [statusType, setStatusType] = useState<AttendanceStatusType>("Present");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const getDateKey = (d: Date) => normalizeDate(d);

  const { isDisabled } = useDisabledCourses({
    academicYear: selectedYear,
    semester: selectedSemester,
  });

  const { data: classCourses } = useFetchClassCourses({
    semester: selectedSemester,
    year: selectedYear,
    enabled: !!selectedSemester && !!selectedYear,
  });

  const { getCourseCodeById } = useCourseLookup({
    coursesData,
    classCourses,
    attendanceData,
  });

  const sortedCourses = useMemo(() => {
    return computeSortedCourses(coursesData, classCourses, isDisabled, getCourseCodeById);
  }, [coursesData, classCourses, isDisabled, getCourseCodeById]);

  // 1. CALCULATE SEMESTER BOUNDS
  const semesterBounds = useMemo(() => {
    return computeSemesterBounds(selectedSemester, selectedYear);
  }, [selectedSemester, selectedYear]);

  // 2. VALIDATE AND RESET ON OPEN
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        // 1. Clamp date within semester bounds
        if (semesterBounds.min && semesterBounds.max) {
          if (isBefore(date, semesterBounds.min)) {
            setDate(semesterBounds.min);
            setCurrentMonth(semesterBounds.min);
          } else if (isAfter(date, semesterBounds.max)) {
            setDate(semesterBounds.max);
            setCurrentMonth(semesterBounds.max);
          } else {
            setCurrentMonth(date);
          }
        }
        // 2. Reset other fields
        setSession("");
        setCourseId("");
        setRemarks("");
        setStatusType("Present");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, semesterBounds.min, semesterBounds.max]);

  // --- 3. SMART DEFAULTS (Occupancy Check) ---
  const autoSession = useMemo(() => {
    return computeAutoSession(open, attendanceData, trackingData, date);
  }, [date, open, attendanceData, trackingData]);

  // Adjust session state
  useEffect(() => {
    if (open && !session && autoSession) {
      queueMicrotask(() => {
        setSession(autoSession);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getDateKey(date), attendanceData, autoSession]);

  // --- 4. PREFILL COURSE ---
  const bestCourse = useMemo(() => {
    return computeBestCourse(session, date, attendanceData, getCourseCodeById);
  }, [session, date, attendanceData, getCourseCodeById]);

  // Adjust courseId state
  useEffect(() => {
    if (open && !courseId) {
      queueMicrotask(() => {
        if (bestCourse) setCourseId(bestCourse);
        else if (sortedCourses.length > 0) setCourseId(sortedCourses[0].key);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date.getDay(), session, bestCourse, sortedCourses]);


  // --- 5. VALIDATION (Is Session Blocked?) ---
  const isSessionBlocked = useMemo(() => {
    return checkIfSessionBlocked(session, date, attendanceData, trackingData);
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

      let courseIdToSave = courseId.trim().toUpperCase().replace(/[\s\u00A0-]/g, "");
      // eslint-disable-next-line security/detect-object-injection
      const selectedCourse = coursesData?.courses?.[courseId];
      if (selectedCourse?.code) {
        courseIdToSave = selectedCourse.code.trim().toUpperCase().replace(/[\s\u00A0-]/g, "");
      }

      const finalRemarks = optionalReasonSchema.parse(remarks);

      const { error } = await supabase
        .from("tracker")
        .insert({
          auth_user_id: authUser.id,
          course: courseIdToSave,
          date: format(date, "yyyy-MM-dd"),
          session: toRoman(session),
          semester: selectedSemester,
          year: selectedYear,
          status: "extra",
          attendance: attCode,
          remarks: finalRemarks,
        });

      if (error) {
        if (isDutyLeaveConstraintError(error)) {
          toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
          return;
        }
        throw error;
      }

      toast.success("Extra class added successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      if (isDutyLeaveConstraintError(error)) {
        toast.error(getDutyLeaveErrorMessage(courseId, coursesData));
        return;
      }

      logger.error("Add Record Failed:", error);
      const userMessage = getHumanReadableError(error, "attendance");
      toast.error(userMessage);

      Sentry.captureException(error, {
        tags: {
          type: "add_attendance_failure",
          location: "AddAttendanceDialog/handleSubmit",
        },
        extra: {
          courseId,
          date: format(date, "yyyy-MM-dd"),
          session,
        },
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
              <Popover
                open={isCalendarOpen}
                onOpenChange={setIsCalendarOpen}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-accent/20 border-border/50 hover:bg-accent/30",
                    )}
                    aria-label={`Selected date: ${
                      format(date, "MMMM d, yyyy")
                    }. Click to change date`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {format(date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-70 p-3 pointer-events-auto z-50"
                  align="start"
                >
                  {/* Premium Custom Calendar */}
                  <div className="flex flex-col gap-2">
                    {/* Header */}
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setCurrentMonth(subMonths(currentMonth, 1))}
                          aria-label="Previous month"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <div className="text-sm font-semibold">
                          {format(currentMonth, "MMMM yyyy")}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setCurrentMonth(addMonths(currentMonth, 1))}
                          aria-label="Next month"
                        >
                          <ChevronRight
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>

                      {/* Days Header */}
                      <div className="grid grid-cols-7 text-center mb-1">
                        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((
                          dayLabel,
                        ) => (
                          <div
                            key={dayLabel}
                            className="text-[0.8rem] text-muted-foreground font-medium py-1"
                          >
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
                            isDisabled = isBefore(day, semesterBounds.min) ||
                              isAfter(day, semesterBounds.max);
                          }

                          return (
                            <div
                              key={day.toString()}
                              className="flex justify-center"
                            >
                              <button
                                disabled={isDisabled}
                                onClick={() => {
                                  setDate(day);
                                  setIsCalendarOpen(false);
                                }}
                                aria-label={`${format(day, "MMMM d, yyyy")}${
                                  isSelected ? ", selected" : ""
                                }${isTodayDate ? ", today" : ""}${
                                  isDisabled ? ", unavailable" : ""
                                }`}
                                className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                  !isDisabled &&
                                    "hover:bg-accent hover:text-foreground cursor-pointer",
                                  isSelected &&
                                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm scale-105 font-medium",
                                  !isSelected && isTodayDate && !isDisabled &&
                                    "bg-accent/50 text-accent-foreground font-medium border border-border/50",
                                  !isSelected && !isTodayDate && !isDisabled &&
                                    "text-foreground",
                                  isDisabled &&
                                    "text-muted-foreground/30 cursor-not-allowed pointer-events-none",
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
            <Label
              htmlFor="session-select"
              className="text-right text-muted-foreground"
            >
              Session
            </Label>
            <div className="col-span-3">
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger
                  id="session-select"
                  className="bg-accent/20 border-border/50"
                  aria-label="Select class session"
                >
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
                <p
                  id="session-blocked-warning"
                  className="text-[10px] text-red-600 dark:text-red-400 mt-1.5 ml-1 flex items-center gap-1"
                  role="alert"
                  aria-live="polite"
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
                    aria-hidden="true"
                  />
                  Session occupied
                </p>
              )}
            </div>
          </div>

          {/* COURSE */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label
              htmlFor="course-select"
              className="text-right text-muted-foreground pt-3"
            >
              Subject
            </Label>
            <div className="col-span-3 space-y-3">
              <Select
                value={courseId}
                onValueChange={setCourseId}
              >
                <SelectTrigger
                  id="course-select"
                  className="bg-accent/20 hover:bg-accent/30 border-border/50 h-11 w-full backdrop-blur-md transition-all duration-300 text-left ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 whitespace-nowrap overflow-hidden"
                  aria-label="Select course or subject"
                >
                  <div className="flex items-center gap-2.5 w-full min-w-0 overflow-hidden">
                    <BookOpen
                      size={15}
                      className={cn(
                        "shrink-0 transition-colors",
                        courseId ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <SelectValue placeholder="Select Subject" />
                  </div>
                </SelectTrigger>
                <SelectContent className="custom-dropdown border-border/50 max-h-60 w-full min-w-(--radix-select-trigger-width) max-w-[calc(100vw-32px)]">
                  {sortedCourses.map((c: { key: string; name: string; }) => {
                    const code = getCourseCodeById(c.key);
                    const isCourseDisabled = isDisabled(code);
                    return (
                      <SelectItem
                        key={c.key}
                        value={c.key}
                        className={cn(
                          "whitespace-normal py-2",
                          isCourseDisabled && "opacity-60 italic",
                        )}
                      >
                        <span className="leading-tight text-left capitalize truncate block">
                          {c.name.toLowerCase()}
                          {isCourseDisabled && " (Disabled)"}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* STATUS */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-muted-foreground">Status</Label>
            <RadioGroup
              value={statusType}
              onValueChange={(v: AttendanceStatusType) => {
                setStatusType(v);
              }}
              className="col-span-3 flex gap-4"
              aria-label="Select attendance status"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Present"
                  id="r1"
                  className="text-green-500 border-green-500/50"
                />
                <Label
                  htmlFor="r1"
                  className="cursor-pointer text-green-500 font-normal"
                >
                  Present
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Absent"
                  id="r2"
                  className="text-red-500 border-red-500/50"
                />
                <Label
                  htmlFor="r2"
                  className="cursor-pointer text-red-500 font-normal"
                >
                  Absent
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Duty Leave"
                  id="r3"
                  className="text-yellow-500 border-yellow-500/50"
                />
                <Label
                  htmlFor="r3"
                  className="cursor-pointer text-yellow-500 font-normal"
                >
                  DL
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* REMARKS / REASON */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label
              htmlFor="remarks-dialog"
              className="text-right text-muted-foreground"
            >
              {statusType === "Duty Leave" ? "Reason" : "Remarks"}
            </Label>
            <div className="col-span-3">
              <Input
                id="remarks-dialog"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={statusType === "Duty Leave"
                  ? "Required for Duty Leave"
                  : "Optional notes"}
                className={cn(
                  "bg-accent/20 border-border/50",
                  statusType === "Duty Leave" && remarks.length === 0 &&
                    "border-red-500/50 focus-visible:ring-red-500",
                )}
                required={statusType === "Duty Leave"}
                maxLength={255}
              />
              {statusType === "Duty Leave" && remarks.length === 0 && (
                <p className="text-[10px] text-red-500 mt-1.5 ml-1 flex items-center gap-1">
                  Reason is required to add Duty Leave
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 sm:mt-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="hover:bg-accent/50"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !courseId || !session || isSessionBlocked ||
              (statusType === "Duty Leave" && remarks.trim().length === 0)}
            className={cn(
              "custom-button transition-colors min-w-[120px]",
              statusType === "Present" &&
                "bg-green-600 hover:bg-green-700 text-white",
              statusType === "Absent" &&
                "bg-red-600 hover:bg-red-700 text-white",
              statusType === "Duty Leave" &&
                "bg-yellow-600 hover:bg-yellow-700 text-white",
            )}
          >
            {isSubmitting
              ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Saving
                </>
              )
              : "Save Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
