"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m as motion,
} from "framer-motion";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import axios from "@/lib/axios";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/users/profile";
import {
  useAllCourseDetails,
  useAttendanceReport,
} from "@/hooks/courses/attendance";
import { useFetchCourses } from "@/hooks/courses/courses";
import {
  useFetchUserSettings,
  useSetAcademicYear,
  useSetSemester,
} from "@/hooks/users/settings";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { calculateAttendance } from "@/lib/logic/bunk";
import { Loading as CompLoading } from "@/components/loading";
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
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import { AddCourseDialog } from "@/components/attendance/AddCourseDialog";
import { AddAttendanceDialog } from "@/components/attendance/AddAttendanceDialog";
import { EditInstructorDialog } from "@/components/attendance/EditInstructorDialog";
import { useFetchCourseInstructors } from "@/hooks/courses/instructors";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { captureSentryException } from "@/lib/sentry-lazy";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";
import { PWAInstallBanner } from "@/components/pwa-install-banner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";

// Extracted Sub-components
import { StatsPanel } from "./components/StatsPanel";
import { DashboardCharts } from "./components/DashboardCharts";
import { CourseGrid } from "./components/CourseGrid";

const ChartSkeleton = () => (
  <div className="flex items-center justify-center h-full">
    <CompLoading minimal />
  </div>
);

const AttendanceCalendar = dynamic(
  () =>
    import("@/components/attendance/attendance-calendar").then((mod) =>
      mod.AttendanceCalendar
    ),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  },
);

interface DashboardClientProps {
  initialData?: {
    courses: any;
    attendance: any;
  } | null;
  serverError?: string | null;
}

