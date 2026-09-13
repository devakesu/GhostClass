// Manage user settings such as default semester and academic year
// src/hooks/users/settings.ts

import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { makeRetryFn } from "@/lib/query-utils";
import { UserProfile } from "@/types";

type SemesterData = {
  default_semester: "even" | "odd";
};

type AcademicYearData = {
  default_academic_year: string;
};

export type UserSettings = {
  semester: "even" | "odd" | null;
  academicYear: string | null;
};

// Shared retry logic for settings queries — skip all 4xx, retry twice for 5xx/network
const settingsRetryFn = makeRetryFn(2);

function extractAcademicField<T extends string>(
  profile: UserProfile | null | undefined,
  field: "sem" | "year",
): T | null {
  if (!profile) return null;
  if (field === "sem") {
    if (profile.current_semester) return profile.current_semester as T;
    const uClass = profile.class as { sem?: string } | null | undefined;
    if (uClass?.sem) return uClass.sem as T;
  }
  if (field === "year") {
    if (profile.current_year) return profile.current_year as T;
    const uClass = profile.class as { year?: string } | null | undefined;
    if (uClass?.year) return uClass.year as T;
  }
  return null;
}

async function fetchSettingWithFallback<T extends string>(
  queryClient: ReturnType<typeof useQueryClient>,
  field: "sem" | "year",
  apiCall: () => Promise<T | null>,
): Promise<T | null> {
  try {
    const result = await apiCall();
    if (result != null) return result;
  } catch (error: unknown) {
    if (isAxiosError(error) && error.response?.status === 404) {
      const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]) ||
        queryClient.getQueryData<UserProfile>(["profile", "synced"]);
      return extractAcademicField<T>(cachedProfile, field);
    }
    throw error;
  }

  const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]) ||
    queryClient.getQueryData<UserProfile>(["profile", "synced"]);
  return extractAcademicField<T>(cachedProfile, field);
}

async function resolveSettingFromProfileQuery<T extends string>(
  queryClient: ReturnType<typeof useQueryClient>,
  field: "sem" | "year",
  fallbackApiCall: () => Promise<T | null>,
): Promise<T | null> {
  const syncedState = queryClient.getQueryState(["profile", "synced"]);
  const normalState = queryClient.getQueryState(["profile"]);
  const isSyncedPending = syncedState && syncedState.status === "pending";
  const isNormalPending = normalState && normalState.status === "pending";

  if (isSyncedPending || isNormalPending) {
    const targetKey = isSyncedPending ? "synced" : "normal";
    return new Promise<T | null>((resolve) => {
      let isSettled = false;
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        const matchesKey = targetKey === "synced"
          ? (key[0] === "profile" && key[1] === "synced")
          : (key[0] === "profile" && key.length === 1);

        if (matchesKey) {
          if (event.query.state.status === "success") {
            unsubscribe();
            isSettled = true;
            const profile = event.query.state.data as UserProfile | null;
            const liveValue = field === "sem"
              ? (profile?.current_semester as T | null | undefined)
              : (profile?.current_year as T | null | undefined);
            if (liveValue) {
              resolve(liveValue);
            } else {
              fetchSettingWithFallback(queryClient, field, fallbackApiCall)
                .then(resolve)
                .catch(() => resolve(null));
            }
          } else if (event.query.state.status === "error") {
            unsubscribe();
            isSettled = true;
            fetchSettingWithFallback(queryClient, field, fallbackApiCall)
              .then(resolve)
              .catch(() => resolve(null));
          }
        }
      });
      // Safety timeout to prevent hanging if the profile sync fails/hangs
      setTimeout(() => {
        if (!isSettled) {
          unsubscribe();
          fetchSettingWithFallback(queryClient, field, fallbackApiCall)
            .then(resolve)
            .catch(() => resolve(null));
        }
      }, 30000);
    });
  }

  return fetchSettingWithFallback(queryClient, field, fallbackApiCall);
}

