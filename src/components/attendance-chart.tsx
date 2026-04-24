"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { AttendanceReport, TrackAttendance, Course } from "@/types";
import { useAttendanceSettings } from "@/providers/attendance-settings";

// --- HELPERS ---
const formatCourseCode = (code: string) => {
  if (!code) return "";
  return code.length > 10 ? code.substring(0, 10) + "..." : code;
};

const normalizeSession = (s: any) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const getSessionKey = (courseId: string, dateStr: string, session: any) => {
  let normDate = dateStr;
  if (/^\d{8}$/.test(dateStr)) {
    normDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  } else {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) normDate = d.toISOString().split('T')[0];
  }
  return `${courseId}_${normDate}_${normalizeSession(session)}`;
};

const isPresent = (code: number) => [110, 225, 112].includes(Number(code));

interface AttendanceChartProps {
  attendanceData?: AttendanceReport;
  trackingData?: TrackAttendance[];
  coursesData?: { courses: Record<string, Course> };
}

// --- SHAPES ---
const HatchedBarShape = (props: any) => {
  const { x, y, width, height, fill, stroke } = props;
  const radius = 4;
  if (!height || height <= 0) return null;
  const r = Math.min(radius, height);
  const pathD = `M ${x},${y + height} L ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height}`;
  return (
    <g>
      <path d={`${pathD} Z`} fill={fill} stroke="none" />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1} />
    </g>
  );
};

const BottomBarShape = (props: any) => {
  const { fill, x, y, width, height, payload } = props;
  if (!height || height <= 0) return null;
  const hasTopStack = payload && payload.displayedExtra > 0;
  const radius = hasTopStack ? 0 : 4;
  const r = Math.min(radius, height);
  const pathD = `M ${x},${y + height} L ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height} Z`;
  return <path d={pathD} fill={fill} stroke={fill} strokeWidth={1} />;
};

const CustomTargetLabel = (props: any) => {
  const { viewBox, value } = props;
  const x = viewBox.width - 5;
  const y = viewBox.y;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - 85} y={y - 12} width="90" height="24" fill="rgba(20, 20, 20, 0.95)" rx="4" stroke="#f59e0b" strokeWidth="1" />
      <text x={x - 40} y={y + 5} fill="#f59e0b" textAnchor="middle" fontSize="12" fontWeight="bold">Target: {value}%</text>
    </g>
  );
};