export default function DashboardClient(
  { initialData, serverError }: DashboardClientProps,
) {
  const {
    data: profile,
    isLoading: isLoadingProfile,
    isFetching: isFetchingProfile,
    refetch: refetchProfile,
  } = useProfile({ sync: true });
  const queryClient = useQueryClient();

  const setSemesterMutation = useSetSemester();
  const setAcademicYearMutation = useSetAcademicYear();
  const { targetPercentage } = useAttendanceSettings();

  useEffect(() => {
    if (serverError) {
      const isRateLimit = serverError.includes("429") ||
        serverError.toLowerCase().includes("rate limit");

      toast.error(
        isRateLimit ? "EzyGo Rate Limit Reached" : "Dashboard Pre-fetch Failed",
        {
          description: isRateLimit
            ? "Too many requests. Please wait a few minutes before trying again."
            : "We couldn't pre-load your data. We'll try again from your browser.",
          duration: 8000,
          action: {
            label: "Retry",
            onClick: () => window.location.reload(),
          },
        },
      );
    }
  }, [serverError]);

  const { data: userSettings, isLoading: isSettingsLoading } =
    useFetchUserSettings();
  const ezygoSemester = userSettings?.semester;
  const ezygoYear = userSettings?.academicYear;

  const [selectedSemester, setSelectedSemester] = useState<
    "even" | "odd" | null
  >(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const isInitializedRef = useRef(false);
  const syncFailedRef = useRef(false);
  
  useEffect(() => {
    if (!isInitializedRef.current && !isSettingsLoading && ezygoSemester !== undefined && ezygoYear !== undefined) {
      isInitializedRef.current = true;
      
      Promise.resolve().then(() => {
        if (selectedSemester === null) {
          if (ezygoSemester) {
            setSelectedSemester(ezygoSemester);
          } else if (profile && !setSemesterMutation.isPending) {
            const info = calculateCurrentAcademicInfo();
            setSelectedSemester(info.current_semester);
          }
        }
        if (selectedYear === null) {
          if (ezygoYear) {
            setSelectedYear(ezygoYear);
          } else if (profile && !setAcademicYearMutation.isPending) {
            const info = calculateCurrentAcademicInfo();
            setSelectedYear(info.current_year);
          }
        }
      });
    }
  }, [isSettingsLoading, ezygoSemester, ezygoYear, profile, selectedSemester, selectedYear, setSemesterMutation.isPending, setAcademicYearMutation.isPending]);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isAddAttendanceOpen, setIsAddAttendanceOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<
    | { type: "semester"; value: "even" | "odd" }
    | { type: "academicYear"; value: string }
    | null
  >(null);

  const [isEditInstructorOpen, setIsEditInstructorOpen] = useState(false);
  const [selectedInstructorCourse, setSelectedInstructorCourse] = useState<
    {
      code: string;
      name: string;
      initialName: string;
    } | null
  >(null);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Transform initial courses data into expected format
  const initialCoursesData = initialData?.courses
    ? {
      courses: Array.isArray(initialData.courses)
        ? initialData.courses.reduce(
          (acc: Record<string, any>, course: any) => {
            acc[course.id.toString()] = course;
            return acc;
          },
          {},
        )
        : initialData.courses,
    }
    : undefined;

  const currentSem = selectedSemester ?? undefined;
  const currentYear = selectedYear ?? undefined;

  const { syncCompleted } = useSyncOnMount({
    username: profile?.username,
    userId: profile?.id,
    enabled: !!profile?.username,
    sentryLocation: "DashboardClient",
    sentryTag: "background_sync",
  });

  const {
    data: attendanceData,
    isLoading: isLoadingAttendance,
    isFetching: isFetchingAttendance,
    isError: isAttendanceError,
    refetch: refetchAttendance,
  } = useAttendanceReport(
    currentSem,
    currentYear,
    {
      enabled: syncCompleted,
      // Only use initialData if active semester/year matches initialData defaults
      initialData: (selectedSemester === null && selectedYear === null)
        ? (initialData?.attendance ?? undefined)
        : undefined,
    },
  );


  const {
    data: coursesData,
    isLoading: isLoadingCourses,
    isFetching: isFetchingCourses,
    isError: isCoursesError,
    refetch: refetchCourses,
  } = useFetchCourses({
    semester: currentSem,
    year: currentYear,
    // Only hydrate from SSR initialData on the very first load before any selection.
    initialData: (selectedSemester === null && selectedYear === null)
      ? initialCoursesData
      : undefined,
    enabled: syncCompleted && !!currentSem && !!currentYear,
  });

  const {
    data: trackingData,
    isLoading: isLoadingTracking,
    isFetching: isFetchingTracking,
    isError: isTrackingError,
    refetch: refetchTracking,
  } = useTrackingData(profile, {
    semester: currentSem,
    year: currentYear,
    enabled: syncCompleted,
  });

  const { data: customInstructors } = useFetchCourseInstructors({
    semester: currentSem,
    year: currentYear,
    enabled: syncCompleted,
  });

  const { data: classCourses } = useFetchClassCourses({
    semester: currentSem,
    year: currentYear,
    enabled: syncCompleted && !!profile?.class?.id,
  });

  const { getCourseCodeById: getCourseCode } = useCourseLookup({
    coursesData,
    classCourses,
    attendanceData,
  });

  const courseList = useMemo(() => {
    const registry: Record<string, { code: string; id: number; name: string }> = {};
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([code, c]: [string, any]) => {
        const key = (c.code ?? code).toUpperCase().replace(/[\s\u00A0-]/g, "");
        registry[key] = { code: c.code ?? code, id: Number(c.id), name: c.name };
      });
    }
    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const key = cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (!registry[key]) {
          registry[key] = { code: cc.course_code, id: 0, name: cc.course_name || cc.course_code };
        }
      });
    }
    return Object.values(registry);
  }, [coursesData, classCourses]);

  const {
    data: allCourseSummaries,
    isError: isAllCourseSummariesError,
    isLoading: isLoadingAllCourseSummaries,
    isFetching: isFetchingAllCourseSummaries,
  } = useAllCourseDetails(syncCompleted ? courseList : []);

  useEffect(() => {
    if (!isTransitioning) return;

    const isStillFetching = isFetchingAttendance || isFetchingCourses ||
      isFetchingTracking || isFetchingProfile || isFetchingAllCourseSummaries;
    const isStillLoading = isLoadingAttendance || isLoadingCourses ||
      isLoadingTracking || isLoadingProfile || isLoadingAllCourseSummaries;

    const timer = setTimeout(() => {
      if (!isStillFetching && !isStillLoading) {
        setIsTransitioning(false);
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isTransitioning, isFetchingAttendance, isFetchingCourses, isFetchingTracking, isFetchingProfile, isFetchingAllCourseSummaries, isLoadingAttendance, isLoadingCourses, isLoadingTracking, isLoadingProfile, isLoadingAllCourseSummaries]);

  const { disabledCodes } = useDisabledCourses({
    academicYear: currentYear,
    semester: currentSem,
  });

  const handleSemesterChange = (value: "even" | "odd") => {
    if (value === selectedSemester) return;
    setPendingChange({ type: "semester", value });
    setShowConfirmDialog(true);
  };

  const handleAcademicYearChange = (value: string) => {
    if (value === selectedYear) return;
    setPendingChange({ type: "academicYear", value });
    setShowConfirmDialog(true);
  };

  const handleConfirmChange = async () => {
    if (!pendingChange || !profile?.username || isUpdating) return;
    setIsUpdating(true);
    setIsTransitioning(true);
    setShowConfirmDialog(false);

    await Promise.all([
      queryClient.cancelQueries({ queryKey: ["attendance-report"] }),
      queryClient.cancelQueries({ queryKey: ["courses"] }),
      queryClient.cancelQueries({ queryKey: ["track_data"] }),
      queryClient.cancelQueries({ queryKey: ["attendance-report-all"] }),
      queryClient.cancelQueries({ queryKey: ["class_courses"] }),
      queryClient.cancelQueries({ queryKey: ["course_instructors"] }),
      queryClient.cancelQueries({ queryKey: ["exams"] }),
      queryClient.cancelQueries({ queryKey: ["exam-questions"] }),
      queryClient.cancelQueries({ queryKey: ["exam-answers"] }),
    ]);

    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    queryClient.invalidateQueries({ queryKey: ["courses"] });
    queryClient.invalidateQueries({ queryKey: ["track_data"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    queryClient.invalidateQueries({ queryKey: ["class_courses"] });
    queryClient.invalidateQueries({ queryKey: ["course_instructors"] });
    queryClient.invalidateQueries({ queryKey: ["exams"] });
    queryClient.invalidateQueries({ queryKey: ["exam-questions"] });
    queryClient.invalidateQueries({ queryKey: ["exam-answers"] });

    try {
      if (pendingChange.type === "semester") {
        await setSemesterMutation.mutateAsync({ default_semester: pendingChange.value });
        setSelectedSemester(pendingChange.value);
      } else {
        await setAcademicYearMutation.mutateAsync({ default_academic_year: pendingChange.value });
        setSelectedYear(pendingChange.value);
      }
      await axios.get("/api/profile?sync=true", { baseURL: "" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      logger.error("Settings Update Failed:", error);
      captureSentryException(error, { tags: { type: "update_settings_failed" } });
      toast.error("Failed to update settings");
    } finally {
      setIsUpdating(false);
      setPendingChange(null);
    }
  };

  const handleCancelChange = () => {
    setShowConfirmDialog(false);
    setPendingChange(null);
  };

  const academicYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2022;
    const years: string[] = [];
    for (let year = startYear; year <= currentYear; year++) {
      years.push(`${year}-${(year + 1).toString().slice(-2)}`);
    }
    return years;
  }, []);

  useEffect(() => {
    if (isInitializedRef.current && !syncFailedRef.current) {
      if (selectedSemester && ezygoSemester === null && profile && !setSemesterMutation.isPending) {
        setSemesterMutation.mutate({ default_semester: selectedSemester }, {
          onError: () => { syncFailedRef.current = true; }
        });
      }
      if (selectedYear && ezygoYear === null && profile && !setAcademicYearMutation.isPending) {
        setAcademicYearMutation.mutate({ default_academic_year: selectedYear }, {
          onError: () => { syncFailedRef.current = true; }
        });
      }
    }
  }, [selectedSemester, selectedYear, ezygoSemester, ezygoYear, profile, setSemesterMutation, setAcademicYearMutation]);


  useEffect(() => {
    if (syncCompleted && !profile?.first_name) {
      void refetchProfile();
    }
  }, [syncCompleted, profile?.first_name, refetchProfile]);

  // CALCULATE ACTIVE COURSES (Courses with at least 1 record)
  const activeCourseCount = useMemo(() => {
    const activeIds = new Set<string>();

    // 1. Scan Official Data
    if (attendanceData?.studentAttendanceData) {
      Object.values(attendanceData.studentAttendanceData).forEach(
        (sessions: any) => {
          Object.values(sessions).forEach((session: any) => {
            const attCode = Number(session.attendance);
            const isValidAttendance = [110, 111, 225, 112].includes(attCode);
            const isRevision = session.class_type === "Revision";

            if (isValidAttendance && !isRevision && session.course) {
              activeIds.add(String(session.course));
            }
          });
        },
      );
    }

    // 2. Scan Tracking Data
    if (trackingData) {
      trackingData.forEach((t: any) => {
        const isSameSemester = !selectedSemester ||
          t.semester === selectedSemester;
        const isSameYear = !selectedYear || t.year === selectedYear;
        const hasAttendance = t.attendance != null;

        if (t.course && isSameSemester && isSameYear && hasAttendance) {
          activeIds.add(String(t.course));
        }
      });
    }

    // 3. Normalize and categorize
    const catalogCodes = new Set(
      [
        ...(coursesData?.courses
          ? Object.values(coursesData.courses).map(
              (c: any) =>
                (c.code ? c.code.toUpperCase().replace(/[\s\u00A0-]/g, "") : String(c.id).toUpperCase()),
            )
          : []),
        ...(classCourses
          ? classCourses.map((cc: any) => cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, ""))
          : []),
      ]
    );

    const activeCodes = new Set<string>();
    const disabledWithDataCodes = new Set<string>();

    activeIds.forEach((id) => {
      const code = (getCourseCode(id) || id).toUpperCase().replace(/[\s\u00A0-]/g, "");
      if (code !== "" && catalogCodes.has(code)) {
        if (disabledCodes.has(code)) {
          disabledWithDataCodes.add(code);
        } else {
          activeCodes.add(code);
        }
      }
    });

    // 4. Count no-data courses (enabled only)
    const noDataCodes = new Set<string>();
    catalogCodes.forEach((code) => {
      if (!activeCodes.has(code) && !disabledWithDataCodes.has(code) && !disabledCodes.has(code)) {
        noDataCodes.add(code);
      }
    });

    return {
      active: activeCodes.size,
      noData: noDataCodes.size,
      disabled: disabledCodes.size,
      total: catalogCodes.size,
    };
  }, [
    attendanceData,
    trackingData,
    coursesData,
    classCourses,
    selectedSemester,
    selectedYear,
    disabledCodes,
    getCourseCode,
  ]);

  // SPECIAL: Data-Rich Correction Effect
  // If we just loaded a semester from settings and it's DEAD EMPTY, but another semester
  // might have data, we log it for now. This helps debug "poisoned" stored settings.
  useEffect(() => {
    if (!attendanceData || activeCourseCount.active > 0 || !selectedSemester) {
      return;
    }

    const rescueKey = `ghost_rescue_${profile?.auth_id}`;
    const rescueAttempted = sessionStorage.getItem(rescueKey);
    if (rescueAttempted) return;

    if (activeCourseCount.active === 0 && activeCourseCount.total > 0) {
      const otherSem = selectedSemester === "even" ? "odd" : "even";
      logger.dev(
        `Detected empty semester [${selectedSemester}]. Suggesting alternative [${otherSem}]...`,
      );
    }
  }, [
    attendanceData,
    activeCourseCount.active,
    activeCourseCount.total,
    selectedSemester,
    profile?.auth_id,
  ]);

  const filteredChartData = useMemo(() => {
    if (!attendanceData) return undefined;
    // structuredClone is native and faster than JSON.parse(JSON.stringify()).
    const newData = structuredClone(attendanceData);

    if (newData.studentAttendanceData) {
      Object.keys(newData.studentAttendanceData).forEach((date) => {
        const sessions = { ...newData.studentAttendanceData[date] };
        let modified = false;
        Object.keys(sessions).forEach((sessionKey) => {
          if (sessions[sessionKey].class_type === "Revision") {
            delete sessions[sessionKey];
            modified = true;
          }
        });
        if (modified) newData.studentAttendanceData[date] = sessions;
      });
    }
    return newData;
  }, [attendanceData]);


  // --- STATS CALCULATION ---
  const stats = useDashboardStats({
    coursesData,
    attendanceData,
    trackingData,
    classCourses,
    disabledCodes,
    selectedSemester,
    selectedYear,
  });


  const courseRegistry = useMemo(() => {
    const registry: Record<string, any> = {};
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([id, course]: [string, any]) => {
        registry[id] = { ...course, key: id };
        const codeKey = (course.code || "").toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (codeKey && !registry[codeKey]) {
          registry[codeKey] = { ...course, key: id };
        }
      });
    }
    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const codeKey = cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (!registry[codeKey]) {
          registry[codeKey] = {
            id: 0,
            code: cc.course_code,
            name: cc.course_name || cc.course_code,
            institution_users: [],
            key: codeKey,
          };
        }
      });
    }
    return registry;
  }, [coursesData, classCourses]);


  const sortedCourses = useMemo(() => {
    // For the UI list, we only want unique courses by code.
    const seenCodes = new Set<string>();
    const uniqueCourses: any[] = [];

    Object.values(courseRegistry).forEach((course: any) => {
      const codeKey = (course.code || course.key).toUpperCase().replace(/[\s\u00A0-]/g, "");
      if (!seenCodes.has(codeKey)) {
        seenCodes.add(codeKey);
        uniqueCourses.push({ ...course, codeKey });
      }
    });

    return uniqueCourses.map((course: any) => {
      const { codeKey } = course;
      // Stats are keyed by the normalised code for both official and class courses.
      const statsObj = stats.courseStats[codeKey] ||
        stats.courseStats[course.key] ||
        { present: 0, total: 0, officialPresent: 0, officialTotal: 0, correctionPresent: 0, extraPresent: 0, extrasCount: 0, extraAbsent: 0 };
      const activeCourseDetails = allCourseSummaries?.[course.code || ""];
      const {
        present,
        total,
        officialPresent,
        officialTotal,
        correctionPresent,
        extraPresent,
        extrasCount,
        extraAbsent
      } = statsObj;
      const isNew = total === 0;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      let canBunk = 0, requiredToAttend = 0, safeBunkable = 0;
      if (!isNew) {
        const result = calculateAttendance(present, total, targetPercentage);
        canBunk = result.canBunk;
        requiredToAttend = result.requiredToAttend;
        const safeResult = calculateAttendance(officialPresent, officialTotal, targetPercentage);
        safeBunkable = safeResult.canBunk;
      }
      const isDisabled = !!course.code &&
        disabledCodes.has(course.code.toUpperCase().replace(/[\s\u00A0-]/g, ""));
      return {
        ...course,
        key: codeKey,
        currentPercentage: pct,
        bunkable: canBunk,
        safeBunkable,
        required: requiredToAttend,
        isNew,
        isDisabled,
        present,
        total,
        officialPresent,
        officialTotal,
        correctionPresent,
        extraPresent,
        extrasCount,
        extraAbsent,
        activeCourseDetails,
      };
    }).sort((a: any, b: any) => {
      const tierA = a.isDisabled ? 2 : a.isNew ? 1 : 0;
      const tierB = b.isDisabled ? 2 : b.isNew ? 1 : 0;
      if (tierA !== tierB) return tierA - tierB;

      // For tiers 1 (New) and 2 (Disabled), mobile only uses alphabetical sorting.
      // We only apply bunkable/required sorting for tier 0 (Active).
      if (tierA === 0) {
        if (b.bunkable !== a.bunkable) return b.bunkable - a.bunkable;
        if (b.safeBunkable !== a.safeBunkable) return b.safeBunkable - a.safeBunkable;
        if (a.required !== b.required) return a.required - b.required;
      }

      return a.name.localeCompare(b.name);
    });
  }, [
    courseRegistry,
    stats,
    targetPercentage,
    disabledCodes,
    allCourseSummaries,
  ]);


  const isInitialLoading = (!profile && !isLoadingProfile) || !currentSem || !currentYear || !syncCompleted || isLoadingAttendance || isLoadingCourses || isLoadingTracking || isLoadingAllCourseSummaries || isUpdating;

  if (isInitialLoading && !isAttendanceError && !isCoursesError && !isTrackingError && !isAllCourseSummariesError) return <CompLoading />;

  const isGlobalLoading = isLoadingProfile || isUpdating || isTransitioning || isSettingsLoading || setSemesterMutation.isPending || setAcademicYearMutation.isPending || !syncCompleted;

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-background font-manrope relative min-h-screen">
        <AnimatePresence>
          {isGlobalLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-primary/10 animate-pulse" /></div>
              </div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8 text-center px-6">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-purple-400">Syncing your academic profile...</h2>
                <p className="mt-2 text-muted-foreground text-sm max-w-xs mx-auto">Updating your dashboard with the latest data for {selectedSemester?.toUpperCase()} {selectedYear}.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 container mx-auto px-4 md:px-6 pt-4 md:pt-6">
          <div className="mb-6 flex flex-col lg:flex-row gap-6 lg:items-end justify-between">
            <div className="flex flex-col gap-4 flex-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <h1 className="text-2xl font-bold w-full">
                    Welcome back,{" "}
                    <span className="gradient-name w-full pr-2">
                      {profile?.first_name} {profile?.last_name}!
                    </span>
                  </h1>
                </div>
                <div className="flex flex-col gap-1.5 mt-1 ml-0.5 mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 w-fit">
                    {profile?.class?.name || "Unassigned"}
                  </span>
                  <p className="text-muted-foreground font-normal italic text-sm">
                    {"Track your classes, manage attendance, and stay ahead!"}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-center font-normal">
                <p className="flex flex-wrap items-center gap-2.5 max-sm:text-md text-muted-foreground">
                  <span>You&apos;re checking out the</span>
                  <Select value={selectedSemester || ""} onValueChange={(v) => handleSemesterChange(v as "even" | "odd")} disabled={isUpdating || isTransitioning}>
                    <SelectTrigger className="w-fit h-8 px-2 text-[14px] font-medium rounded-xl pl-3 uppercase custom-dropdown dark:bg-foreground/10 dark:border-foreground/20">{selectedSemester || "semester"}</SelectTrigger>
                    <SelectContent className="custom-dropdown"><SelectItem value="odd">ODD</SelectItem><SelectItem value="even">EVEN</SelectItem></SelectContent>
                  </Select>
                  <span>semester reports for academic year</span>
                  <Select value={selectedYear || ""} onValueChange={handleAcademicYearChange} disabled={isUpdating || isTransitioning}>
                    <SelectTrigger className="w-fit h-8 px-2 text-[14px] font-medium rounded-xl pl-3 custom-dropdown dark:bg-foreground/10 dark:border-foreground/20">{selectedYear || "year"}</SelectTrigger>
                    <SelectContent className="custom-dropdown max-h-70">{academicYears.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                  </Select>
                </p>
              </div>
            </div>

            <StatsPanel stats={stats} isLoadingAttendance={isLoadingAttendance} targetPercentage={targetPercentage || 75} />
          </div>

          <DashboardCharts
            stats={stats}
            isLoadingAttendance={isLoadingAttendance}
            attendanceData={attendanceData}
            filteredChartData={filteredChartData}
            trackingData={trackingData}
            courseRegistry={courseRegistry}
            disabledCodes={disabledCodes}
            activeCourseCount={activeCourseCount}
            isLoadingCourses={isLoadingCourses}
          />
          <CourseGrid
            isLoadingCourses={isLoadingCourses}
            isLoadingAllCourseSummaries={isLoadingAllCourseSummaries}
            sortedCourses={sortedCourses}
            customInstructors={customInstructors || []}
            allCourseSummaries={allCourseSummaries}
            profile={profile}
            onEditInstructor={(course, _name, hasCustomName, customInstructor) => {
              const code = (course.code || String(course.id)).toUpperCase().replace(/[\s\u00A0-]/g, "");
              setSelectedInstructorCourse({
                code,
                name: course.name,
                initialName: hasCustomName ? (customInstructor?.instructor_name ?? "") : ""
              });
              setIsEditInstructorOpen(true);
            }}
            onAddCourse={() => setIsAddCourseOpen(true)}
          />

          <div className="mb-6">
              <Card className="custom-container">
                <CardHeader className="flex flex-col gap-0.5">
                  <CardTitle className="text-[16px]">
                    Attendance Calendar
                  </CardTitle>
                  <CardDescription className="text-accent-foreground/60 text-sm">
                    Your attendance history at a glance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingAttendance
                    ? <Skeleton className="h-105 w-full rounded-xl" />
                    : attendanceData
                    ? (
                      <AttendanceCalendar
                        attendanceData={attendanceData}
                        semester={selectedSemester || undefined}
                        year={selectedYear || undefined}
                        coursesData={{ courses: courseRegistry }}
                        classCourses={classCourses}
                      />
                    )
                    : (
                      <div className="flex items-center justify-center h-50">
                        <p className="text-muted-foreground">
                          No attendance data available
                        </p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>

          <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogContent className="custom-container">
              <AlertDialogHeader><AlertDialogTitle>Confirm Change</AlertDialogTitle><AlertDialogDescription>You are about to change the {pendingChange?.type === "semester" ? "semester" : "academic year"}. Are you sure you want to continue?</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel onClick={handleCancelChange} className="custom-button">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleConfirmChange} className="custom-button bg-primary! border-accent-foreground!">Confirm</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AddCourseDialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen} semester={currentSem} academicYear={currentYear} />
          <AddAttendanceDialog
            open={isAddAttendanceOpen}
            onOpenChange={setIsAddAttendanceOpen}
            attendanceData={attendanceData}
            trackingData={trackingData || []}
            coursesData={coursesData || undefined}
            user={profile ? { id: String(profile.id) } : { id: "" }}
            onSuccess={async () => {
              await Promise.all([refetchAttendance(), refetchTracking()]);
            }}
            selectedSemester={currentSem}
            selectedYear={currentYear}
          />
          <EditInstructorDialog open={isEditInstructorOpen} onOpenChange={setIsEditInstructorOpen} courseCode={selectedInstructorCourse?.code ?? ""} courseName={selectedInstructorCourse?.name ?? ""} initialName={selectedInstructorCourse?.initialName ?? ""} semester={currentSem || ""} academicYear={currentYear || ""} />
        </main>
      </div>
      <PWAInstallBanner />
    </LazyMotion>
  );
}
