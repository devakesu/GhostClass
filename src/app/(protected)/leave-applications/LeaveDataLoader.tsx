import LeaveClient from "./LeaveClient";
import { fetchLeaveData } from "@/lib/ezygo-leave-fetcher";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export async function LeaveDataLoader({ token }: { token: string }) {
  let initialData = null;
  try {
    logger.dev("[LeaveApp] Fetching initial leave data server-side", {
      context: "leave-page",
    });

    initialData = await fetchLeaveData(token);

    logger.dev("[LeaveApp] Initial leave data fetched successfully", {
      context: "leave-page",
    });
  } catch (error) {
    logger.error("[LeaveApp] Failed to fetch initial leave data", {
      context: "leave-page",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { type: "leave_data_fetch_failure", location: "leave-applications/LeaveDataLoader" },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <LeaveClient initialData={initialData as any} />;
}
