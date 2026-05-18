import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrackAttendance, UserProfile } from "@/types";
import { useFetchAcademicYear, useFetchSemester } from "../users/settings";
import * as Sentry from "@sentry/nextjs";
import { redact } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * React Query hook for fetching user's attendance tracking data.
 * Automatically filters by current semester and academic year.
 * 
 * @param user - User object or user identifier
 * @param options - Optional configuration object
 * @param options.enabled - Whether the query should run (default: true)
 * @param options.semester - Optional term override from the dashboard selection
 * @param options.year - Optional academic year override from the dashboard selection
 * @returns Query result containing tracking attendance records
 * 
 * Query Configuration:
 * - Auto-refetch: Every 60 seconds
 * - Window focus refetch: Enabled
 * - Stale time: 30 seconds
 * - Cache time: 2 minutes
 * - Error handling: Logs to Sentry with redacted user info
 * 
 * @example
 * ```tsx
 * const { data: trackingData } = useTrackingData(user);
 * trackingData?.forEach(record => console.log(record.date));
 * ```
 */
export function useTrackingData(
  user: Pick<UserProfile, "id" | "username"> | null | undefined,
  options?: { enabled?: boolean; semester?: string; year?: string },
) {
  const supabase = createClient();
  
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();
  const resolvedSemester = options?.semester ?? semesterData;
  const resolvedAcademicYear = options?.year ?? academicYearData;

  return useQuery<TrackAttendance[]>({
    queryKey: [
      "track_data",
      user?.username ?? "",
      resolvedSemester ?? null,
      resolvedAcademicYear ?? null,
    ],
    
    queryFn: async () => {
      // getSession() reads the JWT from local storage — no network call.
      // The actual Supabase query below is RLS-protected, so an expired/invalid
      // JWT will be rejected by Postgres regardless.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];

      // Explicit null checks to prevent race conditions
      if (!resolvedSemester || !resolvedAcademicYear) {
        return [];
      }

      const { data, error } = await supabase
        .from("tracker")
        .select("*")
        .eq("semester", resolvedSemester)
        .eq("year", resolvedAcademicYear)
        .order("date", { ascending: false }) 
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching tracking data:", error);
        
        Sentry.captureException(error, {
            tags: { type: "tracking_fetch_error" },
            extra: { 
                userId: redact("id", String(user?.id ?? "unknown")),
                semester: resolvedSemester,
                year: resolvedAcademicYear,
            }
        });
        
        return [];
      }

      return (data as TrackAttendance[]) || [];
    },
    enabled: !!user && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
  });
}