export function AttendanceChart({ attendanceData, trackingData, coursesData }: AttendanceChartProps) {
  const { targetPercentage } = useAttendanceSettings();
  const safeTarget = Number(targetPercentage) > 0 ? Number(targetPercentage) : 75;

  const data = useMemo(() => {
    if (!coursesData?.courses || !attendanceData?.studentAttendanceData) {
      return [];
    }

    const courseAttendance: Record<string, any> = {};
    const officialSessionMap = new Map<string, number>();

    // 1. Initialize Courses
    Object.entries(coursesData.courses).forEach(([courseId, course]) => {
      courseAttendance[courseId] = {
        id: courseId,
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
      Object.values(dateData).forEach((session: any) => {
        if (session.course !== null && courseAttendance[session.course.toString()]) {
          const stats = courseAttendance[session.course.toString()];
          const status = Number(session.attendance);
          
          const key = getSessionKey(session.course.toString(), dateStr, session.session);
          officialSessionMap.set(key, status);

          if ([110, 225, 112].includes(status)) {
            stats.present += 1;
            stats.total += 1;
          } else if (status === 111) {
            stats.absent += 1;
            stats.total += 1;
          }
        }
      });
    });

    // 3. Process Tracking Data
    if (trackingData) {
      Object.values(courseAttendance).forEach((courseStats: any) => {
        const courseTracks = trackingData.filter(t => t.course.toString() === courseStats.id);
        
        let selfPresentDelta = 0;
        let selfTotalDelta = 0;

        courseTracks.forEach((t) => {
            const trackIsPresent = isPresent(Number(t.attendance));
            const key = getSessionKey(courseStats.id, t.date, t.session);
            const officialStatus = officialSessionMap.get(key);

            // Logic consistent with CourseCard.tsx:
            if (t.status === 'extra') {
                // Extra: Adds to Total
                selfTotalDelta += 1;
                if (trackIsPresent) selfPresentDelta += 1;
            } else {
                // Correction (or Collision):
                // Only adds to Present if we are correcting an Absent -> Present
                // Does NOT add to Total.
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

    // 4. Calculate Percentages & Visuals
    return Object.values(courseAttendance)
      .filter((course: any) => (course.total + course.selfTotal) > 0)
      .map((course: any) => {
        const officialPct = course.total > 0 ? parseFloat(((course.present / course.total) * 100).toFixed(2)) : 0;
        
        const mergedTotal = Math.max(course.total + course.selfTotal, 0); 
        const mergedPresent = Math.min(course.present + course.selfPresent, mergedTotal); 

        const mergedPct = mergedTotal > 0 ? parseFloat(((mergedPresent / mergedTotal) * 100).toFixed(2)) : 0;
        const isLoss = mergedPct < officialPct;
        
        const displayedBase = Math.min(officialPct, mergedPct);
        const displayedExtra = parseFloat(Math.abs(mergedPct - officialPct).toFixed(2));

        return {
          ...course,
          officialPercentage: officialPct,
          totalPercentage: mergedPct, 
          displayedBase,
          displayedExtra,
          isLoss,
          mergedPresent,
          mergedTotal,
          present: course.present,
          total: course.total,
          selfPresent: course.selfPresent,
          selfTotal: course.selfTotal
        };
      })
      .sort((a: any, b: any) => a.totalPercentage - b.totalPercentage);
  }, [attendanceData, trackingData, coursesData, targetPercentage]);

  const getBarSize = () => {
    const courseCount = data.length;
    if (courseCount <= 5) return 40;
    if (courseCount <= 8) return 30;
    return 20;
  };

  const barHeights = data.map(d => d.totalPercentage);
  const nonZeroHeights = barHeights.filter(h => h > 0);
  let minRef = safeTarget;
  if (nonZeroHeights.length > 0) {
      minRef = Math.min(Math.min(...nonZeroHeights), safeTarget);
  }
  const calculatedMin = Math.floor(minRef / 5) * 5 - 5;
  const yAxisMin = Math.max(0, calculatedMin);

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 30, right: 10, left: -20, bottom: 5 }} barSize={getBarSize()}>
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
          <XAxis dataKey="name" interval={0} textAnchor="end" angle={-45} height={60} tick={{ fontSize: 11, fill: "#888" }} tickMargin={10} />
          <YAxis domain={[yAxisMin, 100]} type="number" allowDecimals={false} allowDataOverflow={true} tickCount={Math.ceil((100 - yAxisMin) / 5) + 1} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "rgba(20, 20, 20, 0.95)", border: "1px solid #333", borderRadius: "8px", fontSize: "13px", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)" }}
            itemStyle={{ color: "#ffffff", padding: 0 }} labelStyle={{ color: "#a1a1aa", marginBottom: '0.5rem' }} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} formatter={() => null} 
            content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#141414] border border-[#333] p-3 rounded-lg shadow-xl text-xs">
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
          <Bar dataKey="displayedBase" stackId="a" isAnimationActive={false} shape={<BottomBarShape />}>
            {data.map((entry: any, index: number) => {
              const color = entry.totalPercentage < safeTarget ? "#ef4444" : "#10b981";
              return <Cell key={`cell-base-${index}`} fill={color} />;
            })}
          </Bar>
          <Bar dataKey="displayedExtra" stackId="a" isAnimationActive={false} shape={<HatchedBarShape />}>
              {data.map((entry: any, index: number) => {
               let fillUrl, strokeColor;
               if (entry.isLoss) {
                 fillUrl = "url(#striped-red)";
                 strokeColor = "#ef4444";
               } else {
                 const isSafe = entry.totalPercentage >= safeTarget;
                 fillUrl = isSafe ? "url(#striped-green)" : "url(#striped-red)";
                 strokeColor = isSafe ? "#10b981" : "#ef4444";
               }
               return <Cell key={`cell-ext-${index}`} fill={fillUrl} stroke={strokeColor} />;
              })}
          </Bar>
          <ReferenceLine y={safeTarget} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={2} strokeOpacity={1} label={<CustomTargetLabel value={safeTarget} />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
