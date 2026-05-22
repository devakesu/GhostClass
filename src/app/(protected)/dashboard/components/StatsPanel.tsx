import { m as motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsPanelProps {
  stats: {
    rawOfficialPercentage: number;
    rawPercentage: number;
    finalPresent: number;
    realPresent: number;
    finalTotal: number;
    realTotal: number;
    officialPercentage: number;
    percentage: number;
    [key: string]: unknown;
  };
  isLoadingAttendance: boolean;
  targetPercentage: number;
}

export function StatsPanel({ stats, isLoadingAttendance, targetPercentage }: StatsPanelProps) {
  const officialWidth = stats.rawOfficialPercentage;
  const isGain = stats.rawPercentage >= stats.rawOfficialPercentage;
  let diffWidth = isGain
    ? stats.rawPercentage - stats.rawOfficialPercentage
    : stats.rawOfficialPercentage - stats.rawPercentage;

  if (officialWidth + diffWidth > 100) diffWidth = 100 - officialWidth;
  if (diffWidth < 0) diffWidth = 0;
  const diffPresent = stats.finalPresent - stats.realPresent;
  const diffTotal = stats.finalTotal - stats.realTotal;

  return (
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
                ? "text-sky-600 dark:text-sky-400"
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
                    className="bg-sky-500 h-full transition-all duration-500 ease-in-out"
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
                    className="bg-sky-500 h-full transition-all duration-500 ease-in-out"
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
          <div className="text-xs text-muted-foreground text-right mt-2 font-medium">
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
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

