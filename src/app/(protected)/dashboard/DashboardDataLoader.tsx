import DashboardClient from "./DashboardClient";
import { fetchDashboardData } from "@/lib/ezygo-batch-fetcher";
import { logger } from "@/lib/logger";

/**
 * Separate async component so the page shell (navbar, layout) can be sent to the
 * browser immediately after the fast auth check, while this component streams in
 * once fetchDashboardData resolves. This converts a blocking ~770 ms TTFB into
 * perceived-instant page load with a streaming fallback spinner.
 */
export async function DashboardDataLoader({ token, userId }: { token: string; userId: string }) {
  let initialData = null;
  try {
    logger.dev('[Dashboard] Fetching initial data server-side', {
      context: 'dashboard-page',
      userId,
    });

    initialData = await fetchDashboardData(token);

    logger.dev('[Dashboard] Initial data fetched successfully', {
      context: 'dashboard-page',
      hasCourses: !!initialData.courses,
      hasAttendance: !!initialData.attendance,
    });
  } catch (error) {
    // Graceful degradation – client will refetch on mount
    logger.error('[Dashboard] Failed to fetch initial data', {
      context: 'dashboard-page',
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
  }

  return <DashboardClient initialData={initialData} />;
}
