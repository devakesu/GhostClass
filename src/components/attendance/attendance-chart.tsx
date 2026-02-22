"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { AttendanceReport, TrackAttendance, Course } from "@/types";
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { generateSlotKey } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import { ATTENDANCE_STATUS } from "@/lib/logic/attendance-reconciliation";

// --- HELPERS ---
const formatCourseCode = (code: string | undefined, fallback?: string) => {
  const val = code ?? fallback ?? "";
  return val.length > 10 ? val.substring(0, 10) + "..." : val;
};

// OTHER_LEAVE (112) is also counted as present for chart display totals,
// matching the semantic used in this component before the ATTENDANCE_STATUS refactor.
const isPresent = (code: number) => {
  const n = Number(code);
  return (
    n === ATTENDANCE_STATUS.PRESENT ||
    n === ATTENDANCE_STATUS.DUTY_LEAVE ||
    n === ATTENDANCE_STATUS.OTHER_LEAVE
  );
};

const normalize = (s: string | undefined) => s?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";

/**
 * Props for AttendanceChart component.
 */
interface AttendanceChartProps {
  /** Attendance report data */
  attendanceData?: AttendanceReport;
  /** User tracking records */
  trackingData?: TrackAttendance[];
  /** Available courses data */
  coursesData?: { courses: Record<string, Course> };
}

/**
 * Props for custom bar shape in chart.
 */
interface BarShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  payload?: {
    displayedExtra: number;
  };
}

/**
 * Props for chart label rendering.
 */
interface LabelProps {
  viewBox?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
  value?: number;
  // Recharts passes additional undocumented props like offset, position, etc.
  // Using unknown for type safety while allowing Recharts' internal props
  [key: string]: unknown;
}

/**
 * Custom bar shape component with hatched pattern for visual distinction.
 * Renders rounded-top bars with fill and stroke.
 * 
 * @param props - Bar shape properties (position, size, colors)
 * @returns SVG path element for hatched bar
 */
const HatchedBarShape = (props: BarShapeProps) => {
  const { x, y, width, height, fill = '#000', stroke = '#000' } = props;
  const radius = 4;
  if (!height || height <= 0 || isNaN(height)) return null;
  const r = Math.min(radius, height);
  const pathD = `M ${x},${y + height} L ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height}`;
  return (
    <g>
      <path d={`${pathD} Z`} fill={fill} stroke="none" />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1} />
    </g>
  );
};

const BottomBarShape = (props: BarShapeProps) => {
  const { fill = '#000', x, y, width, height, payload } = props;
  if (!height || height <= 0 || isNaN(height)) return null;
  const hasTopStack = payload && payload.displayedExtra > 0;
  const radius = hasTopStack ? 0 : 4;
  const r = Math.min(radius, height);
  const pathD = `M ${x},${y + height} L ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height} Z`;
  return <path d={pathD} fill={fill} stroke={fill} strokeWidth={1} />;
};

const CustomTargetLabel = (props: LabelProps) => {
  const { viewBox, value = 0 } = props;
  if (!viewBox || viewBox.width == null || viewBox.x == null || viewBox.y == null) return null;
  const x = viewBox.width - 15;
  const y = viewBox.y; // align label center on the target line
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - 85} y={y - 12} width="90" height="24" fill="rgba(20, 20, 20, 0.95)" rx="4" stroke="#f59e0b" strokeWidth="1" />
      <text x={x - 40} y={y + 6} fill="#f59e0b" textAnchor="middle" fontSize="12" fontWeight="bold">Target: {value}%</text>
    </g>
  );
};

