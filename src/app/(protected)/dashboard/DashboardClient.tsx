"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m as motion,
} from "framer-motion";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
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
import { ClassCourse, useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";
import { PWAInstallBanner } from "@/components/pwa-install-banner";
import { useDisabledCourses } from "@/hooks/courses/useDisabledCourses";
import { useCourseLookup } from "@/hooks/courses/useCourseLookup";
import { AttendanceReport, Course, TrackAttendance, UserProfile } from "@/types";

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

interface DashboardClientProps {
  initialData?: InitialDashboardData;
  serverError?: string | null;
}

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
        const attCode = Number(s.attendance);
        if ([110, 111, 225, 112].includes(attCode) && s.class_type !== "Revision" && s.course) {
          activeIds.add(String(s.course));
        }
      });
    });
  }

  if (trackingData) {
    trackingData.forEach((t) => {
      const isSameSemester = !selectedSemester || t.semester === selectedSemester;
      const isSameYear = !selectedYear || t.year === selectedYear;
      if (t.course && isSameSemester && isSameYear && t.attendance != null) {
        activeIds.add(String(t.course));
      }
    });
  }

  const catalogCodes = new Set<string>();
  if (coursesData?.courses) {
    Object.values(coursesData.courses).forEach((c) => {
      catalogCodes.add(c.code ? c.code.toUpperCase().replace(/[\s\u00A0-]/g, "") : String(c.id).toUpperCase());
    });
  }
  if (classCourses) {
    classCourses.forEach((cc) => {
      catalogCodes.add(cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, ""));
    });
  }

  const activeCodes = new Set<string>();
  const disabledWithDataCodes = new Set<string>();

  activeIds.forEach((id) => {
    const code = String(getCourseCode(id) || id).toUpperCase().replace(/[\s\u00A0-]/g, "");
    if (code !== "" && catalogCodes.has(code)) {
      if (disabledCodes.has(code)) disabledWithDataCodes.add(code);
      else activeCodes.add(code);
    }
  });

  let noDataCount = 0;
  catalogCodes.forEach((code) => {
    if (!activeCodes.has(code) && !disabledWithDataCodes.has(code) && !disabledCodes.has(code)) noDataCount++;
  });

  return { active: activeCodes.size, noData: noDataCount, disabled: disabledCodes.size, total: catalogCodes.size };
};

const getSortPriority = (item: { isDisabled?: boolean; isNew?: boolean }) => {
  if (item.isDisabled) return 2;
  if (item.isNew) return 1;
  return 0;
};

