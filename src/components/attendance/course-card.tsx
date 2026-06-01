"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Course, TrackAttendance } from "@/types";
import { useCourseDetails } from "@/hooks/courses/attendance";
import { AlertCircle, Edit2, Loader2, User2, UserCog } from "lucide-react";
import { calculateAttendance } from "@/lib/logic/bunk";
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useProfile } from "@/hooks/users/profile";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { reasonTextSchema } from "@/lib/validation/text";
import { toast } from "sonner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useFetchUserSettings } from "@/hooks/users/settings";
import { getReconciledStats } from "@/lib/logic/attendance-reconciliation";
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
import { normalizeCourseCode } from "@/lib/utils";

/**
 * Extended Course interface with additional attendance statistics.
 */
export interface ExtendedCourse extends Course {
  present?: number;
  total?: number;
  officialPresent?: number;
  officialTotal?: number;
  correctionPresent?: number;
  extraPresent?: number;
  extrasCount?: number;
  extraAbsent?: number;
}

interface ActiveCourseDetails {
  present: number;
  absent: number;
  total: number;
}

export interface CourseCardStats {
  realPresent: number;
  realAbsent: number;
  realTotal: number;
  correctionPresent: number;
  extraPresent: number;
  extras: number;
  extraAbsent: number;
  displayTotal: number;
  displayPercentage: number;
  officialPercentage: number;
  safeMetrics: ReturnType<typeof calculateAttendance>;
  extraMetrics: ReturnType<typeof calculateAttendance>;
}

/** Pre-defined reasons for disabling a course */
const DISABLE_REASONS = [
  "Challenge passed",
  "Course not offered this semester",
  "Already completed/Exempted",
  "External/Non-Portal course",
  "Incorrectly imported",
  "Dropped course",
  "Other"
] as const;

/**
 * Props for CourseCard component.
 */
interface CourseCardProps {
  course: ExtendedCourse;
  initialCourseDetails?: ActiveCourseDetails | null;
  isBatchLoading?: boolean;
  instructorName?: string;
  hasCustomInstructor?: boolean;
  onEditInstructor?: () => void;
  supabaseUserId?: string;
}

interface BunkPanelProps {
  stats: CourseCardStats;
  trackingIsStrictlyBetter: boolean;
  noOfficialData: boolean;
}

function StatusMessage({ canBunk, requiredToAttend }: { canBunk: number; requiredToAttend: number }) {
  if (canBunk > 0) {
    return (
      <>
        You can bunk <span className="font-bold text-green-500">{canBunk}</span> {canBunk === 1 ? "class" : "classes"} 🥳
      </>
    );
  }
  if (requiredToAttend > 0) {
    return (
      <span className="text-red-500 dark:text-red-400">
        {!isFinite(requiredToAttend) ? (
          <span className="font-bold">Impossible 💀</span>
        ) : (
          <>You need to attend <span className="font-bold">{requiredToAttend}</span> more {requiredToAttend === 1 ? "class" : "classes"} 💀</>
        )}
      </span>
    );
  }
  return <span className="text-red-500 dark:text-red-400 font-bold">You are on the edge 💀</span>;
}

function renderPanelMetrics(metrics: ReturnType<typeof calculateAttendance>, showPartyEmoji: boolean) {
  if (metrics.canBunk > 0) {
    return (
      <>Bunkable: <span className="font-bold text-green-500">{metrics.canBunk}</span>{showPartyEmoji ? " 🥳" : ""}</>
    );
  }
  if (metrics.requiredToAttend > 0) {
    if (!isFinite(metrics.requiredToAttend)) {
      return <span className="font-bold text-red-500 dark:text-red-400">Impossible 💀</span>;
    }
    return <>Must Attend: <span className="font-bold text-red-500 dark:text-red-400">{metrics.requiredToAttend}</span> 💀</>;
  }
  return <span className="text-red-500 dark:text-red-400 font-bold">Edge 💀</span>;
}