export function AttendanceChart({ attendanceData, trackingData, coursesData }: AttendanceChartProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const { targetPercentage } = useAttendanceSettings();
  const safeTarget = Number(targetPercentage) > 0 ? Number(targetPercentage) : 75;

  useEffect(() => {
    // Measure container dimensions and keep them in sync with container size
    if (!containerRef.current) return;

    const element = containerRef.current;

    const updateDimensions = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      setDimensions((prev) => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }

        return { width, height };
      });
    };

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
      });
      resizeObserver.observe(element);
    } else {
      window.addEventListener("resize", updateDimensions);
    }

    // Initial measurement
    updateDimensions();

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateDimensions);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 640px)");
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const data = useMemo(() => {
    if (!coursesData?.courses || !attendanceData?.studentAttendanceData) {
      return [];
    }

    interface CourseStats {
      id: string;
      code: string;
      present: number;
      absent: number;
      total: number;
      selfPresent: number;
      selfTotal: number;
      name: string;
      fullName: string;
    }

    const courseAttendance: Record<string, CourseStats> = {};
    const officialSessionMap = new Map<string, number>();

    // 1. Initialize Courses
    Object.entries(coursesData.courses).forEach(([courseId, course]) => {
      courseAttendance[courseId] = {
        id: courseId,
        code: course.code ?? course.name ?? "",
        present: 0,
        absent: 0,
        total: 0,
        selfPresent: 0,
        selfTotal: 0, 
        name: formatCourseCode(course.code || course.name),
        fullName: course.name,
      };
    });

    // 2. Process Official Data
    Object.entries(attendanceData.studentAttendanceData).forEach(([dateStr, dateData]) => {
      Object.entries(dateData).forEach(([sessionKey, session]: [string, unknown], index) => {
        const sessionData = session as { course: string | number | null; attendance: string | number; session?: string };
        if (sessionData.course !== null && courseAttendance[sessionData.course.toString()]) {
          const stats = courseAttendance[sessionData.course.toString()];
          const status = Number(sessionData.attendance);
          
          let sessionName = sessionData.session;
          if (!sessionName || sessionName === "null") {
             if (!isNaN(parseInt(sessionKey)) && parseInt(sessionKey) < 20) {
                 sessionName = sessionKey;
             } else {
                 sessionName = String(index + 1); 
             }
          }

          const key = generateSlotKey(sessionData.course.toString(), dateStr, sessionName);
          officialSessionMap.set(key, status);

          if (
            status === ATTENDANCE_STATUS.PRESENT ||
            status === ATTENDANCE_STATUS.DUTY_LEAVE ||
            status === ATTENDANCE_STATUS.OTHER_LEAVE
          ) {
            stats.present += 1;
            stats.total += 1;
          } else if (status === ATTENDANCE_STATUS.ABSENT) {
            stats.absent += 1;
            stats.total += 1;
          }
        }
      });
    });

    // 3. Process Tracking Data
    if (trackingData) {
      Object.values(courseAttendance).forEach((courseStats) => {
        const targetId = String(courseStats.id);
        const targetName = normalize(courseStats.fullName);
        const targetCode = normalize(courseStats.code);

        const courseTracks = trackingData.filter(t => {
            if (String(t.course) === targetId) return true;
            const tName = normalize(String(t.course));
            return tName === targetName || (targetCode && tName === targetCode);
        });
        
        let selfPresentDelta = 0;
        let selfTotalDelta = 0;

        courseTracks.forEach((t) => {
            const trackIsPresent = isPresent(Number(t.attendance));
            const key = generateSlotKey(courseStats.id, t.date, t.session);
            const officialStatus = officialSessionMap.get(key);

            if (t.status === 'extra') {
                selfTotalDelta += 1;
                if (trackIsPresent) selfPresentDelta += 1;
            } else {
                const officialIsPresent = officialStatus !== undefined && isPresent(officialStatus);
                if (!officialIsPresent && trackIsPresent) {
                    selfPresentDelta += 1;
                } else if (officialIsPresent && !trackIsPresent) selfPresentDelta -= 1;
            }
        });

        courseStats.selfPresent = selfPresentDelta;
        courseStats.selfTotal = selfTotalDelta; 
      });
    }

    interface CourseData extends CourseStats {
      officialPercentage: number;
      totalPercentage: number;
      displayedBase: number;
      displayedExtra: number;
      baseSuccess: number;
      baseDanger: number;
      extraSuccess: number;
      extraDanger: number;
      isLoss: boolean;
      mergedPresent: number;
      mergedTotal: number;
    }

    return Object.values(courseAttendance)
      .filter((course) => (course.total + course.selfTotal) > 0)
      .map((course): CourseData => {
        const officialPct = course.total > 0 ? parseFloat(((course.present / course.total) * 100).toFixed(2)) : 0;
        
        const mergedTotal = Math.max(course.total + course.selfTotal, 0); 
        const mergedPresent = Math.min(course.present + course.selfPresent, mergedTotal); 

        const mergedPct = mergedTotal > 0 ? parseFloat(((mergedPresent / mergedTotal) * 100).toFixed(2)) : 0;
        const isLoss = mergedPct < officialPct;
        
        const displayedBase = Math.min(officialPct, mergedPct);
        const displayedExtra = parseFloat(Math.abs(mergedPct - officialPct).toFixed(2));
        const isSafe = mergedPct >= safeTarget;

        const baseSuccess = isSafe ? displayedBase : 0;
        const baseDanger = !isSafe ? displayedBase : 0;
        
        // FIX: Decoupled 'extra' coloring from 'isSafe'.
        // Gains (!isLoss) are always Green. Losses (isLoss) are always Red.
        const extraSuccess = (displayedExtra > 0 && !isLoss) ? displayedExtra : 0;
        const extraDanger = (displayedExtra > 0 && isLoss) ? displayedExtra : 0;

        return {
          ...course,
          officialPercentage: officialPct,
          totalPercentage: mergedPct, 
          displayedBase,
          displayedExtra,
          baseSuccess,
          baseDanger,
          extraSuccess,
          extraDanger,
          isLoss,
          mergedPresent,
          mergedTotal,
          present: course.present,
          total: course.total,
          selfPresent: course.selfPresent,
          selfTotal: course.selfTotal
        };
      })
      .sort((a, b) => a.totalPercentage - b.totalPercentage);
  }, [attendanceData, trackingData, coursesData, safeTarget]);

  const getBarSize = () => {
    const courseCount = data.length;
    if (courseCount === 1) return 80; 
    if (courseCount <= 3) return 60;  
    if (courseCount <= 5) return 40;
    if (courseCount <= 8) return 30;
    return 20;
  };

  const allPercentages = data.flatMap(d => [d.totalPercentage, d.officialPercentage]);
  const nonZeroHeights = allPercentages.filter(h => h > 0);
   
  let minRef = safeTarget;
  if (nonZeroHeights.length > 0) {
      const absoluteMin = Math.min(...nonZeroHeights);
      minRef = Math.min(absoluteMin, safeTarget);
  }
  const calculatedMin = Math.floor(minRef / 5) * 5 - 5;
  const yAxisMin = Math.max(0, calculatedMin);

