"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
import { CourseCard } from "@/components/attendance/course-card";
import { useProfile } from "@/hooks/users/profile";
import { ErrorBoundary } from "@/components/error-boundary";
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
import { generateSlotKey } from "@/lib/utils";
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
import { calculateAttendance } from "@/lib/logic/bunk";
import { calculateCurrentAcademicInfo } from "@/lib/logic/academic";
import {
  ATTENDANCE_STATUS,
  isPositive,
} from "@/lib/logic/attendance-reconciliation";
import { AddAttendanceDialog } from "@/components/attendance/AddAttendanceDialog";
import { AddCourseDialog } from "@/components/attendance/AddCourseDialog";
import { EditInstructorDialog } from "@/components/attendance/EditInstructorDialog";
import { Plus } from "lucide-react";
import { useFetchCourseInstructors } from "@/hooks/courses/instructors";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { captureSentryException } from "@/lib/sentry-lazy";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";
import { PWAInstallBanner } from "@/components/pwa-install-banner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";

const ChartSkeleton = () => (
  <div className="flex items-center justify-center h-full">
    <CompLoading minimal />
  </div>
);

const AttendanceChart = dynamic(
  () =>
    import("@/components/attendance/attendance-chart").then((mod) =>
      mod.AttendanceChart
    ),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  },
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

// --- Helper Functions ---

