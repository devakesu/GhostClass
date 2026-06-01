"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m as motion,
} from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { logger } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { SelectClassDialog } from "@/components/attendance/SelectClassDialog";
import { useFetchCourseInstructors } from "@/hooks/courses/instructors";
import { ClassCourse, useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";
import { PWAInstallBanner } from "@/components/pwa-install-banner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";
import { normalizeCourseCode } from "@/lib/utils";
import { AttendanceReport, Course, TrackAttendance, UserProfile } from "@/types";

import { StatsPanel } from "./components/StatsPanel";
import { DashboardCharts } from "./components/DashboardCharts";
import { CourseGrid, DashboardCourse } from "./components/CourseGrid";

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

interface MergedCourse {
  id: string | number;
  code?: string | null;
  name?: string | null;
  key: string;
  [key: string]: unknown;
}

interface CustomInstructor {
  instructor_name?: string | null;
  [key: string]: unknown;
}

type InitialDashboardData = {
  courses: unknown;
  attendance: unknown;
} | null;

type AcademicSemester = "even" | "odd";

type AcademicPeriod = {
  semester: AcademicSemester;
  year: string;
};

const academicYearPattern = /^(\d{2}|\d{4})-(\d{2}|\d{4})$/;

const formatAcademicYear = (startYear: number) => `${startYear}-${String(startYear + 1).slice(-2)}`;

const parseAcademicYearStart = (year: string) => {
  const match = academicYearPattern.exec(year.trim());
  if (!match) return null;

  const startValue = match[1].length === 2 ? `20${match[1]}` : match[1];
  const startYear = Number.parseInt(startValue, 10);
  return Number.isNaN(startYear) ? null : startYear;
};

const shiftAcademicPeriod = (
  semester: AcademicSemester,
  year: string,
  direction: "previous" | "next",
): AcademicPeriod | null => {
  const startYear = parseAcademicYearStart(year);
  if (startYear == null) return null;

  if (direction === "previous") {
    return semester === "odd"
      ? { semester: "even", year: formatAcademicYear(startYear - 1) }
      : { semester: "odd", year: formatAcademicYear(startYear) };
  }

  return semester === "odd"
    ? { semester: "even", year: formatAcademicYear(startYear) }
    : { semester: "odd", year: formatAcademicYear(startYear + 1) };
};

const getPeriodIndex = (semester: string, year: string): number | null => {
  const startYear = parseAcademicYearStart(year);
  if (startYear === null) return null;
  const sem = semester.toLowerCase();
  return startYear * 2 + (sem === "even" ? 1 : 0);
};

const formatAcademicPeriod = (period: AcademicPeriod) => `${period.semester.toUpperCase()} ${period.year}`;

function planAcademicShift(
  direction: "previous" | "next",
  effectiveSemester: AcademicSemester,
  effectiveYear: string,
  defaultAcademicInfo: { current_semester: AcademicSemester; current_year: string },
): { next: AcademicPeriod | null; errorMessage?: string; infoMessage?: string } {
  const nextPeriod = shiftAcademicPeriod(effectiveSemester, effectiveYear, direction);
  if (!nextPeriod) {
    return { next: null, errorMessage: "Could not compute the next academic period." };
  }

  let clampedNext = nextPeriod;
  let wasClamped = false;

  if (direction === "next") {
    const currentIndex = getPeriodIndex(defaultAcademicInfo.current_semester, defaultAcademicInfo.current_year);
    const nextIndex = getPeriodIndex(nextPeriod.semester, nextPeriod.year);

    if (currentIndex !== null && nextIndex !== null && nextIndex > currentIndex + 1) {
      const maxAllowedIndex = currentIndex + 1;
      const maxAllowedStartYear = Math.floor(maxAllowedIndex / 2);
      const maxAllowedSemester: AcademicSemester = maxAllowedIndex % 2 === 1 ? "even" : "odd";
      clampedNext = {
        semester: maxAllowedSemester,
        year: formatAcademicYear(maxAllowedStartYear),
      };
      wasClamped = true;
    }
  }

  if (clampedNext.semester === effectiveSemester && clampedNext.year === effectiveYear) {
    return { next: null, infoMessage: "You cannot view past the maximum allowed academic period" };
  }

  if (wasClamped) {
    return { next: clampedNext, infoMessage: "Clamped to the nearest future academic period" };
  }

  return { next: clampedNext };
}

function useDashboardServerErrorToast(serverError: string | null | undefined, isRateLimitError: boolean) {
  useEffect(() => {
    if (!serverError) return;

    toast.error(isRateLimitError ? "EzyGo Rate Limit Reached" : "Dashboard Pre-fetch Failed", {
      description: isRateLimitError ? "Too many requests. Please wait." : "Failed to pre-load your data.",
      duration: 8000,
      action: { label: "Retry", onClick: () => window.location.reload() },
    });
  }, [serverError, isRateLimitError]);
}

function useDashboardSyncFailureToast(syncSettled: boolean, syncFailed: boolean) {
  const hasShownSyncWarningRef = useRef(false);

  useEffect(() => {
    if (!syncSettled || !syncFailed || hasShownSyncWarningRef.current) return;

    hasShownSyncWarningRef.current = true;
    toast.warning("Background sync delayed", {
      description: "Showing cached data. Latest attendance updates will appear when sync recovers.",
    });
  }, [syncSettled, syncFailed]);
}

async function executeAcademicChange(params: {
  pendingChange: AcademicPeriod | null;
  profileUsername: string | undefined;
  isUpdating: boolean;
  effectiveYear: string | null;
  effectiveSemester: AcademicSemester | null;
  setAcademicYearMutation: { mutateAsync: (payload: { default_academic_year: string }) => Promise<unknown> };
  setSemesterMutation: { mutateAsync: (payload: { default_semester: AcademicSemester }) => Promise<unknown> };
  refetchProfile: () => Promise<unknown>;
  setSelectedSemester: Dispatch<SetStateAction<AcademicSemester | null>>;
  setSelectedYear: Dispatch<SetStateAction<string | null>>;
  setIsUpdating: Dispatch<SetStateAction<boolean>>;
  setIsShifting: Dispatch<SetStateAction<boolean>>;
  setShowConfirmDialog: Dispatch<SetStateAction<boolean>>;
  setPendingChange: Dispatch<SetStateAction<AcademicPeriod | null>>;
  academicShiftLockRef: MutableRefObject<boolean>;
}) {
  const {
    pendingChange,
    profileUsername,
    isUpdating,
    effectiveYear,
    effectiveSemester,
    setAcademicYearMutation,
    setSemesterMutation,
    refetchProfile,
    setSelectedSemester,
    setSelectedYear,
    setIsUpdating,
    setIsShifting,
    setShowConfirmDialog,
    setPendingChange,
    academicShiftLockRef,
  } = params;

  if (!pendingChange || !profileUsername || isUpdating) return;

  setIsUpdating(true);
  setIsShifting(true);
  setShowConfirmDialog(false);

  try {
    if (pendingChange.year !== effectiveYear) {
      await setAcademicYearMutation.mutateAsync({
        default_academic_year: pendingChange.year,
      });
    }
    if (pendingChange.semester !== effectiveSemester) {
      await setSemesterMutation.mutateAsync({
        default_semester: pendingChange.semester,
      });
    }

    try {
      await refetchProfile();
    } catch (err) {
      logger.error("Profile sync failed during transition, proceeding:", err);
    }

    setSelectedSemester(pendingChange.semester);
    setSelectedYear(pendingChange.year);
  } catch (error) {
    logger.error("Update Failed:", error);
    toast.error("Failed to update settings");
    setIsShifting(false);
  } finally {
    setIsUpdating(false);
    setPendingChange(null);
    academicShiftLockRef.current = false;
  }
}

function computeInitialDataValidity(
  initialData: InitialDashboardData | undefined,
  selectedSemester: AcademicSemester | null,
  selectedYear: string | null,
  ezygoSemester: AcademicSemester | undefined,
  ezygoYear: string | undefined,
  effectiveSemester: AcademicSemester | undefined,
  effectiveYear: string | undefined
): { isInitialDataValid: boolean; isAttendanceStale: boolean } {
  const isInitial = (() => {
    if (selectedSemester !== null || selectedYear !== null) return false;
    if (ezygoSemester && ezygoSemester !== effectiveSemester) return false;
    if (ezygoYear && ezygoYear !== effectiveYear) return false;
    return true;
  })();

  const attendance = initialData?.attendance;
  const isAttendanceStale = !!(
    attendance &&
    typeof attendance === "object" &&
    "studentAttendanceData" in attendance &&
    attendance.studentAttendanceData &&
    typeof attendance.studentAttendanceData === "object" &&
    "stale" in (attendance.studentAttendanceData as { stale?: unknown }) &&
    (attendance.studentAttendanceData as { stale?: unknown }).stale === true
  );

  return { isInitialDataValid: isInitial, isAttendanceStale };
}

interface DashboardClientProps {
  initialData?: InitialDashboardData;
  serverError?: string | null;
}

const ACTIVE_ATTENDANCE_CODES = new Set([110, 111, 225, 112]);

const isActiveAttendanceSession = (session: { attendance?: unknown; class_type?: unknown; course?: unknown }) => {
  const attCode = Number(session.attendance);
  return ACTIVE_ATTENDANCE_CODES.has(attCode) && session.class_type !== "Revision" && !!session.course;
};

const isActiveTrackingRecord = (
  record: TrackAttendance,
  selectedSemester: string | null,
  selectedYear: string | null,
) => {
  const isSameSemester = !selectedSemester || record.semester === selectedSemester;
  const isSameYear = !selectedYear || record.year === selectedYear;
  return !!record.course && isSameSemester && isSameYear && record.attendance != null;
};

const buildCatalogCodes = (
  coursesData: { courses: Record<string, Course> } | undefined | null,
  classCourses: ClassCourse[],
) => {
  const catalogCodes = new Set<string>();

  if (coursesData?.courses) {
    Object.values(coursesData.courses).forEach((c) => {
      catalogCodes.add(normalizeCourseCode(c.code ?? String(c.id)));
    });
  }

  classCourses.forEach((cc) => {
    catalogCodes.add(normalizeCourseCode(cc.course_code ?? ""));
  });

  return catalogCodes;
};

const countNoDataCodes = (
  catalogCodes: Set<string>,
  activeCodes: Set<string>,
  disabledWithDataCodes: Set<string>,
  disabledCodes: Set<string>,
) => Array.from(catalogCodes).reduce((count, code) => {
  const hasNoData = !activeCodes.has(code) && !disabledWithDataCodes.has(code) && !disabledCodes.has(code);
  return hasNoData ? count + 1 : count;
}, 0);

const getActiveCourseStats = (
  attendanceData: AttendanceReport | undefined | null,
  trackingData: TrackAttendance[],
  coursesData: { courses: Record<string, Course> } | undefined | null,
  classCourses: ClassCourse[],
  disabledCodes: Set<string>,
  selectedSemester: string | null,
  selectedYear: string | null,
  getCourseCode: (id: string | number) => string
) => {
  const activeIds = new Set<string>();

  if (attendanceData?.studentAttendanceData) {
    Object.values(attendanceData.studentAttendanceData).forEach((sessions) => {
      if (!sessions) return;
      Object.values(sessions).forEach((s) => {
        if (isActiveAttendanceSession(s)) {
          activeIds.add(String(s.course));
        }
      });
    });
  }

  if (trackingData) {
    trackingData.forEach((t) => {
      if (isActiveTrackingRecord(t, selectedSemester, selectedYear)) {
        activeIds.add(String(t.course));
      }
    });
  }

  const catalogCodes = buildCatalogCodes(coursesData, classCourses);

  const activeCodes = new Set<string>();
  const disabledWithDataCodes = new Set<string>();

  activeIds.forEach((id) => {
    const code = normalizeCourseCode(String(getCourseCode(id) || id));
    if (code !== "" && catalogCodes.has(code)) {
      if (disabledCodes.has(code)) disabledWithDataCodes.add(code);
      else activeCodes.add(code);
    }
  });

  const noDataCount = countNoDataCodes(catalogCodes, activeCodes, disabledWithDataCodes, disabledCodes);

  return { active: activeCodes.size, noData: noDataCount, disabled: disabledCodes.size, total: catalogCodes.size };
};

const getSortPriority = (item: { isDisabled?: boolean; isNew?: boolean }) => {
  if (item.isDisabled) return 2;
  if (item.isNew) return 1;
  return 0;
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- This component orchestrates multiple guarded async data flows and UI states in one page-level boundary.
export default function DashboardClient({ initialData, serverError }: DashboardClientProps) {
  const { data: rawProfile, isLoading: isLoadingProfile, refetch: refetchProfile } = useProfile({ sync: true, force: true });
  const profile = rawProfile as UserProfile | undefined;
  const queryClient = useQueryClient();

  // The force variant uses its own ["profile", "synced"] query key to avoid
  // deduplication with the navbar's no-force fetch. Once the EzyGo sync resolves,
  // backfill the shared ["profile"] cache so the navbar and all other components
  // see the latest data without needing their own round-trip.
  useEffect(() => {
    if (rawProfile) {
      queryClient.setQueryData(["profile"], rawProfile);
      
      const userClass = rawProfile.class as { sem?: string; year?: string } | null | undefined;
      if (userClass) {
        if (userClass.sem) {
          queryClient.setQueryData(["semester"], userClass.sem);
        }
        if (userClass.year) {
          queryClient.setQueryData(["academic-year"], userClass.year);
        }
      }
    }
  }, [rawProfile, queryClient]);
  const setSemesterMutation = useSetSemester({ skipInvalidations: true });
  const setAcademicYearMutation = useSetAcademicYear({ skipInvalidations: true });
  const { targetPercentage } = useAttendanceSettings();

  const { data: userSettings, isLoading: isSettingsLoading } = useFetchUserSettings();
  const ezygoSemester = userSettings?.semester;
  const ezygoYear = userSettings?.academicYear;

  const [selectedSemester, setSelectedSemester] = useState<"even" | "odd" | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const defaultAcademicInfo = useMemo(() => calculateCurrentAcademicInfo(), []);
  const effectiveSemester = selectedSemester ?? ezygoSemester ?? defaultAcademicInfo.current_semester;
  const effectiveYear = selectedYear ?? ezygoYear ?? defaultAcademicInfo.current_year;

  const currentSem = effectiveSemester || undefined;
  const currentYear = effectiveYear || undefined;
  const isProfileReady = !!profile?.username && !isLoadingProfile;

  const isRateLimitError = serverError ? (serverError.toLowerCase().includes("rate limit") || serverError.includes("429")) : false;
  useDashboardServerErrorToast(serverError, isRateLimitError);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isAddAttendanceOpen, setIsAddAttendanceOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<AcademicPeriod | null>(null);
  const [isEditInstructorOpen, setIsEditInstructorOpen] = useState(false);
  const [selectedInstructorCourse, setSelectedInstructorCourse] = useState<{ code: string; name: string; initialName: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isShifting, setIsShifting] = useState(false);
  const [hasRefetchedAllCourses, setHasRefetchedAllCourses] = useState(false);
  const [hasSyncedAndLoaded, setHasSyncedAndLoaded] = useState(false);
  const [isSelectClassOpen, setIsSelectClassOpen] = useState(false);
  const academicShiftLockRef = useRef(false);

  const { syncSettled, syncFailed } = useSyncOnMount({
    username: profile?.username,
    userId: profile?.id ? String(profile.id) : undefined,
    enabled: !!profile?.username,
    sentryLocation: "DashboardClient",
    sentryTag: "background_sync",
    onSuccess: async (data) => {
      const changed = (data.deletions ?? 0) + (data.updates ?? 0);
      if (changed > 0) {
        toast.info("Dashboard Updated", {
          description: "Background sync applied latest attendance changes.",
        });
      }
    },
  });

  const isSyncSettled = !profile?.username || syncSettled;
  useDashboardSyncFailureToast(syncSettled, syncFailed);

  useEffect(() => {
    const shouldOpen = !!(isSyncSettled && profile && !profile.class?.id);
    const timer = setTimeout(() => {
      setIsSelectClassOpen(shouldOpen);
    }, 0);
    return () => clearTimeout(timer);
  }, [isSyncSettled, profile]);

  const { isInitialDataValid, isAttendanceStale } = useMemo(() =>
    computeInitialDataValidity(
      initialData,
      selectedSemester,
      selectedYear,
      (ezygoSemester === "even" || ezygoSemester === "odd") ? ezygoSemester : undefined,
      ezygoYear ?? undefined,
      (effectiveSemester === "even" || effectiveSemester === "odd") ? effectiveSemester : undefined,
      effectiveYear,
    ),
    [initialData, selectedSemester, selectedYear, ezygoSemester, ezygoYear, effectiveSemester, effectiveYear]
  );

  const { data: rawAttendanceData, isLoading: isLoadingAttendance, isFetching: isFetchingAttendance, refetch: refetchAttendance } = useAttendanceReport(currentSem, currentYear, {
    enabled: isProfileReady && !!currentSem && !!currentYear,
    initialData: (isInitialDataValid && !isAttendanceStale) ? (initialData?.attendance as AttendanceReport ?? undefined) : undefined,
  });
  const attendanceData = rawAttendanceData as AttendanceReport | undefined;

  const formattedInitialCourses = useMemo(() => {
    if (!initialData?.courses) return undefined;
    if (Array.isArray(initialData.courses)) {
      return {
        courses: initialData.courses.reduce(
          (acc: Record<string, Course>, course: Course) => {
            acc[course.id.toString()] = course;
            return acc;
          },
          {}
        ),
      };
    }
    if (
      typeof initialData.courses === "object" &&
      initialData.courses !== null &&
      "courses" in initialData.courses
    ) {
      return initialData.courses as { courses: Record<string, Course> };
    }
    return undefined;
  }, [initialData]);

  const { data: rawCoursesData, isLoading: isLoadingCourses, isFetching: isFetchingCourses } = useFetchCourses({
    semester: currentSem,
    year: currentYear,
    enabled: isProfileReady && !!currentSem && !!currentYear,
    initialData: isInitialDataValid ? formattedInitialCourses : undefined,
  });
  const coursesData = rawCoursesData as { courses: Record<string, Course> } | undefined;

  const { data: rawTrackingData, refetch: refetchTracking } = useTrackingData(profile, {
    semester: currentSem,
    year: currentYear,
    enabled: isProfileReady,
  });
  const trackingData = rawTrackingData as TrackAttendance[] | undefined;

  const { data: customInstructors } = useFetchCourseInstructors({ semester: currentSem, year: currentYear, enabled: isProfileReady && !!currentSem && !!currentYear });
  const { data: rawClassCourses, isFetching: isFetchingClassCourses } = useFetchClassCourses({ semester: currentSem, year: currentYear, enabled: isProfileReady && !!currentSem && !!currentYear && !!profile?.class?.id });
  const classCourses = rawClassCourses as ClassCourse[] | undefined;

  const { getCourseCodeById: getCourseCode } = useCourseLookup({
    coursesData,
    classCourses,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    attendanceData: attendanceData as any
  }) as { getCourseCodeById: (id: string | number) => string };

  const { courseList, courseRegistry } = useMemo(() => {
    const listMap = new Map<string, { code: string; id: number; name: string }>();
    const registry = new Map<string, MergedCourse>();

    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([id, course]) => {
        const courseCode = course.code ?? String(id);
        const item = { code: courseCode, id: Number(course.id), name: course.name || "" };

        // Deduplicate list by normalized code
        const norm = normalizeCourseCode(courseCode || "");
        if (norm && !listMap.has(norm)) listMap.set(norm, item);

        // Populate registry keyed by id and by normalized code key
        const basic: MergedCourse = { id: course.id || id, code: course.code, name: course.name, key: id };
        registry.set(String(id), basic);
        const codeKey = normalizeCourseCode(course.code || "");
        if (codeKey && !registry.has(codeKey)) registry.set(codeKey, basic);
      });
    }

    if (classCourses) {
      classCourses.forEach((cc) => {
        const norm = normalizeCourseCode(cc.course_code);
        if (!listMap.has(norm)) listMap.set(norm, { code: cc.course_code, id: 0, name: cc.course_name || cc.course_code });

        const codeKey = normalizeCourseCode(cc.course_code);
        if (!registry.has(codeKey)) {
          registry.set(codeKey, { id: 0, code: cc.course_code, name: cc.course_name || cc.course_code, key: codeKey });
        }
      });
    }

    return {
      courseList: Array.from(listMap.values()),
      courseRegistry: Object.fromEntries(registry),
    };
  }, [coursesData, classCourses]);

  const isAllCourseDetailsEnabled =
    !isUpdating &&
    (!isShifting ||
      (!isFetchingCourses && !isFetchingAttendance && !isFetchingClassCourses));

  const {
    data: allCourseSummaries,
    isLoading: isLoadingAllCourseSummaries,
    isFetching: isFetchingAllCourseSummaries,
  } = useAllCourseDetails(courseList, currentSem, currentYear, { enabled: isAllCourseDetailsEnabled });

  useEffect(() => {
    if (syncSettled) {
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  }, [syncSettled, queryClient]);

  useEffect(() => {
    if (syncSettled && !isFetchingAttendance && !isFetchingAllCourseSummaries) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional state update after sync completes and queries resolve
      setHasSyncedAndLoaded(true);
    }
  }, [syncSettled, isFetchingAttendance, isFetchingAllCourseSummaries]);

  useEffect(() => {
    if (!isShifting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional state reset when shifting ends
      setHasRefetchedAllCourses(false);
      return;
    }

    if (
      !isUpdating &&
      !isFetchingCourses &&
      !isFetchingAttendance &&
      !isFetchingClassCourses &&
      !isLoadingProfile &&
      !hasRefetchedAllCourses
    ) {
      setHasRefetchedAllCourses(true);
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    }
  }, [
    isShifting,
    isUpdating,
    isFetchingCourses,
    isFetchingAttendance,
    isFetchingClassCourses,
    isLoadingProfile,
    hasRefetchedAllCourses,
    queryClient,
  ]);

  useEffect(() => {
    if (
      isShifting &&
      !isUpdating &&
      hasRefetchedAllCourses &&
      !isFetchingCourses &&
      !isFetchingAttendance &&
      !isFetchingClassCourses &&
      !isFetchingAllCourseSummaries
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional state reset when transition finishes
      setIsShifting(false);
    }
  }, [
    isShifting,
    isUpdating,
    hasRefetchedAllCourses,
    isFetchingCourses,
    isFetchingAttendance,
    isFetchingClassCourses,
    isFetchingAllCourseSummaries,
  ]);

  useEffect(() => {
    if (selectedSemester !== null || selectedYear !== null) {
      // Invalidate all active queries affected by the semester/year shift.
      // Since they are now active under the new term parameters, this forces them
      // to reload the fresh data.
      queryClient.invalidateQueries({ queryKey: ["courses", currentSem, currentYear], exact: true });
      queryClient.invalidateQueries({ queryKey: ["attendance-report", currentSem, currentYear], exact: true });
      queryClient.invalidateQueries({ queryKey: ["class_courses"] });
      queryClient.invalidateQueries({ queryKey: ["course_instructors", currentSem, currentYear], exact: true });
      queryClient.invalidateQueries({ queryKey: ["track_data"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
      queryClient.invalidateQueries({ queryKey: ["exams", currentSem, currentYear], exact: true });
      queryClient.invalidateQueries({ queryKey: ["exam-answers"] });
      queryClient.invalidateQueries({ queryKey: ["exam-questions"] });
      queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] });
    }
  }, [selectedSemester, selectedYear, currentSem, currentYear, queryClient]);

  const { disabledCodes } = useDisabledCourses({ academicYear: currentYear, semester: currentSem });

  const pendingPeriodLabel = pendingChange ? formatAcademicPeriod(pendingChange) : null;

  const requestAcademicShift = (direction: "previous" | "next") => {
    if (!effectiveSemester || !effectiveYear || isUpdating || academicShiftLockRef.current) return;
    const plan = planAcademicShift(direction, effectiveSemester, effectiveYear, defaultAcademicInfo);
    if (plan.errorMessage) {
      toast.error(plan.errorMessage);
      return;
    }
    if (plan.infoMessage) {
      toast.info(plan.infoMessage);
    }
    if (!plan.next) return;

    academicShiftLockRef.current = true;
    setPendingChange(plan.next);
    setShowConfirmDialog(true);
  };

  const handleConfirmChange = async () => {
    await executeAcademicChange({
      pendingChange,
      profileUsername: profile?.username,
      isUpdating,
      effectiveYear,
      effectiveSemester,
      setAcademicYearMutation,
      setSemesterMutation,
      refetchProfile,
      setSelectedSemester,
      setSelectedYear,
      setIsUpdating,
      setIsShifting,
      setShowConfirmDialog,
      setPendingChange,
      academicShiftLockRef,
    });
  };

  const activeCourseCount = useMemo(() => getActiveCourseStats(attendanceData, trackingData || [], coursesData, classCourses || [], disabledCodes, effectiveSemester, effectiveYear, getCourseCode), [attendanceData, trackingData, coursesData, classCourses, disabledCodes, effectiveSemester, effectiveYear, getCourseCode]);

  const filteredChartData = useMemo(() => {
    if (!attendanceData) return undefined;
    const newData = structuredClone(attendanceData);
    if (newData.studentAttendanceData) {
      const filteredEntries = Object.entries(newData.studentAttendanceData).map(([date, sessions]) => {
        const filteredSessions = Object.fromEntries(
          Object.entries(sessions).filter(([, s]) => s.class_type !== "Revision")
        );
        return [date, filteredSessions];
      });
      newData.studentAttendanceData = Object.fromEntries(filteredEntries);
    }
    return newData;
  }, [attendanceData]);

  const stats = useDashboardStats({ coursesData, attendanceData, trackingData, classCourses, disabledCodes, selectedSemester: effectiveSemester, selectedYear: effectiveYear });



  const sortedCourses = useMemo<DashboardCourse[]>(() => {
    const seen = new Set<string>();
    const unique = Object.values(courseRegistry).filter((c) => {
      const key = normalizeCourseCode(String(c.code || c.key));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const statsMap = new Map(Object.entries(stats.courseStats || {}));
    const summariesMap = new Map(allCourseSummaries ? Object.entries(allCourseSummaries) : []);

    return unique.map((course) => {
      const codeKey = normalizeCourseCode(String(course.code || course.key));
      const courseCode = String(course.code || "");
      const activeDetails = summariesMap.get(courseCode);
      const stat = statsMap.get(codeKey) || statsMap.get(course.key) || { present: 0, total: 0, officialPresent: 0, officialTotal: 0 };

      const isNew = stat.total === 0;
      const res = isNew ? { canBunk: 0, requiredToAttend: 0 } : calculateAttendance(stat.present, stat.total, targetPercentage);
      const safeRes = isNew ? { canBunk: 0 } : calculateAttendance(stat.officialPresent, stat.officialTotal, targetPercentage);

      return {
        ...course,
        currentPercentage: stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0,
        bunkable: res.canBunk,
        safeBunkable: safeRes.canBunk,
        required: res.requiredToAttend,
        isNew,
        isDisabled: disabledCodes.has(codeKey),
        ...stat,
        activeCourseDetails: activeDetails,
        name: String(course.name || "")
      } as DashboardCourse;
    }).sort((a, b) => {
      const tA = getSortPriority(a);
      const tB = getSortPriority(b);
      if (tA !== tB) return tA - tB;
      if (tA === 0) {
        if ((b.bunkable ?? 0) !== (a.bunkable ?? 0)) return (b.bunkable ?? 0) - (a.bunkable ?? 0);
        if ((a.required ?? 0) !== (b.required ?? 0)) return (a.required ?? 0) - (b.required ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }, [courseRegistry, stats, targetPercentage, disabledCodes, allCourseSummaries]);

  const renderAttendanceCalendarContent = () => {
    if (isLoadingAttendance) {
      return <Skeleton className="h-105 w-full" />;
    }
    if (attendanceData) {
      return (
        <AttendanceCalendar
          attendanceData={attendanceData}
          semester={effectiveSemester || undefined}
          year={effectiveYear || undefined}
          coursesData={{ courses: courseRegistry as unknown as Record<string, Course> }}
          classCourses={classCourses}
        />
      );
    }
    return <div className="h-50 flex items-center justify-center">No data</div>;
  };

  if (!profile || isLoadingProfile || !currentSem || !currentYear) return <CompLoading />;

  const isDataLoading = !syncSettled || !hasSyncedAndLoaded || isSettingsLoading || isLoadingAttendance || (isAllCourseDetailsEnabled && isLoadingAllCourseSummaries);

  const isGlobalLoading = isLoadingProfile || isUpdating || isSettingsLoading || setSemesterMutation.isPending || setAcademicYearMutation.isPending || isShifting;

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-background font-manrope relative min-h-screen">
        <AnimatePresence>{isGlobalLoading && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300"><div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" /><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-center px-6"><h2 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-purple-400">Syncing...</h2></motion.div></motion.div>)}</AnimatePresence>

        <main className="flex-1 container mx-auto px-4 md:px-6 pt-4 md:pt-6">
          {serverError && (
            <div className="mb-4">
              <div role="alert" className="w-full flex items-center justify-between gap-4 p-3 rounded-md border bg-amber-50 border-amber-200 text-amber-800">
                <div className="text-sm">
                  <strong className="font-semibold">{isRateLimitError ? "EzyGo Rate Limit" : "Data prefetch failed"}</strong>
                  <div className="text-xs mt-0.5">{isRateLimitError ? "Too many requests. Some data may be unavailable." : "Failed to preload dashboard data. You can retry or continue."}</div>
                </div>
                <div className="shrink-0">
                  <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm font-semibold">Retry</button>
                </div>
              </div>
            </div>
          )}
          <div className="mb-6 flex flex-col lg:flex-row gap-6 lg:items-end justify-between">
            <div className="flex flex-col gap-3 flex-1">
              <h1 className="text-2xl font-bold">Welcome back, <span className="gradient-name">{profile?.first_name} {profile?.last_name}!</span></h1>
              <span className="inline-flex items-center justify-center rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary w-fit">
                {profile?.class?.name || "Unassigned"}
              </span>
              <p className="text-xs text-foreground/50 font-medium italic">
                For students juggling classes, internals, labs, submissions, caffeine, and “I’ll study tomorrow” energy ☕📚
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-primary/25 bg-linear-to-r from-primary/8 via-purple-500/8 to-primary/8 p-1 shadow-md shadow-primary/5 backdrop-blur-md transition-all duration-300 hover:border-primary/45">
                  <button
                    type="button"
                    aria-label="Go to previous academic period"
                    onClick={() => requestAcademicShift("previous")}
                    disabled={isUpdating}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary/70 transition-all hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer active:scale-90"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div className="min-w-44 px-3 text-center select-none">
                    <div className="text-[9px] font-black uppercase tracking-[0.25em] text-primary/85">
                      Academic Term
                    </div>
                    <div className="mt-0.5 flex items-center justify-center gap-2">
                      <div className="text-sm font-black uppercase tracking-[0.18em] bg-clip-text text-transparent bg-linear-to-r from-primary via-purple-600 to-indigo-600 dark:from-primary dark:via-purple-400 dark:to-blue-400">
                        {effectiveSemester?.toUpperCase()} {effectiveYear}
                      </div>
                      {(() => {
                        const currentStart = parseAcademicYearStart(defaultAcademicInfo.current_year) ?? new Date().getFullYear();
                        const viewedStart = parseAcademicYearStart(String(effectiveYear)) ?? currentStart;
                        if (viewedStart > currentStart) {
                          return (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100/40 px-2 py-0.5 rounded-full border border-amber-200">Future</span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Go to next academic period"
                    onClick={() => requestAcademicShift("next")}
                    disabled={isUpdating}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary/70 transition-all hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer active:scale-90"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            {!isDataLoading && (
              <StatsPanel stats={stats} isLoadingAttendance={isLoadingAttendance} targetPercentage={targetPercentage || 75} />
            )}
          </div>

          {isDataLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 min-h-[400px]">
              <CompLoading minimal message="Loading dashboard statistics and course details..." />
            </div>
          ) : (
            <>
              <DashboardCharts stats={stats} isLoadingAttendance={isLoadingAttendance} attendanceData={attendanceData} filteredChartData={filteredChartData} trackingData={trackingData} courseRegistry={courseRegistry} disabledCodes={disabledCodes} activeCourseCount={activeCourseCount} isLoadingCourses={isLoadingCourses} />
              <CourseGrid isLoadingCourses={isLoadingCourses} isLoadingAllCourseSummaries={isLoadingAllCourseSummaries || !isAllCourseDetailsEnabled} sortedCourses={sortedCourses} customInstructors={customInstructors || []} allCourseSummaries={allCourseSummaries as Record<string, unknown>} profile={profile ?? null} onEditInstructor={(course: DashboardCourse, _name: string, hasCustomName: boolean, customInstructor?: { instructor_name?: string | null } | undefined | null) => {
                const customInst = customInstructor as CustomInstructor | undefined;
                setSelectedInstructorCourse({ code: normalizeCourseCode(String(course.code || course.id)), name: String(course.name || ""), initialName: hasCustomName ? (customInst?.instructor_name ?? "") : "" });
                setIsEditInstructorOpen(true);
              }} onAddCourse={() => {
                if (!profile?.class?.id) {
                  toast.error("You have not assigned a class yet.");
                } else {
                  setIsAddCourseOpen(true);
                }
              }} />

              <div className="mb-6">
                <Card className="custom-container">
                  <CardHeader><CardTitle>Attendance Calendar</CardTitle></CardHeader>
                  <CardContent>
                    {renderAttendanceCalendarContent()}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <AlertDialog
            open={showConfirmDialog}
            onOpenChange={(open) => {
              setShowConfirmDialog(open);
              if (!open) {
                setPendingChange(null);
                academicShiftLockRef.current = false;
              }
            }}
          >
            <AlertDialogContent className="custom-container">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm academic period change</AlertDialogTitle>
                <AlertDialogDescription>
                  Change from {effectiveSemester?.toUpperCase()} {effectiveYear} to {pendingPeriodLabel}?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel onClick={() => { setShowConfirmDialog(false); setPendingChange(null); academicShiftLockRef.current = false; }}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleConfirmChange}>Confirm</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AddCourseDialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen} semester={currentSem} academicYear={currentYear} />
          <AddAttendanceDialog open={isAddAttendanceOpen} onOpenChange={setIsAddAttendanceOpen} attendanceData={attendanceData} trackingData={trackingData || []} coursesData={coursesData || undefined} user={profile ? { id: String(profile.id) } : { id: "" }} onSuccess={() => Promise.all([refetchAttendance(), refetchTracking()])} selectedSemester={currentSem} selectedYear={currentYear} />
          <EditInstructorDialog open={isEditInstructorOpen} onOpenChange={setIsEditInstructorOpen} courseCode={selectedInstructorCourse?.code ?? ""} courseName={selectedInstructorCourse?.name ?? ""} initialName={selectedInstructorCourse?.initialName ?? ""} />
          {currentSem && currentYear && (
            <SelectClassDialog
              open={isSelectClassOpen}
              onOpenChange={setIsSelectClassOpen}
              semester={currentSem}
              academicYear={currentYear}
              isCloseable={false}
            />
          )}
        </main>
      </div>
      <PWAInstallBanner />
    </LazyMotion>
  );
}