// Render functions for Recharts components
// Note: Using TypeScript interfaces for type safety. ESLint prop-types is disabled
// because TypeScript provides superior type checking for these component props.
/* eslint-disable react/prop-types */
const renderBottomBar = (props: BarShapeProps) => <BottomBarShape {...props} />;
const renderHatchedBar = (props: BarShapeProps) => <HatchedBarShape {...props} />;
const renderTargetLabel = (props: LabelProps) => {
  if (!props?.viewBox) return null;
  return <CustomTargetLabel viewBox={props.viewBox} value={safeTarget} />;
};
/* eslint-enable react/prop-types */

return (
  <div
    ref={containerRef}
    className="w-full h-full min-h-50"
    role="img"
    aria-label="Attendance overview bar chart"
  >
    {!dimensions.width || !dimensions.height ? (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
        <BarChart3 className="w-8 h-8 animate-pulse opacity-50" aria-hidden="true" />
      </div>
    ) : data.length > 0 ? (
      <BarChart 
        data={data} 
        margin={{ top: 10, right: 20, left: -12, bottom: isMobile ? 30 : 25 }} 
        barSize={getBarSize()}
        width={dimensions.width}
        height={dimensions.height}
      >
          <defs>
            <pattern id="striped-green" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#10b981" fillOpacity="0.25" />
              <line x1="0" y="0" x2="0" y2="8" stroke="#10b981" strokeWidth="4" strokeOpacity={0.4} />
            </pattern>
            <pattern id="striped-red" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#ef4444" fillOpacity="0.25" />
              <line x1="0" y="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="4" strokeOpacity={0.4} />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
          
          <XAxis 
            dataKey="name" 
            interval={0} 
            textAnchor="end" 
            angle={isMobile ? -90 : -45} 
            height={isMobile ? 72 : 58} 
            tick={{ fontSize: 11, fill: "#888", dy: 22 }} 
            tickMargin={isMobile ? 16 : 16} 
          />
          <YAxis domain={[yAxisMin, 100]} type="number" allowDecimals={false} allowDataOverflow={true} tickCount={Math.ceil((100 - yAxisMin) / 5) + 1} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "rgba(20, 20, 20, 0.95)", border: "1px solid #333", borderRadius: "8px", fontSize: "13px", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)" }}
            itemStyle={{ color: "#ffffff", padding: 0 }} labelStyle={{ color: "#a1a1aa", marginBottom: '0.5rem' }} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} formatter={() => null} 
            content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#141414] border border-[#333] p-3 rounded-lg shadow-md text-xs">
                      <p className="text-gray-400 mb-2 font-medium">{d.fullName}</p>
                      <div className="flex justify-between gap-4 mb-1">
                        <span className="text-gray-500">Official:</span>
                        <span className={`font-mono font-bold ${d.officialPercentage < safeTarget ? 'text-red-400' : 'text-green-400'}`}>
                          {d.officialPercentage}% <span className="text-gray-600 font-normal">({d.present}/{d.total})</span>
                        </span>
                      </div>
                      {(d.displayedExtra > 0) && (
                          <div className="flex justify-between gap-4">
                            <span className="text-primary">{d.isLoss ? "Adjusted (Loss):" : "Adjusted (Gain):"}</span>
                            <span className={`font-mono font-bold ${d.totalPercentage < safeTarget ? 'text-red-400' : 'text-green-400'}`}>
                              {d.totalPercentage}% <span className="text-gray-600 font-normal">({d.mergedPresent}/{d.mergedTotal})</span>
                            </span>
                          </div>
                      )}
                    </div>
                  );
                }
                return null;
            }}
          />
          <Bar dataKey="baseSuccess" stackId="a" isAnimationActive={false} fill="#10b981" shape={renderBottomBar} />
          <Bar dataKey="baseDanger" stackId="a" isAnimationActive={false} fill="#ef4444" shape={renderBottomBar} />
          <Bar dataKey="extraSuccess" stackId="a" isAnimationActive={false} fill="url(#striped-green)" stroke="#10b981" shape={renderHatchedBar} />
          <Bar dataKey="extraDanger" stackId="a" isAnimationActive={false} fill="url(#striped-red)" stroke="#ef4444" shape={renderHatchedBar} />

          <ReferenceLine y={safeTarget} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={2} strokeOpacity={1} label={renderTargetLabel} />
        </BarChart>
    ) : (
      <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/30">
         <BarChart3 className="w-8 h-8 mb-2 opacity-50"  aria-hidden="true" />
         <span className="text-xs font-medium">No attendance data</span>
      </div>
    )}
  </div>
);
}