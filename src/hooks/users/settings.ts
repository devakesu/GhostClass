// Manage user settings such as default semester and academic year
// src/hooks/users/settings.ts

import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

function extractClassField<T extends string>(
  uClass: { sem?: string; year?: string } | null | undefined,
  field: "sem" | "year"
): T | null {
  if (!uClass) return null;
  if (field === "sem" && uClass.sem) return uClass.sem as T;
  if (field === "year" && uClass.year) return uClass.year as T;
  return null;
}

async function resolveSettingFromProfileQuery<T extends string>(
  queryClient: ReturnType<typeof useQueryClient>,
  field: "sem" | "year",
  fallbackApiCall: () => Promise<T | null>
): Promise<T | null> {
  const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]) || queryClient.getQueryData<UserProfile>(["profile", "synced"]);
  const userClass = cachedProfile?.class as { sem?: string; year?: string } | null | undefined;
  const cachedValue = extractClassField<T>(userClass, field);
  if (cachedValue) {
    return cachedValue;
  }

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
            const uClass = profile?.class as { sem?: string; year?: string } | null | undefined;
            const value = extractClassField<T>(uClass, field);
            if (value) {
              resolve(value);
            } else {
              fallbackApiCall().then(resolve).catch(() => resolve(null));
            }
          } else if (event.query.state.status === "error") {
            unsubscribe();
            isSettled = true;
            fallbackApiCall().then(resolve).catch(() => resolve(null));
          }
        }
      });
      // Safety timeout to prevent hanging if the profile sync fails/hangs
      setTimeout(() => {
        if (!isSettled) {
          unsubscribe();
          fallbackApiCall().then(resolve).catch(() => resolve(null));
        }
      }, 30000);
    });
  }

  return fallbackApiCall();
}

export const useFetchSemester = () => {
  const queryClient = useQueryClient();

  return useQuery<"even" | "odd" | null>({
    queryKey: ["semester"],
    queryFn: async () => {
      return resolveSettingFromProfileQuery(queryClient, "sem", async () => {
        try {
          const res = await axios.get("/user/setting/default_semester");
          return res.data;
        } catch (error: unknown) {
          if (isAxiosError(error) && error.response?.status === 404) return null;
          throw error;
        }
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
        try {
          const res = await axios.get("/user/setting/default_academic_year");
          return res.data;
        } catch (error: unknown) {
          if (isAxiosError(error) && error.response?.status === 404) return null;
          throw error;
        }
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
        semesterData
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
      queryClient.invalidateQueries({ queryKey: ["count"] });      // Refetch stats
      queryClient.invalidateQueries({ queryKey: ["profile"] });    // Refetch profile (syncs class)
      queryClient.invalidateQueries({ queryKey: ["exams"] });       // Refetch scores page
      queryClient.invalidateQueries({ queryKey: ["exam-answers"] }); // Clear per-exam answer cache
      queryClient.invalidateQueries({ queryKey: ["exam-questions"] }); // Clear per-exam question cache
      queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] }); // Clear batch scores cache
    },
    onError: (error) => {
      logger.error("Error setting semester:", error);
      Sentry.captureException(error, { tags: { type: "setting_update_error", location: "useSetSemester/onError" } });
    },
  });
};

export const useSetAcademicYear = (options?: { skipInvalidations?: boolean }) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (academicYearData: AcademicYearData) => {
      const res = await axios.post(
        "/user/setting/default_academic_year",
        academicYearData
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(
        ["academic-year"],
        variables.default_academic_year
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
      queryClient.invalidateQueries({ queryKey: ["exams"] });       // Refetch scores page
      queryClient.invalidateQueries({ queryKey: ["exam-answers"] }); // Clear per-exam answer cache
      queryClient.invalidateQueries({ queryKey: ["exam-questions"] }); // Clear per-exam question cache
      queryClient.invalidateQueries({ queryKey: ["exam-details-batch"] }); // Clear batch scores cache
    },
    onError: (error) => {
      logger.error("Error setting academic year:", error);
      Sentry.captureException(error, { tags: { type: "setting_update_error", location: "useSetAcademicYear/onError" } });
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