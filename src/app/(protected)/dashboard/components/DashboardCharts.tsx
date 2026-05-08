import { m as motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Loading as CompLoading } from "@/components/loading";

const ChartSkeleton = () => (
  <div className="flex items-center justify-center h-full">
    <CompLoading minimal />
  </div>
);

const AttendanceChart = dynamic(
  () => import("@/components/attendance/attendance-chart").then((mod) => mod.AttendanceChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

interface DashboardChartsProps {
  stats: any;
  isLoadingAttendance: boolean;
  attendanceData: any;
  filteredChartData: any;
  trackingData: any;
  courseRegistry: any;
  disabledCodes: Set<string>;
  activeCourseCount: any;
  isLoadingCourses: boolean;
}

export function DashboardCharts({
  stats,
  isLoadingAttendance,
  attendanceData,
  filteredChartData,
  trackingData,
  courseRegistry,
  disabledCodes,
  activeCourseCount,
  isLoadingCourses,
}: DashboardChartsProps) {
  return (
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
  );
}