function BunkCalculatorPanel({ stats, trackingIsStrictlyBetter, noOfficialData }: BunkPanelProps) {
  const hasModifications = stats.correctionPresent > 0 || stats.extras > 0;
  
  if (!hasModifications) {
    return (
      <div className="bg-accent/40 rounded-md py-2 px-3 flex justify-center items-center">
        <p className="text-sm text-muted-foreground text-center font-medium leading-tight">
          <StatusMessage canBunk={stats.safeMetrics.canBunk} requiredToAttend={stats.safeMetrics.requiredToAttend} />
        </p>
      </div>
    );
  }

  if (noOfficialData || !trackingIsStrictlyBetter) {
    return (
      <div className="bg-accent/40 rounded-md py-2 px-3 flex justify-center items-center">
        <p className="text-sm text-muted-foreground text-center font-medium leading-tight">
          <StatusMessage canBunk={stats.extraMetrics.canBunk} requiredToAttend={stats.extraMetrics.requiredToAttend} />
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* SAFE COUNT */}
      <div className="bg-blue-600/10 border border-blue-600/35 dark:border-blue-600/20 rounded-md p-2">
        <div className="flex items-center gap-1.5 mb-1">
          <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Safe (Official)</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium leading-tight">
          {renderPanelMetrics(stats.safeMetrics, false)}
        </p>
      </div>

      {/* OPTIMISTIC COUNT */}
      <div className="bg-primary/15 border border-primary/30 dark:border-primary/20 rounded-md p-2">
        <div className="flex items-center gap-1.5 mb-1">
          <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">+ Tracking Data</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium leading-tight">
          {renderPanelMetrics(stats.extraMetrics, true)}
        </p>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  disabled: boolean;
  isSummaryLoading: boolean;
  displayTotal: number;
  isTrackingOnly: boolean;
  isDisabledCoursesLoading: boolean;
  courseCode: string | undefined;
  courseName: string;
  hasSemesterContext: boolean;
  onEnable: () => void;
  onDisable: () => void;
}

function CourseStatusBadge({
  disabled,
  isSummaryLoading,
  displayTotal,
  isTrackingOnly,
  isDisabledCoursesLoading,
  courseCode,
  courseName,
  hasSemesterContext,
  onEnable,
  onDisable
}: StatusBadgeProps) {
  const isActionDisabled = isDisabledCoursesLoading || !courseCode || !hasSemesterContext;
  const commonClasses = cn(
    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors cursor-pointer select-none",
    isActionDisabled && "opacity-50 cursor-not-allowed"
  );
  
  if (disabled) {
    return (
      <button type="button" disabled={isActionDisabled} onClick={onEnable} className={cn(commonClasses, "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20")} aria-label={`Enable course ${courseCode ?? courseName}`}>
        <span className="inline-block w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
        Disabled
      </button>
    );
  }
  if (!isSummaryLoading && displayTotal === 0) {
    return (
      <button type="button" disabled={isActionDisabled} onClick={onDisable} className={cn(commonClasses, "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted/60")} aria-label={`No attendance data - click to disable ${courseCode ?? courseName}`}>
        <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
        No data
      </button>
    );
  }
  if (isTrackingOnly) {
    return (
      <button type="button" disabled={isActionDisabled} onClick={onDisable} className={cn(commonClasses, "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20")} aria-label={`Tracking data only - click to disable ${courseCode ?? courseName}`}>
        <span className="inline-block w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
        Tracking
      </button>
    );
  }
  return (
    <button type="button" disabled={isActionDisabled} onClick={onDisable} className={cn(commonClasses, "bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20")} aria-label={`Disable course ${courseCode ?? courseName}`}>
      <span className="inline-block w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
      Enabled
    </button>
  );
}

function calculateCourseStats(
  course: ExtendedCourse,
  courseIdentifiers: { targetId: string; targetName: string; targetCode: string },
  trackingData: TrackAttendance[] | undefined,
  activeCourseDetails: ActiveCourseDetails | null | undefined,
  targetPercentage: number | undefined,
  normalize: (s: string | undefined) => string
): CourseCardStats {
  const { targetId, targetName, targetCode } = courseIdentifiers;

  const courseTracks = trackingData?.filter(t => {
    if (String(t.course) === targetId) return true;
    const tName = normalize(String(t.course));
    return tName === targetName || (targetCode && tName === targetCode);
  }) || [];

  if (course.present !== undefined && course.total !== undefined) {
    const officialPresent = course.officialPresent ?? 0;
    const officialTotal = course.officialTotal ?? 0;
    const reconciled = {
      realPresent: officialPresent,
      realTotal: officialTotal,
      realAbsent: Math.max(officialTotal - officialPresent, 0),
      finalPresent: course.present,
      finalTotal: course.total,
      correctionPresent: course.correctionPresent ?? 0,
      extraPresent: course.extraPresent ?? 0,
      extrasCount: course.extrasCount ?? 0,
      extraAbsent: course.extraAbsent ?? 0,
      officialPercentage: officialTotal ? (officialPresent / officialTotal) * 100 : 0,
      finalPercentage: course.total ? (course.present / course.total) * 100 : 0,
    };

    const safeMetrics = calculateAttendance(reconciled.realPresent, reconciled.realTotal, targetPercentage ?? 75);
    const extraMetrics = calculateAttendance(reconciled.finalPresent, reconciled.finalTotal, targetPercentage ?? 75);

    return {
      ...reconciled,
      displayTotal: reconciled.finalTotal, 
      displayPercentage: parseFloat(reconciled.finalPercentage.toFixed(2)),
      officialPercentage: parseFloat(reconciled.officialPercentage.toFixed(2)),
      safeMetrics,
      extraMetrics,
      realAbsent: reconciled.realTotal - reconciled.realPresent,
      extras: reconciled.extrasCount,
    };
  }

  const reconciled = getReconciledStats(
    String(course.id),
    {
      present: activeCourseDetails?.present ?? course.officialPresent ?? 0,
      absent: activeCourseDetails?.absent ?? Math.max((course.officialTotal ?? 0) - (course.officialPresent ?? 0), 0),
      total: activeCourseDetails ? (activeCourseDetails.present + activeCourseDetails.absent) : (course.officialTotal ?? 0)
    },
    undefined,
    courseTracks
  );

  const safeMetrics = calculateAttendance(reconciled.realPresent, reconciled.realTotal, targetPercentage ?? 75);
  const extraMetrics = calculateAttendance(reconciled.finalPresent, reconciled.finalTotal, targetPercentage ?? 75);

  return {
    realPresent: reconciled.realPresent,
    realAbsent: reconciled.realAbsent,
    realTotal: reconciled.realTotal,
    correctionPresent: reconciled.correctionPresent, 
    extraPresent: reconciled.extraPresent,           
    extras: reconciled.extrasCount,
    extraAbsent: reconciled.extraAbsent,
    displayTotal: reconciled.finalTotal,
    displayPercentage: reconciled.finalPercentage,
    officialPercentage: reconciled.officialPercentage,
    safeMetrics,
    extraMetrics
  };
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
export function CourseCard({ 
  course, 
  initialCourseDetails,
  isBatchLoading,
  instructorName,
  hasCustomInstructor,
  onEditInstructor,
  supabaseUserId
}: CourseCardProps) {
  const courseCodeNormalized = normalizeCourseCode(course.code || String(course.id));
  const { data: courseDetails, isLoading } = useCourseDetails(
    courseCodeNormalized,
    Number(course.id),
    course.name,
    { 
      enabled: !initialCourseDetails && !isBatchLoading && !!(course.code || course.id),
      staleTime: initialCourseDetails ? Infinity : 10 * 60 * 1000,
    }
  );

  const activeCourseDetails = initialCourseDetails || courseDetails;
  const isSummaryLoading = isLoading && !initialCourseDetails;

  const { data: profile } = useProfile();
  const { data: trackingData } = useTrackingData(profile);

  const { targetPercentage } = useAttendanceSettings();
  const [showBunkCalc, setShowBunkCalc] = useState(true);

  // Disabled courses management
  const { data: userSettings } = useFetchUserSettings();
  const semesterData = userSettings?.semester;
  const academicYearData = userSettings?.academicYear;

  const { isDisabled: isCourseDisabled, getDisableReason, disableCourse, enableCourse, isLoading: isDisabledCoursesLoading } = useDisabledCourses({
    academicYear: academicYearData,
    semester: semesterData,
  });
  const hasSemesterContext = Boolean(academicYearData && semesterData);
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

    const loadSetting = async () => {
      try {
        let userId = supabaseUserId;
        
        if (!userId) {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id;
        }
        
        if (userId) {
          const scopedKey = `showBunkCalc_${userId}`;
          const scopedValue = localStorage.getItem(scopedKey);
          if (scopedValue !== null && isMounted) {
            setShowBunkCalc(scopedValue === "true");
          }
        } else {
          const legacyValue = localStorage.getItem("showBunkCalc");
          if (legacyValue !== null && isMounted) {
            setShowBunkCalc(legacyValue === "true");
          }
        }
      } catch {
        // Ignore storage access errors
      }
    };

    loadSetting();

    const handleBunkCalcToggle = (event: CustomEvent) => {
      if (isMounted) {
        setShowBunkCalc(event.detail);
      }
    };

    window.addEventListener("bunkCalcToggle", handleBunkCalcToggle as EventListener);
    return () => {
      isMounted = false;
      window.removeEventListener("bunkCalcToggle", handleBunkCalcToggle as EventListener);
    };
  }, [supabaseUserId]);

  const stats = useMemo(() => {
    return calculateCourseStats(course, courseIdentifiers, trackingData, activeCourseDetails, targetPercentage, normalize);
  }, [activeCourseDetails, course, courseIdentifiers, trackingData, targetPercentage, normalize]);

  const hasAttendanceData = useMemo(() => 
    !isSummaryLoading && stats.displayTotal > 0,
    [isSummaryLoading, stats.displayTotal]
  );

  const isTrackingOnly = useMemo(() => 
    !isSummaryLoading && stats.realTotal === 0 && stats.displayTotal > 0,
    [isSummaryLoading, stats.realTotal, stats.displayTotal]
  );

  const isGain = useMemo(() => 
    stats.displayPercentage >= stats.officialPercentage,
    [stats.displayPercentage, stats.officialPercentage]
  );

  const statusColorClasses = useMemo(() => {
    const metrics = stats.extraMetrics;
    const isAtRisk = metrics.requiredToAttend > 0;
    
    if (!isAtRisk) return {
      card: "border-t-[3px] border-t-green-500/70 dark:border-t-transparent",
      headerBg: "bg-green-500/10 dark:bg-green-500/20",
      headerBorder: "border-green-500/20 dark:border-green-500/40",
      badge: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
    };

    return {
      card: "border-t-[3px] border-t-red-500/70 dark:border-t-transparent",
      headerBg: "bg-red-500/10 dark:bg-red-500/20",
      headerBorder: "border-red-500/20 dark:border-red-500/40",
      badge: "bg-red-500/15 text-red-500 border-red-500/30",
    };
  }, [stats.extraMetrics]);


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

  const isInactive = disabled || (!isSummaryLoading && stats.displayTotal === 0);

  const getDualBarRender = () => {
    if (isGain) {
      return (
        <>
          <div
            className="absolute top-0 left-0 h-full bg-green-500 rounded-r-full transition-all duration-500 ease-in-out"
            style={{ width: `${Math.min(stats.displayPercentage, 100)}%` }}
          />
          <div
            className="absolute top-0 left-0 h-full bg-sky-500 transition-all duration-500 ease-in-out overflow-hidden"
            style={{ width: `${Math.min(stats.officialPercentage, 100)}%` }}
          >
            <div className="absolute right-0 top-0 w-[1.5px] h-full bg-white/20" />
          </div>
        </>
      );
    }
    return (
      <>
        <div
          className="absolute top-0 left-0 h-full bg-red-600 rounded-r-full transition-all duration-500 ease-in-out"
          style={{ width: `${Math.min(stats.officialPercentage, 100)}%` }}
        />
        <div
          className="absolute top-0 left-0 h-full bg-sky-500 transition-all duration-500 ease-in-out overflow-hidden"
          style={{ width:`${Math.min(stats.displayPercentage, 100)}%` }}
        >
          <div className="absolute right-0 top-0 w-[1.5px] h-full bg-white/20" />
        </div>
      </>
    );
  };

  const percentageTextClass = useMemo(() => {
    if (stats.correctionPresent > 0 || stats.extras > 0) {
      return isGain ? "text-green-600 dark:text-green-400 font-bold" : "text-red-500 dark:text-red-400 font-bold";
    }
    return "";
  }, [stats.correctionPresent, stats.extras, isGain]);

  const renderCardBodyContent = () => {
    if (isSummaryLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-4">
          <div className="animate-pulse h-4 w-24 bg-secondary rounded mb-2"></div>
          <div className="animate-pulse h-2 w-16 bg-secondary rounded"></div>
        </div>
      );
    }
    if (!hasAttendanceData) {
      return (
        <div className="flex flex-col items-center justify-center py-4 px-2 h-full gap-1">
          <div className="flex items-center gap-2 mb-1 text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium text-sm">No attendance data</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            No attendance records yet
          </p>
        </div>
      );
    }
    return (
      <>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center p-1 bg-green-500/10 border border-green-500/25 dark:bg-green-500/10 dark:border-green-500/20 rounded-md py-2.5 flex gap-1 flex-col">
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
                <span className="text-xs font-medium text-blue-500" title="Extras">
                  +{stats.extraPresent}
                </span>
              )}
            </div>
          </div>

          <div className="text-center p-1 bg-red-500/10 border border-red-500/25 dark:bg-red-500/10 dark:border-red-500/20 rounded-md py-2.5 flex gap-1 flex-col">
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

          <div className="text-center p-1 bg-primary/10 border border-primary/25 dark:bg-primary/10 dark:border-primary/20 rounded-md py-2.5 flex gap-1 flex-col">
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

        <div className="mt-8">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            {getDualBarRender()}
          </div>

          <div className="flex justify-between items-center mb-1 text-sm mt-2 text-muted-foreground font-medium">
            <span>Attendance</span>
            <div className="flex items-center gap-2">
              {(stats.correctionPresent > 0 || stats.extras > 0) && stats.officialPercentage !== stats.displayPercentage && (
                <span className="text-xs">
                  {stats.officialPercentage}% <span className="mx-0.5">→</span>
                </span>
              )}
              <span className={percentageTextClass}>
                {stats.displayPercentage}%
              </span>
            </div>
          </div>
        </div>

        {showBunkCalc && (
          <div className="mt-4">
            <BunkCalculatorPanel 
              stats={stats} 
              trackingIsStrictlyBetter={
                stats.extraMetrics.canBunk > stats.safeMetrics.canBunk ||
                (stats.extraMetrics.canBunk === 0 && 
                 stats.safeMetrics.canBunk === 0 && 
                 stats.extraMetrics.requiredToAttend < stats.safeMetrics.requiredToAttend)
              } 
              noOfficialData={stats.realTotal === 0} 
            />
          </div>
        )}
      </>
    );
  };

  return (
    <Card 
      className={cn(
        "pt-0 pb-0 custom-container overflow-clip h-full min-h-70 transition-all duration-300", 
        statusColorClasses.card, 
        isInactive && "opacity-70",
        disabled && "opacity-50"
      )}
      style={isInactive ? { filter: 'grayscale(100%) brightness(0.9)' } : undefined}
    >
      <CardHeader className={cn("flex justify-between items-start flex-row gap-2 pt-6 pb-5 border-b-2", statusColorClasses.headerBg, statusColorClasses.headerBorder, disabled && "bg-red-500/10 dark:bg-muted/40 border-red-500/30 dark:border-border/60")}>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg font-semibold wrap-break-word leading-tight">
            {courseName}
          </CardTitle>
          
          <div className="flex items-center gap-1.5 mt-1.5 opacity-60">
            <span className={cn(
              "text-xs font-semibold truncate max-w-48 pr-1",
              !instructorName && "italic font-medium"
            )}>
              {instructorName || "No instructor assigned"}
            </span>
            {hasCustomInstructor && (
              <UserCog className="w-3 h-3 text-primary animate-in fade-in zoom-in duration-300" />
            )}
            {onEditInstructor && (
              <button
                onClick={onEditInstructor}
                className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-primary ml-0.5"
                title="Edit Instructor"
                aria-label="Edit Instructor"
              >
                <Edit2 className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <Badge
            variant="secondary"
            className={cn("h-7 uppercase custom-button rounded-md! scale-105 shrink-0 border", statusColorClasses.badge)}
            aria-hidden="true"
          >
            {course.id === 0 && (
              <User2 className="w-3 H-3 mr-1.5 opacity-70" aria-hidden="true" />
            )}
            {course.code}
          </Badge>
          <CourseStatusBadge
            disabled={disabled}
            isSummaryLoading={isSummaryLoading}
            displayTotal={stats.displayTotal}
            isTrackingOnly={isTrackingOnly}
            isDisabledCoursesLoading={isDisabledCoursesLoading}
            courseCode={courseCode}
            courseName={course.name}
            hasSemesterContext={hasSemesterContext}
            onEnable={() => setShowEnableDialog(true)}
            onDisable={() => {
              setDisableReason("Challenge passed");
              setCustomReason("");
              setShowDisableDialog(true);
            }}
          />
        </div>
      </CardHeader>
      
      <CardContent className="h-full pb-6">
        {renderCardBodyContent()}
      </CardContent>

      <DisableCourseDialog
        show={showDisableDialog}
        onOpenChange={(open) => {
          if (isDisabling || disableInFlightRef.current) return;
          setShowDisableDialog(open);
        }}
        courseCode={course.code}
        hasSemesterContext={hasSemesterContext}
        disableCourse={disableCourse}
        disableReason={disableReason}
        setDisableReason={setDisableReason}
        customReason={customReason}
        setCustomReason={setCustomReason}
        isDisabling={isDisabling}
        setIsDisabling={setIsDisabling}
        disableInFlightRef={disableInFlightRef}
      />

      <EnableCourseDialog
        show={showEnableDialog}
        onOpenChange={(open) => {
          if (isEnabling || enableInFlightRef.current) return;
          setShowEnableDialog(open);
        }}
        courseCode={course.code}
        hasSemesterContext={hasSemesterContext}
        enableCourse={enableCourse}
        disableReasonText={(courseCode ? getDisableReason(courseCode) : null) ?? "N/A"}
        isEnabling={isEnabling}
        setIsEnabling={setIsEnabling}
        enableInFlightRef={enableInFlightRef}
      />
    </Card>
  );
}

interface DisableDialogProps {
  show: boolean;
  onOpenChange: (open: boolean) => void;
  courseCode: string | undefined;
  hasSemesterContext: boolean;
  disableCourse: (code: string, reason: string) => Promise<void>;
  disableReason: string;
  setDisableReason: (v: string) => void;
  customReason: string;
  setCustomReason: (v: string) => void;
  isDisabling: boolean;
  setIsDisabling: (v: boolean) => void;
  disableInFlightRef: React.MutableRefObject<boolean>;
}

function DisableCourseDialog({
  show,
  onOpenChange,
  courseCode,
  hasSemesterContext,
  disableCourse,
  disableReason,
  setDisableReason,
  customReason,
  setCustomReason,
  isDisabling,
  setIsDisabling,
  disableInFlightRef,
}: DisableDialogProps) {
  const isOtherReason = disableReason === "Other";

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!courseCode || disableInFlightRef.current) return;
    if (!hasSemesterContext) {
      toast.error("Semester context not loaded yet. Please try again.");
      return;
    }
    disableInFlightRef.current = true;
    const reason = isOtherReason ? reasonTextSchema.parse(customReason) : disableReason;
    setIsDisabling(true);
    try {
      await disableCourse(courseCode, reason);
      onOpenChange(false);
      toast.success(`${courseCode} disabled`, {
        description: reason,
      });
    } catch {
      // Provider-level mutation handler already displays an error toast.
    } finally {
      disableInFlightRef.current = false;
      setIsDisabling(false);
    }
  };

  return (
    <AlertDialog open={show} onOpenChange={onOpenChange}>
      <AlertDialogContent className="custom-container">
        <AlertDialogHeader>
          <AlertDialogTitle>Disable {courseCode ?? "Course"}?</AlertDialogTitle>
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
            className="custom-button bg-red-600! hover:bg-red-700! text-white! border-none!"
            disabled={isDisabling || !hasSemesterContext || (isOtherReason && !customReason.trim())}
            aria-busy={isDisabling}
            onClick={handleConfirm}
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
  );
}

