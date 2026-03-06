"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Course } from "@/types";
import { useCourseDetails } from "@/hooks/courses/attendance";
import { AlertCircle, Loader2 } from "lucide-react";
import { calculateAttendance } from "@/lib/logic/bunk";
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useUser } from "@/hooks/users/user";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useFetchSemester, useFetchAcademicYear } from "@/hooks/users/settings";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/**
 * Extended Course interface with additional attendance statistics.
 */
export interface ExtendedCourse extends Course {
  /** Number of present marks (official + tracking combined, used for display) */
  present?: number;
  /** Total attendance records (official + tracking combined, used for display) */
  total?: number;
  /** Official-only present count (not affected by tracking extras/corrections) */
  officialPresent?: number;
  /** Official-only total count (not affected by tracking extras/corrections) */
  officialTotal?: number;
}

/** Pre-defined reasons for disabling a course */
const DISABLE_REASONS = ["Challenge passed", "Other"] as const;

/**
 * Props for CourseCard component.
 */
interface CourseCardProps {
  /** Course data with optional attendance statistics */
  course: ExtendedCourse;
}

/**
 * Course card component displaying attendance statistics and bunk calculator.
 * Shows present/absent/total counts, attendance percentage, and required attendance calculations.
 * 
 * Features:
 * - Real-time attendance percentage
 * - Color-coded status (danger/warning/success)
 * - Bunk calculator (classes can miss/must attend)
 * - Tracking data integration
 * - Local storage preferences
 * 
 * @param course - Course object with attendance data
 * @returns Interactive course card with attendance stats
 * 
 * @example
 * ```tsx
 * <CourseCard course={courseData} />
 * ```
 */
