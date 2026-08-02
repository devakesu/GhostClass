import DashboardClient from "./DashboardClient";
import { fetchDashboardData } from "@/lib/ezygo-batch-fetcher";
import { logger } from "@/lib/logger";
import { getProfileBundle } from "@/lib/user/profile-bundle";

/**
 * Separate async component so the page shell (navbar, layout) can be sent to the
 * browser immediately after the fast auth check, while this component streams in
 * once fetchDashboardData resolves. This converts a blocking ~770 ms TTFB into
 * perceived-instant page load with a streaming fallback spinner.
 */
export async function DashboardDataLoader(
  { token, userId }: { token: string; userId: string },
) {
  let initialData = null;
  let initialProfile = null;
  try {
    logger.dev("[Dashboard] Fetching initial data server-side", {
      context: "dashboard-page",
      userId,
    });

    const [data, profile] = await Promise.all([
      fetchDashboardData(token),
      getProfileBundle(userId),
    ]);
    initialData = data;
    initialProfile = profile;

    logger.dev("[Dashboard] Initial data fetched successfully", {
      context: "dashboard-page",
      hasCourses: !!initialData.courses,
      hasAttendance: !!initialData.attendance,
      hasProfile: !!initialProfile,
    });
  } catch (error: unknown) {
    // Graceful degradation – client will refetch on mount
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[Dashboard] Failed to fetch initial data", {
      context: "dashboard-page",
      error: errorMsg,
      userId,
    });
    return (
      <DashboardClient
        initialData={null}
        initialProfile={null}
        serverError={errorMsg}
      />
    );
  }

  return (
    <DashboardClient
      initialData={initialData}
      initialProfile={initialProfile}
      serverError={null}
    />
  );
}
