"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Course } from "@/types";
import { useCourseDetails } from "@/hooks/courses/attendance";
import { AlertCircle } from "lucide-react";
import { calculateAttendance } from "@/lib/logic/bunk";
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useUser } from "@/hooks/users/user";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Extended Course interface with additional attendance statistics.
 */
export interface ExtendedCourse extends Course {
  /** Number of present marks */
  present?: number;
  /** Total attendance records */
  total?: number;
}

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
    // 1. Official Data (From API) - Use course prop as fallback for initial render
    const realPresent = courseDetails?.present ?? course.present ?? 0;
    const realTotal = courseDetails?.total ?? course.total ?? 0;
    const realAbsent = courseDetails?.absent ?? Math.max(realTotal - realPresent, 0);
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
  }, [courseDetails?.present, courseDetails?.total, courseDetails?.absent, trackingData, courseIdentifiers, course.present, course.total, targetPercentage, normalize]);

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
      headerBg: "bg-green-500/8 dark:bg-muted/40",
      headerBorder: "border-green-500/30 dark:border-border/60",
    };
    if (pct >= target - 10) return {
      card: "border-t-[3px] border-t-amber-500/70 dark:border-t-transparent",
      headerBg: "bg-amber-500/8 dark:bg-muted/40",
      headerBorder: "border-amber-500/30 dark:border-border/60",
    };
    return {
      card: "border-t-[3px] border-t-red-500/70 dark:border-t-transparent",
      headerBg: "bg-red-500/8 dark:bg-muted/40",
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
    <Card className={cn("pt-0 pb-0 custom-container overflow-clip h-full min-h-70", statusColorClasses.card)}>
      <CardHeader className={cn("flex justify-between items-start flex-row gap-2 pt-6 pb-5 border-b-2", statusColorClasses.headerBg, statusColorClasses.headerBorder)}>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg font-semibold wrap-break-word leading-tight">
            {courseName}
          </CardTitle>
        </div>
        <Badge
          variant="secondary"
          className="h-7 uppercase custom-button rounded-md! bg-foreground/10! scale-105 shrink-0"
          aria-hidden="true"
        >
          {course.code}
        </Badge>
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

                  // CHECK: Official bunkable > Tracking bunkable
                  const officialIsBetter = 
                    // Official has MORE bunkable classes
                    stats.safeMetrics.canBunk > stats.extraMetrics.canBunk ||
                    // OR official needs FEWER classes to attend (when both are below target)
                    (stats.safeMetrics.canBunk === 0 && 
                    stats.extraMetrics.canBunk === 0 && 
                    stats.safeMetrics.requiredToAttend < stats.extraMetrics.requiredToAttend);

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
    </Card>
  );
}