/** Returns the canonical session identifier from an EzyGo session object. */
const getOfficialSessionRaw = (
  session: { session?: string | number | null },
  sessionKey: string | number,
): string | number => {
  if (session && session.session != null && session.session !== "") {
    return session.session;
  }
  return sessionKey;
};

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
  } = useProfile();
  const queryClient = useQueryClient();

  const setSemesterMutation = useSetSemester();
  const setAcademicYearMutation = useSetAcademicYear();
  const { targetPercentage } = useAttendanceSettings();

  // 0. Upstream Outage / Fetch Failure Handling
  // If the server-side pre-fetch failed, show a toast. We don't crash the page
  // because client-side hooks might still succeed (e.g. if the proxy cache is warm
  // or it was a transient server-side network blip).
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

      logger.warn("[Dashboard] Server-side pre-fetch failed", {
        error: serverError,
      });
    }
  }, [serverError]);

  // Fetch semester/year directly from EzyGo — the authoritative user preference.
  // The profile API fast-path returns a clock-based guess that may be wrong (e.g. April
  // reads as "even" by month but user's university is still in "odd" semester).
  // useFetchUserSettings hits EzyGo's setting endpoint which reflects what was last saved.
  const { data: userSettings, isLoading: isSettingsLoading } =
    useFetchUserSettings();
  const ezygoSemester = userSettings?.semester;
  const ezygoYear = userSettings?.academicYear;
  const isLoadingSemester = isSettingsLoading;
  const isLoadingYear = isSettingsLoading;

  const [selectedSemester, setSelectedSemester] = useState<
    "even" | "odd" | null
  >(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // --- INITIALIZATION LOGIC (DURING RENDER) ---
  // We use this pattern to avoid synchronous setState inside useEffect (react-hooks/set-state-in-effect).
  // This effectively "hydrates" the state from EzyGo settings as soon as they are available.
  const [isInitialized, setIsInitialized] = useState(false);
  if (!isInitialized && !isSettingsLoading && ezygoSemester !== undefined && ezygoYear !== undefined) {
    setIsInitialized(true);
    if (selectedSemester === null) {
      if (ezygoSemester) {
        setSelectedSemester(ezygoSemester);
      } else if (profile && !setSemesterMutation.isPending) {
        const info = calculateCurrentAcademicInfo();
        setSelectedSemester(info.current_semester);
        // Mutations are side effects and should stay in useEffect or event handlers.
        // We'll trigger them below in a sanitized effect.
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
  }

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);

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

  // currentSem/currentYear are only set from selectedSemester/selectedYear, which are
  // populated exclusively from the EzyGo stored setting (or a calculated default saved there).
  // profile.current_semester is intentionally not used as a fallback here — it is a
  // clock-based fast-path guess and could send queries to the wrong semester.
  const currentSem = selectedSemester ?? undefined;
  const currentYear = selectedYear ?? undefined;

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
    // Pass the live selection so query key changes on sem/year switch.
    // This also drives the class_courses DB filter for custom courses.
    semester: currentSem,
    year: currentYear,
    // Only hydrate from SSR initialData on the very first load before any selection.
    initialData: (selectedSemester === null && selectedYear === null)
      ? initialCoursesData
      : undefined,
    // Don't fetch until we know which term to use.
    enabled: !!currentSem && !!currentYear,
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
  });

  const {
    data: customInstructors,
  } = useFetchCourseInstructors({
    semester: currentSem,
    year: currentYear,
  });

  const {
    data: classCourses,
  } = useFetchClassCourses({
    semester: currentSem,
    year: currentYear,
    enabled: !!currentSem && !!currentYear && !!profile?.class?.id,
  });

  const { getCourseCodeById: getCourseCode } = useCourseLookup({
    coursesData,
    classCourses,
    attendanceData,
  });

  // Batch-prefetch all course summeries so each CourseCard finds its data already
  // in the TanStack Query cache — eliminates the N+1 /summery call pattern.
  const courseList = useMemo(() => {
    const registry: Record<string, { code: string; id: number; name: string }> = {};
    // 1. Official EzyGo courses
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([code, c]: [string, any]) => {
        const key = (c.code ?? code).replace(/\s+/g, "").toUpperCase();
        registry[key] = { code: c.code ?? code, id: Number(c.id), name: c.name };
      });
    }
    // 2. Class-specific custom courses (add only if not already present)
    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const key = cc.course_code.replace(/\s+/g, "").toUpperCase();
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
  } = useAllCourseDetails(courseList);

  // Monitor the transition: once all primary data sources stop fetching, we can lift the overlay.
  // We add a small delay to ensure that the hooks have a chance to enter the 'isFetching' state
  // after the selection has changed.
  useEffect(() => {
    if (isTransitioning) {
      const isStillFetching = isFetchingAttendance || isFetchingCourses ||
        isFetchingTracking || isFetchingProfile || isFetchingAllCourseSummaries;

      const isStillLoading = isLoadingAttendance || isLoadingCourses ||
        isLoadingTracking || isLoadingProfile || isLoadingAllCourseSummaries;

      // Only evaluate 'allDone' if nothing is loading or fetching.
      // We use a slightly longer timeout (1000ms) to ensure React Query has transitioned
      // all hooks to their 'isFetching' state for the new query keys.
      const timer = setTimeout(() => {
        if (!isStillFetching && !isStillLoading) {
          setIsTransitioning(false);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [
    isTransitioning,
    isFetchingAttendance,
    isFetchingCourses,
    isFetchingTracking,
    isFetchingProfile,
    isFetchingAllCourseSummaries,
    isLoadingAttendance,
    isLoadingCourses,
    isLoadingTracking,
    isLoadingProfile,
    isLoadingAllCourseSummaries,
  ]);

  // Disabled courses — exclude from stats, chart, and active count.
  // We use currentSem/currentYear (which are authoritative EzyGo selections) instead of
  // falling back to the profile to ensure UI consistency immediately after selection changes.
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

    // Proactively clear/invalidate queries to show loaders inside the cards too
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
        await setSemesterMutation.mutateAsync({
          default_semester: pendingChange.value,
        });
        setSelectedSemester(pendingChange.value);
      } else {
        await setAcademicYearMutation.mutateAsync({
          default_academic_year: pendingChange.value,
        });
        setSelectedYear(pendingChange.value);
      }

      // 2. Wait for EzyGo to finish syncing the profile (including class name)
      // for the new semester/year. This blocks the transition until sync is done.
      await axios.get("/api/profile?sync=true", { baseURL: "" });

      // 3. Invalidate profile so hooks get the fresh data from the DB
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      logger.error("Settings Update Failed:", error);

      captureSentryException(error, {
        tags: {
          type: "update_settings_failed",
          location: "DashboardClient/handleConfirmChange",
        },
        extra: {
          change_type: pendingChange?.type,
          target_value: pendingChange?.value,
        },
      });

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

  // 3. Term Synchronization Effect
  // Handles the side-effect of persistence when a default is calculated at runtime.
  useEffect(() => {
    if (isInitialized) {
      if (selectedSemester && ezygoSemester === null && profile && !setSemesterMutation.isPending) {
        setSemesterMutation.mutate({ default_semester: selectedSemester });
      }
      if (selectedYear && ezygoYear === null && profile && !setAcademicYearMutation.isPending) {
        setAcademicYearMutation.mutate({ default_academic_year: selectedYear });
      }
    }
  }, [
    isInitialized,
    selectedSemester,
    selectedYear,
    ezygoSemester,
    ezygoYear,
    profile,
    setSemesterMutation,
    setAcademicYearMutation,
  ]);


  // --- SYNC ON MOUNT ---
  const { syncCompleted, isSyncing: _isSyncing } = useSyncOnMount({
    username: profile?.username,
    userId: profile?.id,
    enabled: true, // Run immediately in the background without blocking
    sentryLocation: "DashboardClient",
    sentryTag: "background_sync",
    onPartialSync: async () => {
      toast.warning("Partial Sync Completed", {
        description:
          "Some attendance data couldn't be synced. Your dashboard may be incomplete.",
      });
      await Promise.all([
        refetchTracking(),
        refetchAttendance(),
        refetchCourses(),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onSuccess: async (data) => {
      const changed = (data.deletions ?? 0) + (data.updates ?? 0);
      if (changed > 0) {
        toast.info("Attendance Synced", {
          description: `Dashboard updated. ${changed} record${
            changed === 1 ? "" : "s"
          } synced.`,
        });
      }
      await Promise.all([
        refetchTracking(),
        refetchAttendance(),
        refetchCourses(),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  // On first signup the profile row exists in DB but names/phone/gender may be null
  // when the initial fetch fires (EzyGo background sync hasn't completed yet). Once
  // the cron sync finishes (syncCompleted flips to true) the DB is fully populated,
  // so force a profile refetch if names are still missing.
  // refetchProfile is a stable reference from React Query (safe in the dependency array).
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
                (c.code ? c.code.replace(/\s+/g, "").toUpperCase() : String(c.id).toUpperCase()),
            )
          : []),
        ...(classCourses
          ? classCourses.map((cc: any) => cc.course_code.replace(/\s+/g, "").toUpperCase())
          : []),
      ]
    );

    const activeCodes = new Set<string>();
    const disabledWithDataCodes = new Set<string>();

    activeIds.forEach((id) => {
      const code = (getCourseCode(id) || id).toUpperCase().replace(/\s+/g, "");
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
  const stats = useMemo(() => {
    const officialStats = { present: 0, absent: 0, dl: 0, total: 0, other: 0 };
    const modifierStats = {
      correctionPresent: 0,
      savedAbsent: 0,
      correctionDL: 0,
      extraPresent: 0,
      extraAbsent: 0,
      extraDL: 0,
    };

    const courseStats: Record<
      string,
      {
        present: number;
        total: number;
        officialPresent: number;
        officialTotal: number;
        bunkable: number;
        required: number;
      }
    > = {};
    if (coursesData?.courses) {
      Object.keys(coursesData.courses).forEach((id) => {
        const key = getCourseCode(id).toUpperCase().replace(/\s+/g, "") || id;
        courseStats[key] = {
          present: 0,
          total: 0,
          officialPresent: 0,
          officialTotal: 0,
          bunkable: 0,
          required: 0,
        };
      });
    }
    // Also seed entries for class-specific custom courses
    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const key = cc.course_code.replace(/\s+/g, "").toUpperCase();
        if (!courseStats[key]) {
          courseStats[key] = {
            present: 0,
            total: 0,
            officialPresent: 0,
            officialTotal: 0,
            bunkable: 0,
            required: 0,
          };
        }
      });
    }

    /** Resolve a raw course ID (may be numeric EzyGo ID) to its course code */
    const resolveCode = (cid: string): string => {
      if (disabledCodes.has(cid.toUpperCase())) return cid.toUpperCase();
      // Try ID→code lookup (numeric IDs from EzyGo attendance data)
      const mapped = getCourseCode(cid);
      return mapped || cid.toUpperCase();
    };

    /** Check if a course code is disabled — resolves numeric IDs first */
    const isCourseDisabled = (cid: string): boolean => {
      return disabledCodes.has(resolveCode(cid));
    };

    const officialMap = new Map<string, number>();
    if (attendanceData?.studentAttendanceData) {
      Object.entries(attendanceData.studentAttendanceData).forEach(
        ([dateStr, dateData]) => {
          Object.entries(dateData).forEach(([sessionKey, session]) => {
            if (session.course && session.class_type !== "Revision") {
              const cid = String(session.course);
              const status = Number(session.attendance);
              const rawSession = getOfficialSessionRaw(session, sessionKey);

              const courseDisabled = isCourseDisabled(cid);
              const statsKey = resolveCode(cid);

              const key = generateSlotKey(statsKey, dateStr, rawSession);
              officialMap.set(key, status);

              // Always update per-course stats (course cards still show)
              if (courseStats[statsKey]) {
                const isValidCode = [110, 111, 225, 112].includes(status);
                if (isValidCode) {
                  courseStats[statsKey].total++;
                  courseStats[statsKey].officialTotal++;
                  if (
                    status === ATTENDANCE_STATUS.PRESENT ||
                    status === ATTENDANCE_STATUS.DUTY_LEAVE ||
                    status === ATTENDANCE_STATUS.OTHER_LEAVE ||
                    status === 225
                  ) {
                    courseStats[statsKey].present++;
                    courseStats[statsKey].officialPresent++;
                  }
                }
              }

              // Only aggregate into dashboard totals if the course is in the current term's catalog AND not disabled
              if (courseStats[statsKey] && !courseDisabled) {
                if (
                  status === ATTENDANCE_STATUS.PRESENT ||
                  status === ATTENDANCE_STATUS.DUTY_LEAVE ||
                  status === ATTENDANCE_STATUS.OTHER_LEAVE
                ) {
                  officialStats.present++;
                  officialStats.total++;
                } else if (status === ATTENDANCE_STATUS.ABSENT) {
                  officialStats.absent++;
                  officialStats.total++;
                }

                if (status === ATTENDANCE_STATUS.DUTY_LEAVE) officialStats.dl++;
              }
            }
          });
        },
      );
    }

    if (trackingData) {
      trackingData.forEach((item) => {
        if (item.semester !== selectedSemester || item.year !== selectedYear) {
          return;
        }

        if (!item.course) return;
        const cid = String(item.course);
        const statsKey = resolveCode(cid);
        const key = generateSlotKey(statsKey, item.date, item.session);

        let trackerStatus = ATTENDANCE_STATUS.PRESENT;
        if (typeof item.attendance === "number") {
          trackerStatus = item.attendance;
        }

        const officialStatus = officialMap.get(key);
        const isTrulyExtra = item.status === "extra" &&
          officialStatus === undefined;

        const trackerPositive = isPositive(trackerStatus);
        const trackerDL = trackerStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

        const officialPositive = officialStatus !== undefined
          ? isPositive(officialStatus)
          : false;
        const officialDL = officialStatus === ATTENDANCE_STATUS.DUTY_LEAVE;

        const courseDisabled = isCourseDisabled(cid);

        const updateCourse = (
          isExtraClass: boolean,
          offPos: boolean,
          trackPos: boolean,
        ) => {
          if (courseStats[statsKey]) {
            if (isExtraClass) {
              courseStats[statsKey].total++;
              if (trackPos) courseStats[statsKey].present++;
            } else {
              if (!offPos && trackPos) courseStats[statsKey].present++;
              else if (offPos && !trackPos) courseStats[statsKey].present--;
            }
          }
        };

        if (isTrulyExtra) {
          // Always update per-course stats
          updateCourse(true, false, trackerPositive);
          // Only aggregate into dashboard totals when course is NOT disabled
          if (!courseDisabled) {
            if (trackerPositive) modifierStats.extraPresent++;
            else modifierStats.extraAbsent++;
            if (trackerDL) modifierStats.extraDL++;
          }
        } else {
          // Always update per-course stats
          updateCourse(false, officialPositive, trackerPositive);
          // Only aggregate into dashboard totals when course is NOT disabled
          if (!courseDisabled) {
            if (!officialPositive && trackerPositive) {
              modifierStats.correctionPresent++;
            }
            if (!officialPositive && (trackerPositive || trackerDL)) {
              modifierStats.savedAbsent++;
            }
            if (!officialDL && trackerDL) modifierStats.correctionDL++;
          }
        }
      });
    }

    const finalTotal = officialStats.total + modifierStats.extraPresent +
      modifierStats.extraAbsent;
    const finalPresent = officialStats.present +
      modifierStats.correctionPresent + modifierStats.extraPresent;

    const percentage = finalTotal > 0 ? (finalPresent / finalTotal) * 100 : 0;
    const officialPercentage = officialStats.total > 0
      ? (officialStats.present / officialStats.total) * 100
      : 0;
    const formatPct = (
      val: number,
    ) => (val % 1 === 0 ? Math.round(val) : parseFloat(val.toFixed(1)));

    return {
      percentage: formatPct(percentage),
      rawPercentage: percentage,
      officialPercentage: formatPct(officialPercentage),
      rawOfficialPercentage: officialPercentage,
      realPresent: officialStats.present,
      correctionPresent: modifierStats.correctionPresent,
      extraPresent: modifierStats.extraPresent,
      realAbsent: officialStats.absent,
      savedAbsent: modifierStats.savedAbsent,
      extraAbsent: modifierStats.extraAbsent,
      realDL: officialStats.dl,
      correctionDL: modifierStats.correctionDL,
      extraDL: modifierStats.extraDL,
      otherLeave: officialStats.other,
      realTotal: officialStats.total,
      finalTotal: finalTotal,
      finalPresent: finalPresent,
      courseStats,
    };
  }, [
    coursesData,
    attendanceData,
    trackingData,
    classCourses,
    disabledCodes,
    getCourseCode,
    selectedSemester,
    selectedYear,
  ]);


  const courseRegistry = useMemo(() => {
    const registry: Record<string, any> = {};
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([id, course]: [string, any]) => {
        registry[id] = { ...course, key: id };
        const codeKey = (course.code || "").replace(/\s+/g, "").toUpperCase();
        if (codeKey && !registry[codeKey]) {
          registry[codeKey] = { ...course, key: id };
        }
      });
    }
    if (classCourses) {
      classCourses.forEach((cc: any) => {
        const codeKey = cc.course_code.replace(/\s+/g, "").toUpperCase();
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
      const codeKey = (course.code || course.key).replace(/\s+/g, "").toUpperCase();
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
        { present: 0, total: 0, officialPresent: 0, officialTotal: 0 };
      const activeCourseDetails = allCourseSummaries?.[course.code || ""];
      const { present, total, officialPresent, officialTotal } = statsObj;
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
        disabledCodes.has(course.code.replace(/\s+/g, "").toUpperCase());
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
        activeCourseDetails,
      };
    }).sort((a: any, b: any) => {
      const tierA = a.isDisabled ? 2 : a.isNew ? 1 : 0;
      const tierB = b.isDisabled ? 2 : b.isNew ? 1 : 0;
      if (tierA !== tierB) return tierA - tierB;
      if (b.bunkable !== a.bunkable) return b.bunkable - a.bunkable;
      if (b.safeBunkable !== a.safeBunkable) return b.safeBunkable - a.safeBunkable;
      if (a.required !== b.required) return a.required - b.required;
      return a.name.localeCompare(b.name);
    });
  }, [
    courseRegistry,
    stats,
    targetPercentage,
    disabledCodes,
    allCourseSummaries,
  ]);


  // Strict unified loading: stay behind the spinner until the profile is ready
  // and all core data queries are finished. Sync runs in the background after
  // render — it must NOT block the initial paint or it creates a deadlock.
  const isInitialLoading = (!profile && !isLoadingProfile) ||
    !currentSem ||
    !currentYear ||
    isLoadingAttendance ||
    isLoadingCourses ||
    isLoadingTracking ||
    isLoadingAllCourseSummaries ||
    isUpdating;

  if (
    isInitialLoading && !isAttendanceError && !isCoursesError &&
    !isTrackingError && !isAllCourseSummariesError
  ) {
    return <CompLoading />;
  }

  // Note: Regional error cases (isAttendanceError, etc.) are now handled globally
  // by the OutageBarrier in ProtectedLayout. Page-specific fallback logic
  // is removed to maintain a unified "Fail-Fast" experience.

  const isGlobalLoading = isLoadingProfile ||
    isUpdating ||
    isTransitioning ||
    isLoadingSemester ||
    isLoadingYear ||
    setSemesterMutation.isPending ||
    setAcademicYearMutation.isPending;

  const officialWidth = stats.rawOfficialPercentage;
  let diffWidth = 0, isGain = false;
  if (stats.rawPercentage >= stats.rawOfficialPercentage) {
    isGain = true;
    diffWidth = stats.rawPercentage - stats.rawOfficialPercentage;
  } else {
    isGain = false;
    diffWidth = stats.rawOfficialPercentage - stats.rawPercentage;
  }
  if (officialWidth + diffWidth > 100) diffWidth = 100 - officialWidth;
  if (diffWidth < 0) diffWidth = 0;
  const diffPresent = stats.finalPresent - stats.realPresent;
  const diffTotal = stats.finalTotal - stats.realTotal;

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-background font-manrope relative min-h-screen">
        <AnimatePresence>
          {isGlobalLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 animate-pulse" />
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8 text-center px-6"
              >
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-purple-400">
                  Syncing your academic profile...
                </h2>
                <p className="mt-2 text-muted-foreground text-sm max-w-xs mx-auto">
                  Updating your dashboard with the latest data for{" "}
                  {selectedSemester?.toUpperCase()} {selectedYear}.
                </p>
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
                  <Select
                    value={selectedSemester || ""}
                    onValueChange={(value) =>
                      handleSemesterChange(value as "even" | "odd")}
                    disabled={isUpdating || isTransitioning}
                  >
                    <SelectTrigger
                      className="w-fit h-8 px-2 text-[14px] font-medium rounded-xl pl-3 uppercase custom-dropdown dark:bg-foreground/10 dark:border-foreground/20"
                      aria-label="Select semester"
                    >
                      {selectedSemester || "semester"}
                    </SelectTrigger>
                    <SelectContent className="custom-dropdown">
                      <SelectItem value="odd">ODD</SelectItem>
                      <SelectItem value="even">EVEN</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>semester reports for academic year</span>
                  <Select
                    value={selectedYear || ""}
                    onValueChange={handleAcademicYearChange}
                    disabled={isUpdating || isTransitioning}
                  >
                    <SelectTrigger
                      className="w-fit h-8 px-2 text-[14px] font-medium rounded-xl pl-3 custom-dropdown dark:bg-foreground/10 dark:border-foreground/20"
                      aria-label="Select academic year"
                    >
                      {selectedYear || "year"}
                    </SelectTrigger>
                    <SelectContent className="custom-dropdown max-h-70">
                      {academicYears.map((year) => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </p>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full lg:w-87.5"
            >
              <Card className="custom-container shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Total Attendance
                  </CardTitle>
                  <div
                    className="flex items-center gap-2 text-sm font-bold"
                    role="status"
                    aria-live="polite"
                  >
                    {isLoadingAttendance
                      ? <Skeleton className="h-5 w-16" />
                      : (
                        <>
                          {(diffPresent !== 0 || diffTotal > 0) &&
                            stats.officialPercentage !== stats.percentage && (
                            <span className="text-muted-foreground">
                              {stats.officialPercentage}%{" "}
                              <span className="mx-0.5">→</span>
                            </span>
                          )}
                        </>
                      )}
                    <span
                      className={stats.rawPercentage >= targetPercentage
                        ? "text-primary"
                        : "text-red-600 dark:text-red-400"}
                    >
                      {isLoadingAttendance
                        ? (
                          <Skeleton className="h-7 w-12 inline-block align-middle" />
                        )
                        : `${stats.percentage}%`}
                    </span>
                    <span className="sr-only">
                      Your attendance is {stats.percentage} percent
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex h-2 mb-2 w-full overflow-hidden rounded-full bg-secondary">
                    {isGain
                      ? (
                        <>
                          <div
                            className="bg-primary h-full transition-all duration-500 ease-in-out"
                            style={{
                              width: `${Math.min(officialWidth, 100)}%`,
                            }}
                          />
                          <div
                            className="bg-green-500/60 h-full relative transition-all duration-500 ease-in-out border-l border-background/20"
                            style={{ width: `${Math.min(diffWidth, 100)}%` }}
                          >
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)] bg-size-[6px_6px]" />
                          </div>
                        </>
                      )
                      : (
                        <>
                          <div
                            className="bg-primary h-full transition-all duration-500 ease-in-out"
                            style={{
                              width: `${Math.min(stats.rawPercentage, 100)}%`,
                            }}
                          />
                          <div
                            className="bg-red-500/75 h-full relative transition-all duration-500 ease-in-out border-l border-background/20"
                            style={{ width: `${Math.min(diffWidth, 100)}%` }}
                          >
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-size-[6px_6px]" />
                          </div>
                        </>
                      )}
                  </div>
                  <p className="text-xs text-muted-foreground text-right mt-2 font-medium">
                    {isLoadingAttendance
                      ? <Skeleton className="h-3 w-40 ml-auto" />
                      : (
                        <>
                          <span className="text-foreground/80">
                            {stats.realPresent}
                          </span>
                          {diffPresent > 0 && (
                            <span className="text-green-500 ml-1">
                              &nbsp;+ ({diffPresent})
                            </span>
                          )}
                          {diffPresent < 0 && (
                            <span className="text-red-500 ml-1">
                              &nbsp;- ({Math.abs(diffPresent)})
                            </span>
                          )}
                          <span>&nbsp;present</span>
                          <span className="mx-1 text-muted-foreground/50">
                            /
                          </span>
                          <span className="text-foreground/80">
                            {stats.realTotal}
                          </span>
                          {diffTotal > 0 && (
                            <span className="text-blue-500 ml-1">
                              + ({diffTotal})
                            </span>
                          )}
                          <span>&nbsp;total</span>
                        </>
                      )}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:col-span-8"
            >
              <Card className="custom-container flex flex-col">
                <CardHeader className="flex flex-col gap-0.5">
                  <CardTitle className="text-[16px]">
                    Attendance Overview
                  </CardTitle>
                  <CardDescription className="text-accent-foreground/60 text-sm">
                    See where you&apos;ve been keeping up
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 px-4 pt-2 pb-2">
                  <div className="h-85 w-full">
                    {isLoadingAttendance
                      ? (
                        <div className="flex flex-col gap-4 items-center justify-center h-full w-full">
                          <Skeleton className="h-full w-full rounded-xl" />
                        </div>
                      )
                      : attendanceData
                      ? (
                        <ErrorBoundary
                          fallback={
                            <div className="flex items-center justify-center h-full">
                              <p className="text-muted-foreground">
                                Unable to load chart. Please try refreshing.
                              </p>
                            </div>
                          }
                        >
                          <AttendanceChart
                            attendanceData={filteredChartData}
                            trackingData={trackingData}
                            coursesData={{ courses: courseRegistry }}
                            disabledCodes={disabledCodes}
                          />
                        </ErrorBoundary>
                      )
                      : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground text-center">
                            <Image
                              src="/placeholder-chart.svg"
                              width={192}
                              height={192}
                              className="mx-auto opacity-20 mb-4 invert dark:invert-0"
                              alt=""
                              aria-hidden="true"
                            />
                            No attendance data available
                          </p>
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="lg:col-span-4 grid grid-cols-2 gap-4 h-full">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="h-full"
              >
              <Card className="custom-container flex flex-col justify-center py-4 px-2 h-full">
                <CardHeader className="pb-1 px-4">
                  <CardTitle className="text-sm font-medium">
                    Present (+DL)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    {isLoadingAttendance
                      ? <Skeleton className="h-8 w-16" />
                      : (
                        <>
                          {/* isPositive() covers DUTY_LEAVE so realPresent already includes DL */}
                          <span className="text-2xl font-bold text-green-500">
                            {stats.realPresent}
                          </span>
                          {stats.correctionPresent > 0 && (
                            <span className="text-lg font-bold text-orange-500 ml-1">
                              +{stats.correctionPresent}
                            </span>
                          )}
                          {stats.extraPresent > 0 && (
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400 ml-1">
                              +{stats.extraPresent}
                            </span>
                          )}
                        </>
                      )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="h-full"
            >
              <Card className="custom-container flex flex-col justify-center py-4 px-2 h-full">
                <CardHeader className="pb-1 px-4">
                  <CardTitle className="text-sm font-medium">
                    Absent
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    {isLoadingAttendance
                      ? <Skeleton className="h-8 w-16" />
                      : (
                        <>
                          <span className="text-2xl font-bold text-red-500">
                            {stats.realAbsent}
                          </span>
                          {stats.savedAbsent > 0 && (
                            <span className="text-lg font-bold text-orange-500 ml-1">
                              -{stats.savedAbsent}
                            </span>
                          )}
                          {stats.extraAbsent > 0 && (
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400 ml-1">
                              +{stats.extraAbsent}
                            </span>
                          )}
                        </>
                      )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="h-full"
            >
              <Card className="custom-container flex flex-col justify-center py-4 px-2 h-full">
                <CardHeader className="pb-1 px-4">
                  <CardTitle className="text-sm font-medium">
                    Duty Leave(s)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    {isLoadingAttendance
                      ? <Skeleton className="h-8 w-16" />
                      : (
                        <>
                          <span className="text-2xl font-bold text-yellow-500">
                            {stats.realDL}
                          </span>
                          {stats.correctionDL > 0 && (
                            <span className="text-lg font-bold text-orange-500 ml-1">
                              +{stats.correctionDL}
                            </span>
                          )}
                          {stats.extraDL > 0 && (
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400 ml-1">
                              +{stats.extraDL}
                            </span>
                          )}
                        </>
                      )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="h-full"
            >
              <Card className="custom-container flex flex-col justify-center py-4 px-2 h-full">
                <CardHeader className="pb-1 px-4">
                  <CardTitle className="text-sm font-medium whitespace-nowrap">
                    Special Leave(s)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  <div className="text-2xl font-bold text-teal-500 dark:text-teal-400">
                    {stats.otherLeave}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className="col-span-2 h-full"
              >
              <Card className="custom-container flex flex-col justify-center py-4 px-2 h-full">
                <CardHeader className="pb-1 px-4">
                  <CardTitle className="text-sm font-medium">
                    Active Courses
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    {isLoadingCourses
                      ? <Skeleton className="h-8 w-16" />
                      : (
                        <div className="text-2xl font-bold">
                          {activeCourseCount.active}
                          <span className="text-muted-foreground text-sm font-normal ml-1.5">
                            / {activeCourseCount.total}
                          </span>
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

          <div className="mb-6 mt-10">
            <div className="mb-6 flex flex-col justify-center items-center mx-3">
              <h2 className="text-lg font-bold mb-0.5 italic">
                Your Courses Lineup <span className="ml-1">⬇️📚</span>
              </h2>
              <p className="italic text-muted-foreground text-sm text-center">
                Your current courses — organized for easy access.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {isLoadingCourses
                ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skeleton-course-${i}`}>
                      <Skeleton className="h-70 w-full rounded-2xl" />
                    </div>
                  ))
                )
                : sortedCourses.length > 0
                ? (
                  <>
                    {sortedCourses.map((course: any) => {
                      const courseCodeNormalized =
                        (course.code || String(course.id))
                          .toUpperCase().replace(/\s+/g, "");
                      const customInstructor = customInstructors
                        ?.find(
                          (ci) => ci.course_code === courseCodeNormalized,
                        );

                      const ezygoInstructors =
                        course.institution_users?.filter((
                          user: any,
                        ) => user.pivot.courserole_id === 1) || [];

                      const hasCustomName = !!customInstructor
                        ?.instructor_name;
                      const instructorName = hasCustomName
                        ? (customInstructor.instructor_name ?? undefined)
                        : ezygoInstructors.length > 0
                        ? `${ezygoInstructors[0].first_name} ${
                          ezygoInstructors[0].last_name
                        }`
                        : undefined;

                      return (
                        <div key={course.key}>
                          <CourseCard
                            course={course}
                            initialCourseDetails={allCourseSummaries
                              ?.[course.code || ""]}
                            isBatchLoading={isLoadingAllCourseSummaries}
                            instructorName={instructorName}
                            hasCustomInstructor={hasCustomName}
                            supabaseUserId={profile?.auth_id ?? undefined}
                            onEditInstructor={() => {
                              setSelectedInstructorCourse({
                                code: courseCodeNormalized,
                                name: course.name,
                                initialName: hasCustomName
                                  ? (customInstructor.instructor_name ?? "")
                                  : "",
                              });
                              setIsEditInstructorOpen(true);
                            }}
                          />
                        </div>
                      );
                    })}

                    {/* Aesthetic "Add New Course" Card */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsAddCourseOpen(true)}
                      className="group relative cursor-pointer min-h-75 rounded-xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-accent/10 hover:bg-primary/5 transition-all duration-300 flex flex-col items-center justify-center p-8 text-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                        <Plus className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground mb-2">
                        Can&apos;t find a course?
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-50">
                        Add it manually to start tracking your attendance
                        immediately.
                      </p>
                      <div className="absolute inset-0 rounded-xl bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  </>
                )
                : (
                  <div className="col-span-full text-center py-12 bg-accent/30 rounded-2xl border-2 border-dashed border-border/60">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Plus className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No courses found</h3>
                    <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
                      Sync your profile or add courses manually to get started.
                    </p>
                      <button
                        onClick={() => setIsAddCourseOpen(true)}
                        className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-colors"
                      >
                      Add Your First Course
                    </button>
                  </div>
                )}
            </div>
          </div>

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
                      semester={currentSem}
                      year={currentYear}
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

          <AlertDialog
            open={showConfirmDialog}
            onOpenChange={setShowConfirmDialog}
          >
            <AlertDialogContent className="custom-container">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Change</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to change the{" "}
                  {pendingChange?.type === "semester"
                    ? "semester"
                    : "academic year"}. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={handleCancelChange}
                  className="custom-button"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmChange}
                  className="custom-button bg-primary! border-accent-foreground!"
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Global Add Attendance Dialog (Used by the "Add Course" Card) */}
          <AddAttendanceDialog
            open={isAddRecordOpen}
            onOpenChange={setIsAddRecordOpen}
            attendanceData={attendanceData || undefined}
            trackingData={trackingData || []}
            coursesData={coursesData || undefined}
            user={profile ? { id: String(profile.id) } : { id: "" }}
            onSuccess={async () => {
              await Promise.all([refetchAttendance(), refetchTracking()]);
            }}
            selectedSemester={selectedSemester || undefined}
            selectedYear={selectedYear || undefined}
          />

          <AddCourseDialog
            open={isAddCourseOpen}
            onOpenChange={setIsAddCourseOpen}
            semester={currentSem}
            academicYear={currentYear}
          />

          <EditInstructorDialog
            open={isEditInstructorOpen}
            onOpenChange={setIsEditInstructorOpen}
            courseCode={selectedInstructorCourse?.code ?? ""}
            courseName={selectedInstructorCourse?.name ?? ""}
            initialName={selectedInstructorCourse?.initialName ?? ""}
            semester={currentSem || ""}
            academicYear={currentYear || ""}
          />
        </main>
      </div>
      <PWAInstallBanner />
    </LazyMotion>
  );
}