export const useFetchSemester = () => {
  const queryClient = useQueryClient();

  return useQuery<"even" | "odd" | null>({
    queryKey: ["semester"],
    queryFn: async () => {
      return resolveSettingFromProfileQuery(queryClient, "sem", async () => {
        const res = await axios.get("/user/setting/default_semester");
        return res.data;
      });
    },
    retry: settingsRetryFn,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });
};

export const useFetchAcademicYear = () => {
  const queryClient = useQueryClient();

  return useQuery<string | null>({
    queryKey: ["academic-year"],
    queryFn: async () => {
      return resolveSettingFromProfileQuery(queryClient, "year", async () => {
        const res = await axios.get("/user/setting/default_academic_year");
        return res.data;
      });
    },
    retry: settingsRetryFn,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });
};

export const useSetSemester = (options?: { skipInvalidations?: boolean }) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (semesterData: SemesterData) => {
      const res = await axios.post(
        "/user/setting/default_semester",
        semesterData,
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      // 1. Update the Setting Cache immediately
      queryClient.setQueryData(["semester"], variables.default_semester);

      if (options?.skipInvalidations) return;

      // 2. Refresh ALL Dependent Data
      // This ensures courses, attendance, tracking, and scores all switch to the new semester
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
      queryClient.invalidateQueries({ queryKey: ["class_courses"] });
      queryClient.invalidateQueries({ queryKey: ["course_instructors"] });
      queryClient.invalidateQueries({ queryKey: ["track_data"] }); // Refetch tracking data
      queryClient.invalidateQueries({ queryKey: ["count"] }); // Refetch stats
      queryClient.invalidateQueries({ queryKey: ["profile"] }); // Refetch profile (syncs class)
      queryClient.invalidateQueries({ queryKey: ["exams"] }); // Refetch scores page
      queryClient.invalidateQueries({ queryKey: ["exam-answers"] }); // Clear per-exam answer cache
      queryClient.invalidateQueries({ queryKey: ["exam-questions"] }); // Clear per-exam question cache
      queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] }); // Clear batch scores cache
    },
    onError: (error) => {
      logger.error("Error setting semester:", error);
      Sentry.captureException(error, {
        tags: {
          type: "setting_update_error",
          location: "useSetSemester/onError",
        },
      });
    },
  });
};

export const useSetAcademicYear = (
  options?: { skipInvalidations?: boolean },
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (academicYearData: AcademicYearData) => {
      const res = await axios.post(
        "/user/setting/default_academic_year",
        academicYearData,
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(
        ["academic-year"],
        variables.default_academic_year,
      );

      if (options?.skipInvalidations) return;

      // Refresh ALL Dependent Data
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
      queryClient.invalidateQueries({ queryKey: ["class_courses"] });
      queryClient.invalidateQueries({ queryKey: ["course_instructors"] });
      queryClient.invalidateQueries({ queryKey: ["track_data"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["exams"] }); // Refetch scores page
      queryClient.invalidateQueries({ queryKey: ["exam-answers"] }); // Clear per-exam answer cache
      queryClient.invalidateQueries({ queryKey: ["exam-questions"] }); // Clear per-exam question cache
      queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] }); // Clear batch scores cache
    },
    onError: (error) => {
      logger.error("Error setting academic year:", error);
      Sentry.captureException(error, {
        tags: {
          type: "setting_update_error",
          location: "useSetAcademicYear/onError",
        },
      });
    },
  });
};

export const useFetchUserSettings = () => {
  const semesterQuery = useFetchSemester();
  const academicYearQuery = useFetchAcademicYear();

  return {
    data: {
      semester: semesterQuery.data ?? null,
      academicYear: academicYearQuery.data ?? null,
    } as UserSettings,
    isLoading: semesterQuery.isLoading || academicYearQuery.isLoading,
    isFetching: semesterQuery.isFetching || academicYearQuery.isFetching,
    isError: semesterQuery.isError || academicYearQuery.isError,
    error: semesterQuery.error ?? academicYearQuery.error,
    refetch: async () => {
      await Promise.all([semesterQuery.refetch(), academicYearQuery.refetch()]);
    },
  };
};