interface EnableDialogProps {
  show: boolean;
  onOpenChange: (open: boolean) => void;
  courseCode: string | undefined;
  hasSemesterContext: boolean;
  enableCourse: (code: string) => Promise<void>;
  disableReasonText: string;
  isEnabling: boolean;
  setIsEnabling: (v: boolean) => void;
  enableInFlightRef: React.MutableRefObject<boolean>;
}

function EnableCourseDialog({
  show,
  onOpenChange,
  courseCode,
  hasSemesterContext,
  enableCourse,
  disableReasonText,
  isEnabling,
  setIsEnabling,
  enableInFlightRef,
}: EnableDialogProps) {
  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!courseCode || enableInFlightRef.current) return;
    if (!hasSemesterContext) {
      toast.error("Semester context not loaded yet. Please try again.");
      return;
    }
    enableInFlightRef.current = true;
    setIsEnabling(true);
    try {
      await enableCourse(courseCode);
      onOpenChange(false);
      toast.success(`${courseCode} enabled`);
    } catch {
      // Provider-level mutation handler already displays an error toast.
    } finally {
      enableInFlightRef.current = false;
      setIsEnabling(false);
    }
  };

  return (
    <AlertDialog open={show} onOpenChange={onOpenChange}>
      <AlertDialogContent className="custom-container">
        <AlertDialogHeader>
          <AlertDialogTitle>Enable {courseCode ?? "Course"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This course was disabled with reason: <span className="font-semibold text-foreground">&ldquo;{disableReasonText}&rdquo;</span>.
            Enabling it will include it back in your total attendance calculations.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="custom-button" disabled={isEnabling}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="custom-button bg-green-600! hover:bg-green-700! border-none!"
            disabled={isEnabling || !hasSemesterContext}
            aria-busy={isEnabling}
            onClick={handleConfirm}
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
  );
}