export function CourseCard({ course }: CourseCardProps) {
  const { data: courseDetails, isLoading } = useCourseDetails(
    course.id.toString()
  );

  const { data: user } = useUser();
  const { data: trackingData } = useTrackingData(user);

  const { targetPercentage } = useAttendanceSettings();
  const [showBunkCalc, setShowBunkCalc] = useState(true);

  // Disabled courses management
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();
  const { isDisabled: isCourseDisabled, getDisableReason, disableCourse, enableCourse, isLoading: isDisabledCoursesLoading } = useDisabledCourses({
    academicYear: academicYearData,
    semester: semesterData,
  });
  // undefined when course.code is missing — guards against creating a "" key in disabled_courses.
  const courseCode = course.code ? course.code.toUpperCase() : undefined;
  const disabled = courseCode ? isCourseDisabled(courseCode) : false;

  // Dialog state for disable/enable workflow
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [disableReason, setDisableReason] = useState<string>("Challenge passed");
  const [customReason, setCustomReason] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const disableInFlightRef = useRef(false);
  const enableInFlightRef = useRef(false);
  const isOtherReason = disableReason === "Other";

  const normalize = useCallback((s: string | undefined) => 
    s?.toLowerCase().replace(/[^a-z0-9]/g, "") || "", 
    []
  );

  const courseIdentifiers = useMemo(() => ({
    targetId: String(course.id),
    targetName: normalize(course.name),
    targetCode: normalize(course.code),
  }), [course.id, course.name, course.code, normalize]);

  useEffect(() => {
    let isMounted = true;

    // Load user-scoped preference to avoid cross-user leakage on shared devices
    const loadSetting = async () => {
      try {
        // Get Supabase auth user ID (UUID) to match the localStorage keys written in
        // login-form.tsx and user-settings.ts. This ensures we read the correct
        // user-scoped preference, not the numeric backend user ID from useUser().
        // Use getSession() (local, synchronous) instead of getUser() (network call)
        // to avoid N network requests on pages with many CourseCards.
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        
        if (userId) {
          const scopedKey = `showBunkCalc_${userId}`;
          const scopedValue = localStorage.getItem(scopedKey);
          if (scopedValue !== null && isMounted) {
            setShowBunkCalc(scopedValue === "true");
          }
          // Don't fallback to legacy key when user is authenticated to avoid cross-user leakage
        } else {
          // Only use legacy key when there is no authenticated user
          const legacyValue = localStorage.getItem("showBunkCalc");
          if (legacyValue !== null && isMounted) {
            setShowBunkCalc(legacyValue === "true");
          }
        }
      } catch {
        // Ignore storage access errors (e.g., private mode, disabled storage)
        // Fall back to default value (true) already set in useState
      }
    };

    loadSetting();

    const handleBunkCalcToggle = (event: CustomEvent) => {
      if (isMounted) {
        setShowBunkCalc(event.detail);
      }
    };

    window.addEventListener(
      "bunkCalcToggle",
      handleBunkCalcToggle as EventListener
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        "bunkCalcToggle",
        handleBunkCalcToggle as EventListener
      );
    };
  }, []);

  const stats = useMemo(() => {
    // 1. Official Data (From API)
    // Fall back to officialPresent/officialTotal (official-only, no tracking extras)
    // to avoid contaminating safeMetrics with tracking data when courseDetails is not yet loaded.
    // Derive total from present+absent instead of courseDetails.total, because the EzyGo
    // /summery endpoint may include revision or untracked slots in its total field, causing
    // it to exceed present+absent and diverge from our per-day count.
    const realPresent = courseDetails?.present ?? course.officialPresent ?? 0;
    const realAbsent = courseDetails?.absent ?? Math.max((course.officialTotal ?? 0) - (course.officialPresent ?? 0), 0);
    const realTotal = courseDetails
      ? courseDetails.present + courseDetails.absent
      : (course.officialTotal ?? 0);
    const officialPercentage = realTotal > 0 ? (realPresent / realTotal) * 100 : 0;
    
    // 2. Filter Tracking Data (Local Calculation Backup)
     const { targetId, targetName, targetCode } = courseIdentifiers;

    const courseTracks = trackingData?.filter(t => {
        if (String(t.course) === targetId) return true;
        const tName = normalize(String(t.course));
        return tName === targetName || (targetCode && tName === targetCode);
    }) || [];
    
    // 3. Calculate Modifiers (For visual breakdown only)
    let extraPresent = 0;
    let extraAbsent = 0;
    let correctionPresent = 0; 

    courseTracks.forEach(t => {
        const isPos = t.attendance === 110 || t.attendance === 225; // Present or DL
        
        if (t.status === 'extra') {
            // Extra: Adds to Total AND (Present or Absent)
            if (isPos) extraPresent++;
            else extraAbsent++;
        } else {
            // Correction: Only swaps status. Does NOT add to total.
            // Assumption: User corrects Absent -> Present
            if (isPos) correctionPresent++;
        }
    });

    const extras = extraPresent + extraAbsent;

    // 4. Final Calculation
    const finalPresent = course.present !== undefined ? course.present : realPresent;
    const finalTotal = course.total !== undefined ? course.total : realTotal;
    
    const displayPercentage = finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0;

    // 5. Metrics
    const safeMetrics = calculateAttendance(realPresent, realTotal, targetPercentage ?? 75);
    const extraMetrics = calculateAttendance(finalPresent, finalTotal, targetPercentage ?? 75);

    return {
      realPresent,
      realAbsent,
      realTotal,
      correctionPresent, 
      extraPresent,           
      extras,
      extraAbsent,
      displayTotal: finalTotal,
      displayPercentage: parseFloat(displayPercentage.toFixed(2)),
      officialPercentage: parseFloat(officialPercentage.toFixed(2)),
      safeMetrics,
      extraMetrics
    };
  }, [courseDetails, course.officialPresent, course.officialTotal, course.present, course.total, courseIdentifiers, trackingData, targetPercentage, normalize]);

  const hasAttendanceData = useMemo(() => 
    !isLoading && stats.displayTotal > 0,
    [isLoading, stats.displayTotal]
  );

  const isGain = useMemo(() => 
    stats.displayPercentage >= stats.officialPercentage,
    [stats.displayPercentage, stats.officialPercentage]
  );

  const statusColorClasses = useMemo(() => {
    if (!hasAttendanceData) return {
      card: "",
      headerBg: "bg-muted/60",
      headerBorder: "border-border/60",
    };
    const pct = stats.displayPercentage;
    const target = targetPercentage ?? 75;
    if (pct >= target) return {
      card: "border-t-[3px] border-t-green-500/70 dark:border-t-transparent",
      headerBg: "bg-green-500/10 dark:bg-muted/40",
      headerBorder: "border-green-500/30 dark:border-border/60",
    };
    if (pct >= target - 10) return {
      card: "border-t-[3px] border-t-amber-500/70 dark:border-t-transparent",
      headerBg: "bg-amber-500/10 dark:bg-muted/40",
      headerBorder: "border-amber-500/30 dark:border-border/60",
    };
    return {
      card: "border-t-[3px] border-t-red-500/70 dark:border-t-transparent",
      headerBg: "bg-red-500/10 dark:bg-muted/40",
      headerBorder: "border-red-500/30 dark:border-border/60",
    };
  }, [hasAttendanceData, stats.displayPercentage, targetPercentage]);

  const capitalize = useCallback((str: string) => {
    if (!str) return "";
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }, []);

  const courseName = useMemo(() => 
    capitalize(course.name.toLowerCase()),
    [course.name, capitalize]
  );

  return (
    <Card className={cn("pt-0 pb-0 custom-container overflow-clip h-full min-h-70", statusColorClasses.card, (disabled || (!isLoading && !hasAttendanceData)) && "opacity-60")}>
      <CardHeader className={cn("flex justify-between items-start flex-row gap-2 pt-6 pb-5 border-b-2", statusColorClasses.headerBg, statusColorClasses.headerBorder, disabled && "bg-red-500/10 dark:bg-muted/40 border-red-500/30 dark:border-border/60")}>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg font-semibold wrap-break-word leading-tight">
            {courseName}
          </CardTitle>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <Badge
            variant="secondary"
            className="h-7 uppercase custom-button rounded-md! bg-foreground/10! scale-105 shrink-0"
            aria-hidden="true"
          >
            {course.code}
          </Badge>
          {/* Enabled/Disabled dot toggle */}
          {!isLoading && !hasAttendanceData ? (
            <span
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border select-none bg-muted/40 text-muted-foreground border-border/40 cursor-default"
              aria-label={`No attendance data for ${courseCode ?? course.name}`}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
              No data
            </span>
          ) : (
            <button
              type="button"
              disabled={isDisabledCoursesLoading || !courseCode}
              onClick={() => {
                if (disabled) {
                  setShowEnableDialog(true);
                } else {
                  setDisableReason("Challenge passed");
                  setCustomReason("");
                  setShowDisableDialog(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors cursor-pointer select-none",
                (isDisabledCoursesLoading || !courseCode)
                  ? "opacity-50 cursor-not-allowed"
                  : disabled
                  ? "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20"
                  : "bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20"
              )}
              aria-label={disabled ? `Enable course ${courseCode ?? course.name}` : `Disable course ${courseCode ?? course.name}`}
            >
              <span className={cn("inline-block w-2 h-2 rounded-full", disabled ? "bg-red-500" : "bg-green-500")} aria-hidden="true" />
              {disabled ? "Disabled" : "Enabled"}
            </button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="h-full pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="animate-pulse h-4 w-24 bg-secondary rounded mb-2"></div>
            <div className="animate-pulse h-2 w-16 bg-secondary rounded"></div>
          </div>
        ) : hasAttendanceData ? (
          <>
            {/* GRID STATS */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              
              {/* PRESENT */}
              <div className="text-center p-1 bg-green-500/10 border border-green-500/25 dark:bg-input/60 dark:border-transparent rounded-md py-2.5 flex gap-1 flex-col">
                <span className="text-xs text-muted-foreground block">Present</span>
                <div className="flex items-center justify-center gap-1.5 flex-wrap px-1">
                  <span className="text-sm font-medium text-green-500">
                    {stats.realPresent}
                  </span>
                  {stats.correctionPresent > 0 && (
                    <span className="text-xs font-medium text-orange-500" title="Corrections">
                      +{stats.correctionPresent}
                    </span>
                  )}
                  {stats.extraPresent > 0 && (
                    <span className="text-xs font-medium text-blue-400" title="Extras">
                      +{stats.extraPresent}
                    </span>
                  )}
                </div>
              </div>

              {/* ABSENT */}
              <div className="text-center p-1 bg-red-500/10 border border-red-500/25 dark:bg-input/60 dark:border-transparent rounded-md py-2.5 flex gap-1 flex-col">
                <span className="text-xs text-muted-foreground block">Absent</span>
                <div className="flex items-center justify-center gap-0.5">
                  <span className="text-sm font-medium text-red-500">
                    {stats.realAbsent}
                  </span>
                  
                  {stats.correctionPresent > 0 && (
                    <span className="text-xs font-medium text-orange-500">
                      -{stats.correctionPresent}
                    </span>
                  )}

                  {stats.extraAbsent > 0 && (
                    <span className="text-xs font-medium text-blue-400">
                      +{stats.extraAbsent}
                    </span>
                  )}
                </div>
              </div>

              {/* TOTAL */}
              <div className="text-center p-1 bg-sky-500/10 border border-sky-500/25 dark:bg-input/60 dark:border-transparent rounded-md py-2.5 flex gap-1 flex-col">
                <span className="text-xs text-muted-foreground block">Total</span>
                <div className="flex items-center justify-center gap-0.5">
                  <span className="text-sm font-medium">
                    {stats.realTotal}
                  </span>
                  {stats.extras > 0 && (
                    <span className="text-xs font-medium text-blue-400">
                      +{stats.extras}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* DUAL PROGRESS BAR */}
            <div className="mt-8">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                {isGain ? (
                  <>
                    {/* SCENARIO 1: GAIN (Merged > Official) */}
                    <div
                      className="absolute top-0 left-0 h-full bg-primary/40 transition-all duration-500 ease-in-out"
                      style={{ width: `${Math.min(stats.displayPercentage, 100)}%` }}
                    >
                      <div className="h-full w-full opacity-30 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-size-[8px_8px]" />
                    </div>
                    <div
                      className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-in-out"
                      style={{ width: `${Math.min(stats.officialPercentage, 100)}%` }}
                    />
                  </>
                ) : (
                  <>
                    {/* SCENARIO 2: LOSS (Merged < Official) */}
                    <div
                      className="absolute top-0 left-0 h-full bg-red-500/80 transition-all duration-500 ease-in-out"
                      style={{ width: `${Math.min(stats.officialPercentage, 100)}%` }}
                    >
                        <div className="h-full w-full opacity-30 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-size-[8px_8px]" />
                    </div>
                    <div
                      className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-in-out"
                      style={{ width:`${Math.min(stats.displayPercentage, 100)}%` }}
                    />
                  </>
                )}
              </div>

              <div className="flex justify-between items-center mb-1 text-sm mt-2 text-muted-foreground font-medium">
                <span>Attendance</span>
                <div className="flex items-center gap-2">
                  {(stats.correctionPresent > 0 || stats.extras > 0) && stats.officialPercentage !== stats.displayPercentage && (
                    <span className="text-xs">
                      {stats.officialPercentage}% <span className="mx-0.5">→</span>
                    </span>
                  )}
                  <span className={(stats.correctionPresent > 0 || stats.extras > 0) ? (isGain ? "text-primary font-bold" : "text-red-500 dark:text-red-400 font-bold") : ""}>
                    {stats.displayPercentage}%
                  </span>
                </div>
              </div>
            </div>

            {/* BUNK CALCULATOR SECTION */}
            {showBunkCalc && (
              <div className="mt-4">
                {(() => {
                  const hasModifications = stats.correctionPresent > 0 || stats.extras > 0;
                  
                  if (!hasModifications) {
                    return (
                      <div className="bg-accent/40 rounded-md py-2 px-3 flex justify-center items-center">
                        <p className="text-sm text-muted-foreground text-center font-medium leading-tight">
                          {stats.safeMetrics.canBunk > 0 ? (
                            <>
                              You can safely bunk <span className="font-bold text-green-500">{stats.safeMetrics.canBunk}</span> {stats.safeMetrics.canBunk === 1 ? "class 🥳" : "classes 🥳🥳"}
                            </>
                          ) : stats.safeMetrics.requiredToAttend > 0 ? (
                            <>
                              You need to attend <span className="font-bold text-amber-600 dark:text-amber-500">{!isFinite(stats.safeMetrics.requiredToAttend) ? "all" : stats.safeMetrics.requiredToAttend}</span> more {stats.safeMetrics.requiredToAttend === 1 ? "class 💀" : "classes 💀💀"}
                            </>
                          ) : (
                            <>You are on the edge. Skipping now&apos;s risky 💀💀</>
                          )}
                        </p>
                      </div>
                    );
                  }

                  // No official data yet — skip the Safe (Official) panel entirely and
                  // show only the tracking-based result so we don't mislead the user.
                  const noOfficialData = stats.realTotal === 0;

                  // CHECK: Official bunkable > Tracking bunkable
                  const officialIsBetter = 
                    // Official has MORE bunkable classes
                    stats.safeMetrics.canBunk > stats.extraMetrics.canBunk ||
                    // OR official needs FEWER classes to attend (when both are below target)
                    (stats.safeMetrics.canBunk === 0 && 
                    stats.extraMetrics.canBunk === 0 && 
                    stats.safeMetrics.requiredToAttend < stats.extraMetrics.requiredToAttend);

                  if (noOfficialData) {
                    // TRACKING ONLY — no official data yet, show the purple tracking panel full-width
                    return (
                      <div className="bg-purple-500/10 border border-purple-500/35 dark:border-purple-500/20 rounded-md p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-[10px] font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wide">Tracking Data</span>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium leading-tight">
                          {stats.extraMetrics.canBunk > 0 ? (
                            <>Bunkable: <span className="font-bold text-green-500">{stats.extraMetrics.canBunk}</span> 🥳</>
                          ) : stats.extraMetrics.requiredToAttend > 0 ? (
                            <>Must Attend: <span className="font-bold text-amber-600 dark:text-amber-500">{!isFinite(stats.extraMetrics.requiredToAttend) ? "all" : stats.extraMetrics.requiredToAttend} 💀💀</span></>
                          ) : (
                            <>Edge 💀</>
                          )}
                        </p>
                      </div>
                    );
                  }

                  if (officialIsBetter) {
                    // SHOW ONLY TRACKING (single display)
                    return (
                      <div className="bg-accent/40 rounded-md py-2 px-3 flex justify-center items-center">
                        <p className="text-sm text-muted-foreground text-center font-medium leading-tight">
                          {stats.extraMetrics.canBunk > 0 ? (
                            <>
                              You can safely bunk <span className="font-bold text-green-500">{stats.extraMetrics.canBunk}</span> {stats.extraMetrics.canBunk === 1 ? "class 🥳" : "classes 🥳🥳"}
                            </>
                          ) : stats.extraMetrics.requiredToAttend > 0 ? (
                            <>
                              You need to attend <span className="font-bold text-amber-600 dark:text-amber-500">{!isFinite(stats.extraMetrics.requiredToAttend) ? "all" : stats.extraMetrics.requiredToAttend}</span> more {stats.extraMetrics.requiredToAttend === 1 ? "class 💀" : "classes 💀💀"}
                            </>
                          ) : (
                            <>You are on the edge. Skipping now&apos;s risky 💀💀</>
                          )}
                        </p>
                      </div>
                    );
                  }

                  // TRACKING IS BETTER OR EQUAL
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {/* SAFE COUNT */}
                      <div className="bg-blue-500/10 border border-blue-500/35 dark:border-blue-500/20 rounded-md p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide">Safe (Official)</span>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium leading-tight">
                          {stats.safeMetrics.canBunk > 0 ? (
                            <>
                              Bunkable: <span className="font-bold text-green-500">{stats.safeMetrics.canBunk}</span>
                            </>
                          ) : stats.safeMetrics.requiredToAttend > 0 ? (
                            <>
                              Must Attend: <span className="font-bold text-amber-600 dark:text-amber-500">{!isFinite(stats.safeMetrics.requiredToAttend) ? "all" : stats.safeMetrics.requiredToAttend} 💀💀</span>
                            </>
                          ) : (
                            <>Edge 💀</>
                          )}
                        </p>
                      </div>

                      {/* OPTIMISTIC COUNT */}
                      <div className="bg-purple-500/10 border border-purple-500/35 dark:border-purple-500/20 rounded-md p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-[10px] font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wide">+ Tracking Data</span>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium leading-tight">
                          {stats.extraMetrics.canBunk > 0 ? (
                            <>
                              Bunkable: <span className="font-bold text-green-500">{stats.extraMetrics.canBunk}</span> 🥳
                            </>
                          ) : stats.extraMetrics.requiredToAttend > 0 ? (
                            <>
                              Must Attend: <span className="font-bold text-amber-600 dark:text-amber-500">{!isFinite(stats.extraMetrics.requiredToAttend) ? "all" : stats.extraMetrics.requiredToAttend} 💀💀</span>
                            </>
                          ) : (
                            <>Edge 💀</>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 px-2 h-full gap-1">
            <div className="flex items-center gap-2 mb-1 text-amber-600 dark:text-amber-500">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium text-sm">No attendance data</span>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Instructor has not updated attendance records yet.
            </p>
          </div>
        )}
      </CardContent>

      {/* Disable Course Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={(open) => {
        if (isDisabling) return;
        setShowDisableDialog(open);
      }}>
        <AlertDialogContent className="custom-container">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {course.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling this course will exclude it from your total attendance, stat cards, and the attendance chart. It will still appear on the course grid and calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label htmlFor="disable-reason-select" className="text-sm font-medium">Reason</label>
            <Select value={disableReason} onValueChange={(v) => { setDisableReason(v); if (v !== "Other") setCustomReason(""); }}>
              <SelectTrigger id="disable-reason-select" className="w-full custom-dropdown">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent className="custom-dropdown">
                {DISABLE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOtherReason && (
              <Input
                placeholder="Enter your reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-1"
                autoFocus
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="custom-button" disabled={isDisabling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="custom-button bg-red-600! hover:bg-red-700! border-none!"
              disabled={isDisabling || (isOtherReason && !customReason.trim())}
              aria-busy={isDisabling}
              onClick={async (event) => {
                event.preventDefault();
                if (!courseCode || disableInFlightRef.current) return;
                disableInFlightRef.current = true;
                const reason = isOtherReason ? customReason.trim() : disableReason;
                setIsDisabling(true);
                try {
                  await disableCourse(courseCode, reason);
                  setShowDisableDialog(false);
                  toast.success(`${courseCode} disabled`, {
                    description: reason,
                  });
                } catch {
                  // Provider-level mutation handler already displays an error toast.
                } finally {
                  disableInFlightRef.current = false;
                  setIsDisabling(false);
                }
              }}
            >
              {isDisabling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Disabling...
                </>
              ) : (
                "Disable"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enable Course Dialog */}
      <AlertDialog open={showEnableDialog} onOpenChange={(open) => {
        if (isEnabling) return;
        setShowEnableDialog(open);
      }}>
        <AlertDialogContent className="custom-container">
          <AlertDialogHeader>
            <AlertDialogTitle>Enable {course.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This course was disabled with reason: <span className="font-semibold text-foreground">&ldquo;{(courseCode ? getDisableReason(courseCode) : null) ?? "N/A"}&rdquo;</span>.
              Enabling it will include it back in your total attendance calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="custom-button" disabled={isEnabling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="custom-button bg-green-600! hover:bg-green-700! border-none!"
              disabled={isEnabling}
              aria-busy={isEnabling}
              onClick={async (event) => {
                event.preventDefault();
                if (!courseCode || enableInFlightRef.current) return;
                enableInFlightRef.current = true;
                setIsEnabling(true);
                try {
                  await enableCourse(courseCode);
                  setShowEnableDialog(false);
                  toast.success(`${courseCode} enabled`);
                } catch {
                  // Provider-level mutation handler already displays an error toast.
                } finally {
                  enableInFlightRef.current = false;
                  setIsEnabling(false);
                }
              }}
            >
              {isEnabling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Enabling...
                </>
              ) : (
                "Enable"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}