export default function DashboardClient({ initialData, serverError }: DashboardClientProps) {
  const { data: rawProfile, isLoading: isLoadingProfile } = useProfile({ sync: true });
  const profile = rawProfile as UserProfile | undefined;
  const queryClient = useQueryClient();
  const setSemesterMutation = useSetSemester();
  const setAcademicYearMutation = useSetAcademicYear();
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

  useEffect(() => {
    if (serverError) {
      const isRateLimit = serverError.toLowerCase().includes("rate limit") || serverError.includes("429");
      toast.error(isRateLimit ? "EzyGo Rate Limit Reached" : "Dashboard Pre-fetch Failed", {
        description: isRateLimit ? "Too many requests. Please wait." : "Failed to pre-load your data.",
        duration: 8000,
        action: { label: "Retry", onClick: () => window.location.reload() },
      });
    }
  }, [serverError]);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isAddAttendanceOpen, setIsAddAttendanceOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{ type: "semester" | "academicYear"; value: string } | null>(null);
  const [isEditInstructorOpen, setIsEditInstructorOpen] = useState(false);
  const [selectedInstructorCourse, setSelectedInstructorCourse] = useState<{ code: string; name: string; initialName: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const { syncCompleted } = useSyncOnMount({ 
    username: profile?.username, 
    userId: profile?.id ? String(profile.id) : undefined, 
    enabled: !!profile?.username, 
    sentryLocation: "DashboardClient",
    sentryTag: "background_sync"
  });

  const { data: rawAttendanceData, isLoading: isLoadingAttendance, refetch: refetchAttendance } = useAttendanceReport(currentSem, currentYear, {
    enabled: syncCompleted,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    initialData: (selectedSemester === null && selectedYear === null) ? (initialData?.attendance as any) : undefined,
  });
  const attendanceData = rawAttendanceData as AttendanceReport | undefined;

  const { data: rawCoursesData, isLoading: isLoadingCourses } = useFetchCourses({
    semester: currentSem,
    year: currentYear,
    enabled: syncCompleted && !!currentSem && !!currentYear,
  });
  const coursesData = rawCoursesData as { courses: Record<string, Course> } | undefined;

  const { data: rawTrackingData, isLoading: isLoadingTracking, refetch: refetchTracking } = useTrackingData(profile, {
    semester: currentSem,
    year: currentYear,
    enabled: syncCompleted,
  });
  const trackingData = rawTrackingData as TrackAttendance[] | undefined;

  const { data: customInstructors } = useFetchCourseInstructors({ semester: currentSem, year: currentYear, enabled: syncCompleted });
  const { data: rawClassCourses } = useFetchClassCourses({ semester: currentSem, year: currentYear, enabled: syncCompleted && !!profile?.class?.id });
  const classCourses = rawClassCourses as ClassCourse[] | undefined;

  const { getCourseCodeById: getCourseCode } = useCourseLookup({ 
    coursesData, 
    classCourses, 
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    attendanceData: attendanceData as any 
  }) as { getCourseCodeById: (id: string | number) => string };

  const courseList = useMemo(() => {
    const registry = new Map<string, { code: string; id: number; name: string }>();
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([code, c]) => {
        const actualCode = c.code ?? code;
        const key = actualCode.toUpperCase().replace(/[\s\u00A0-]/g, "");
        registry.set(key, { code: actualCode, id: Number(c.id), name: c.name || "" });
      });
    }
    if (classCourses) {
      classCourses.forEach((cc) => {
        const key = cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (!registry.has(key)) registry.set(key, { code: cc.course_code, id: 0, name: cc.course_name || cc.course_code });
      });
    }
    return Array.from(registry.values());
  }, [coursesData, classCourses]);

  const { data: allCourseSummaries, isLoading: isLoadingAllCourseSummaries } = useAllCourseDetails(syncCompleted ? courseList : []);

  const { disabledCodes } = useDisabledCourses({ academicYear: currentYear, semester: currentSem });

  const handleConfirmChange = async () => {
    if (!pendingChange || !profile?.username || isUpdating) return;
    setIsUpdating(true);
    setShowConfirmDialog(false);
    await queryClient.cancelQueries();
    queryClient.invalidateQueries();

    try {
      if (pendingChange.type === "semester") {
        await setSemesterMutation.mutateAsync({ default_semester: pendingChange.value as "even" | "odd" });
        setSelectedSemester(pendingChange.value as "even" | "odd");
      } else {
        await setAcademicYearMutation.mutateAsync({ default_academic_year: pendingChange.value });
        setSelectedYear(pendingChange.value);
      }
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      logger.error("Update Failed:", error);
      toast.error("Failed to update settings");
    } finally {
      setIsUpdating(false);
      setPendingChange(null);
    }
  };

  const academicYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = 2022; y <= current; y++) years.push(`${y}-${(y + 1).toString().slice(-2)}`);
    return years;
  }, []);

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

  const courseRegistry = useMemo(() => {
    const registry = new Map<string, MergedCourse>();
    if (coursesData?.courses) {
      Object.entries(coursesData.courses).forEach(([id, course]) => {
        const basic: MergedCourse = { id: course.id || id, code: course.code, name: course.name, key: id };
        registry.set(id, basic);
        const codeKey = (course.code || "").toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (codeKey && !registry.has(codeKey)) registry.set(codeKey, basic);
      });
    }
    if (classCourses) {
      classCourses.forEach((cc) => {
        const codeKey = cc.course_code.toUpperCase().replace(/[\s\u00A0-]/g, "");
        if (!registry.has(codeKey)) {
          registry.set(codeKey, { id: 0, code: cc.course_code, name: cc.course_name || cc.course_code, key: codeKey });
        }
      });
    }
    return Object.fromEntries(registry);
  }, [coursesData, classCourses]);

  const sortedCourses = useMemo(() => {
    const seen = new Set<string>();
    const unique = Object.values(courseRegistry).filter((c) => {
      const key = (c.code || c.key).toUpperCase().replace(/[\s\u00A0-]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const statsMap = new Map(Object.entries(stats.courseStats || {}));
    const summariesMap = new Map(allCourseSummaries ? Object.entries(allCourseSummaries) : []);

    return unique.map((course) => {
      const codeKey = (course.code || course.key).toUpperCase().replace(/[\s\u00A0-]/g, "");
      const courseCode = String(course.code || "");
      const activeDetails = summariesMap.get(courseCode);
      const stat = statsMap.get(codeKey) || statsMap.get(course.key) || { present: 0, total: 0, officialPresent: 0, officialTotal: 0 };

      const isNew = stat.total === 0;
      const res = isNew ? { canBunk: 0, requiredToAttend: 0 } : calculateAttendance(stat.present, stat.total, targetPercentage);
      const safeRes = isNew ? { canBunk: 0 } : calculateAttendance(stat.officialPresent, stat.officialTotal, targetPercentage);

      return {
        ...course, currentPercentage: stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0, bunkable: res.canBunk, safeBunkable: safeRes.canBunk, required: res.requiredToAttend, isNew, isDisabled: disabledCodes.has(codeKey), ...stat, activeCourseDetails: activeDetails, name: String(course.name || "")
      };
    }).sort((a, b) => {
      const tA = getSortPriority(a);
      const tB = getSortPriority(b);
      if (tA !== tB) return tA - tB;
      if (tA === 0) {
        if (b.bunkable !== a.bunkable) return b.bunkable - a.bunkable;
        if (a.required !== b.required) return a.required - b.required;
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

  if ((!profile && !isLoadingProfile) || !currentSem || !currentYear || !syncCompleted || isLoadingAttendance || isLoadingCourses || isLoadingTracking || isLoadingAllCourseSummaries || isUpdating) return <CompLoading />;

  const isGlobalLoading = isLoadingProfile || isUpdating || isSettingsLoading || setSemesterMutation.isPending || setAcademicYearMutation.isPending || !syncCompleted;

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col bg-background font-manrope relative min-h-screen">
        <AnimatePresence>{isGlobalLoading && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300"><div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" /><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-center px-6"><h2 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-purple-400">Syncing...</h2></motion.div></motion.div>)}</AnimatePresence>
        <main className="flex-1 container mx-auto px-4 md:px-6 pt-4 md:pt-6">
          <div className="mb-6 flex flex-col lg:flex-row gap-6 lg:items-end justify-between">
            <div className="flex flex-col gap-4 flex-1">
              <h1 className="text-2xl font-bold">Welcome back, <span className="gradient-name">{profile?.first_name} {profile?.last_name}!</span></h1>
              <div className="flex gap-4 items-center">
                <p className="flex flex-wrap items-center gap-2.5 text-muted-foreground">
                  <span>Semester:</span>
                  <Select value={effectiveSemester || ""} onValueChange={(v) => { setPendingChange({ type: "semester", value: v }); setShowConfirmDialog(true); }} disabled={isUpdating}>
                    <SelectTrigger className="w-fit h-8 px-2 font-medium uppercase">{effectiveSemester || "semester"}</SelectTrigger>
                    <SelectContent><SelectItem value="odd">ODD</SelectItem><SelectItem value="even">EVEN</SelectItem></SelectContent>
                  </Select>
                  <span>Year:</span>
                  <Select value={effectiveYear || ""} onValueChange={(v) => { setPendingChange({ type: "academicYear", value: v }); setShowConfirmDialog(true); }} disabled={isUpdating}>
                    <SelectTrigger className="w-fit h-8 px-2 font-medium">{effectiveYear || "year"}</SelectTrigger>
                    <SelectContent className="max-h-70">{academicYears.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                  </Select>
                </p>
              </div>
            </div>
            <StatsPanel stats={stats} isLoadingAttendance={isLoadingAttendance} targetPercentage={targetPercentage || 75} />
          </div>

          <DashboardCharts stats={stats} isLoadingAttendance={isLoadingAttendance} attendanceData={attendanceData} filteredChartData={filteredChartData} trackingData={trackingData} courseRegistry={courseRegistry} disabledCodes={disabledCodes} activeCourseCount={activeCourseCount} isLoadingCourses={isLoadingCourses} />
          <CourseGrid isLoadingCourses={isLoadingCourses} isLoadingAllCourseSummaries={isLoadingAllCourseSummaries} sortedCourses={sortedCourses as Record<string, unknown>[]} customInstructors={customInstructors || []} allCourseSummaries={allCourseSummaries as Record<string, unknown>} profile={profile as unknown as Record<string, unknown>} onEditInstructor={(course: Record<string, unknown>, _name: string, hasCustomName: boolean, customInstructor?: unknown) => {
              const customInst = customInstructor as CustomInstructor | undefined;
              setSelectedInstructorCourse({ code: String(course.code || course.id).toUpperCase().replace(/[\s\u00A0-]/g, ""), name: String(course.name || ""), initialName: hasCustomName ? (customInst?.instructor_name ?? "") : "" });
              setIsEditInstructorOpen(true);
            }} onAddCourse={() => setIsAddCourseOpen(true)} />

          <div className="mb-6">
              <Card className="custom-container">
                <CardHeader><CardTitle>Attendance Calendar</CardTitle></CardHeader>
                <CardContent>
                  {renderAttendanceCalendarContent()}
                </CardContent>
              </Card>
            </div>

          <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogContent className="custom-container">
              <AlertDialogHeader><AlertDialogTitle>Confirm Change</AlertDialogTitle><AlertDialogDescription>Change {pendingChange?.type}?</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel onClick={() => { setShowConfirmDialog(false); setPendingChange(null); }}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleConfirmChange}>Confirm</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AddCourseDialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen} semester={currentSem} academicYear={currentYear} />
          <AddAttendanceDialog open={isAddAttendanceOpen} onOpenChange={setIsAddAttendanceOpen} attendanceData={attendanceData} trackingData={trackingData || []} coursesData={coursesData || undefined} user={profile ? { id: String(profile.id) } : { id: "" }} onSuccess={() => Promise.all([refetchAttendance(), refetchTracking()])} selectedSemester={currentSem} selectedYear={currentYear} />
          <EditInstructorDialog open={isEditInstructorOpen} onOpenChange={setIsEditInstructorOpen} courseCode={selectedInstructorCourse?.code ?? ""} courseName={selectedInstructorCourse?.name ?? ""} initialName={selectedInstructorCourse?.initialName ?? ""} semester={currentSem || ""} academicYear={currentYear || ""} />
        </main>
      </div>
      <PWAInstallBanner />
    </LazyMotion>
  );
}
