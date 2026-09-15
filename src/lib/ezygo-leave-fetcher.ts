import "server-only";
import { fetchEzygoData } from "./ezygo-batch-fetcher";
import { NonBreakerError } from "./circuit-breaker";
import { logger } from "./logger";

function handleLeaveFetchError(endpointName: string, e: unknown): never {
  logger.error(`[EzyGo] Failed to fetch ${endpointName}`, {
    error: String(e),
  });
  if (e instanceof NonBreakerError) {
    throw e;
  }
  throw new Error(
    `Failed to fetch ${endpointName === "studentleaves" ? "leave data" : endpointName}: ${
      e instanceof Error ? e.message : String(e)
    }`,
  );
}

export async function fetchLeaveData(token: string) {
  // Fail-fast on any EzyGo failure — do not return partial data
  // 1. Fetch student-specific dynamic data in parallel
  const [studentLeaves, sessions, events] = await Promise.all([
    fetchEzygoData<unknown>("/studentleaves", token).catch((e) =>
      handleLeaveFetchError("studentleaves", e),
    ),
    fetchEzygoData<unknown>("/sessions", token).catch((e) =>
      handleLeaveFetchError("sessions", e),
    ),
    fetchEzygoData<unknown>("/events", token).catch((e) =>
      handleLeaveFetchError("events", e),
    ),
  ]);

  // 2. Fetch static institutional settings sequentially to avoid burst storms on cold cache
  const userSubgroups = await fetchEzygoData<unknown>(
    "/usersubgroups",
    token,
  ).catch((e) => handleLeaveFetchError("usersubgroups", e));

  const attendanceTypes = await fetchEzygoData<unknown>(
    "/attendancetypes",
    token,
  ).catch((e) => handleLeaveFetchError("attendancetypes", e));

  const mandatoryEventCoordinator = await fetchEzygoData<unknown>(
    "/institution/setting/mandatory_event_coordinator",
    token,
  ).catch((e) => handleLeaveFetchError("mandatory_event_coordinator", e));

  const leaveApprovalLevel = await fetchEzygoData<unknown>(
    "/institution/setting/student_leave_approval_level",
    token,
  ).catch((e) => handleLeaveFetchError("student_leave_approval_level", e));

  return {
    studentLeaves,
    userSubgroups,
    attendanceTypes,
    sessions,
    events,
    mandatoryEventCoordinator,
    leaveApprovalLevel,
  };
}

export async function fetchLeaveAttendanceDetails(
  token: string,
  startDate: string,
  uptoDate: string,
) {
  // Fail-fast: propagate errors instead of returning null
  // Partial/missing leave data can lead to incorrect leave calculations
  return await fetchEzygoData<unknown>(
    "/attendancereports/student/detailed",
    token,
    "POST",
    {
      start_date: startDate,
      upto_date: uptoDate,
      from_student_leave_application: true,
    },
  ).catch((e) => {
    logger.error("[EzyGo] Failed to fetch leave attendance details", {
      error: String(e),
      startDate,
      uptoDate,
    });
    if (e instanceof NonBreakerError) {
      throw e;
    }
    throw new Error(
      `Failed to fetch leave attendance details: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  });
}
