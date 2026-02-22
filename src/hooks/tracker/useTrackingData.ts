import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrackAttendance, User } from "@/types";
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
export function useTrackingData(user: User | null | undefined, options?: { enabled?: boolean }) {
  const supabase = createClient();
  
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();

  return useQuery<TrackAttendance[]>({
    queryKey: [
      "track_data",
      user?.username ?? "",
      semesterData,
      academicYearData,
    ],
    
    queryFn: async () => {
      // getSession() reads the JWT from local storage — no network call.
      // The actual Supabase query below is RLS-protected, so an expired/invalid
      // JWT will be rejected by Postgres regardless.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];

      // Explicit null checks to prevent race conditions
      if (!semesterData || !academicYearData) {
        return [];
      }

      const { data, error } = await supabase
        .from("tracker")
        .select("*")
        .eq("semester", semesterData) 
        .eq("year", academicYearData)
        .order("date", { ascending: false }) 
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching tracking data:", error);
        
        Sentry.captureException(error, {
            tags: { type: "tracking_fetch_error" },
            extra: { 
                userId: redact("id", String(user?.id ?? "unknown")),
                semester: semesterData,
                year: academicYearData
            }
        });
        
        return [];
      }

      return (data as TrackAttendance[]) || [];
    },
    enabled: !!user && (options?.enabled !== false),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000, 
  });
}