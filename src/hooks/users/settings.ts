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
      const cachedProfile =
        queryClient.getQueryData<UserProfile>(["profile"]) ||
        queryClient.getQueryData<UserProfile>(["profile", "synced"]);
      return extractAcademicField<T>(cachedProfile, field);
    }
    throw error;
  }

  const cachedProfile =
    queryClient.getQueryData<UserProfile>(["profile"]) ||
    queryClient.getQueryData<UserProfile>(["profile", "synced"]);
  return extractAcademicField<T>(cachedProfile, field);
}

export function extractSemesterValue(raw: unknown): "even" | "odd" | null {
  if (!raw) return null;
  let val: unknown = raw;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    val =
      obj.default_semester ??
      obj.current_semester ??
      obj.semester ??
      obj.data ??
      obj.value;
    if (typeof val === "object" && val !== null) {
      const inner = val as Record<string, unknown>;
      val = inner.default_semester ?? inner.current_semester ?? inner.semester;
    }
  }
  if (!val) return null;
  const s = String(val).trim().toLowerCase();
  if (s.includes("odd") || s === "1") return "odd";
  if (s.includes("even") || s === "2") return "even";
  return null;
}

export function extractAcademicYearValue(raw: unknown): string | null {
  if (!raw) return null;
  let val: unknown = raw;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    val =
      obj.default_academic_year ??
      obj.current_year ??
      obj.academic_year ??
      obj.year ??
      obj.data ??
      obj.value;
    if (typeof val === "object" && val !== null) {
      const inner = val as Record<string, unknown>;
      val =
        inner.default_academic_year ??
        inner.current_year ??
        inner.academic_year ??
        inner.year;
    }
  }
  if (!val) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

export const useFetchSemester = () => {
  const queryClient = useQueryClient();

  return useQuery<"even" | "odd" | null>({
    queryKey: ["semester"],
    queryFn: async () => {
      return fetchSettingWithFallback(queryClient, "sem", async () => {
        const res = await axios.get("/user/setting/default_semester", {
          params: { _t: Date.now() },
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        return extractSemesterValue(res.data);
      });
    },
    retry: settingsRetryFn,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};

export const useFetchAcademicYear = () => {
  const queryClient = useQueryClient();

  return useQuery<string | null>({
    queryKey: ["academic-year"],
    queryFn: async () => {
      return fetchSettingWithFallback(queryClient, "year", async () => {
        const res = await axios.get("/user/setting/default_academic_year", {
          params: { _t: Date.now() },
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        return extractAcademicYearValue(res.data);
      });
    },
    retry: settingsRetryFn,
    staleTime: 0,
    refetchOnMount: "always",
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

export const useSetAcademicYear = (options?: {
  skipInvalidations?: boolean;
}) => {
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
