// Manage user institutions and default institution settings
// src/hooks/users/institutions.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import { Institution } from "@/types";
import { retryOnce } from "@/lib/query-utils";

/**
 * React Query hook for fetching user's enrolled institutions.
 * Automatically filters to show only institutions where user has student role.
 * 
 * @returns Query result containing array of student institutions
 * 
 * Query Configuration:
 * - Stale time: 5 minutes
 * - Retry: Disabled
 * - Cache key: ["institutions"]
 * 
 * @throws {Error} If no student institutions found
 * 
 * @example
 * ```tsx
 * const { data: institutions } = useInstitutions();
 * institutions?.forEach(inst => console.log(inst.name));
 * ```
 */
export function useInstitutions() {
  return useQuery<Institution[]>({
    queryKey: ["institutions"],
    queryFn: async () => {
      const res = await axiosInstance.get("/institutionusers/myinstitutions");
      if (!res) throw new Error("Failed to fetch institutions");

      const studentInstitutions = res.data.filter(
        (institution: Institution) =>
          institution.institution_role.name === "student"
      );

      if (studentInstitutions.length === 0) {
        throw new Error("No student institutions found");
      }

      return studentInstitutions;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

/**
 * React Query hook for fetching user's default institution ID.
 * 
 * @returns Query result containing default institution ID
 * 
 * @example
 * ```tsx
 * const { data: defaultId } = useDefaultInstitute();
 * ```
 */
export function useDefaultInstitute() {
  return useQuery<number>({
    queryKey: ["defaultInstitute"],
    queryFn: async () => {
      const res = await axiosInstance.get("/user/setting/default_institute");
      if (!res) throw new Error("Failed to fetch default institute");

      return res.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: retryOnce,
  });
}

export function useDefaultInstitutionUser() {
  const { data: institutions } = useInstitutions();
  const updateDefaultInstitutionUser = useUpdateDefaultInstitutionUser();

  return useQuery<number>({
    queryKey: ["defaultInstitutionUser"],
    queryFn: async () => {
      const res = await axiosInstance.get(
        "/user/setting/default_institutionUser"
      );
      if (!res) throw new Error("Failed to fetch default institution user");

      const defaultInstitutionUser = res.data;

      if (defaultInstitutionUser && institutions) {
        const currentDefault = institutions.find(
          (inst) => inst?.id === defaultInstitutionUser
        );

        if (
          (!currentDefault ||
            currentDefault?.institution_role?.name !== "student") &&
          institutions.length > 0
        ) {
          const studentInstitution = institutions.find(inst => inst?.institution_role?.name === "student");
          if (studentInstitution) {
            await updateDefaultInstitutionUser.mutateAsync(
              studentInstitution.id
            );
            return studentInstitution.id;
          }
        }
      }

      return defaultInstitutionUser;
    },
    enabled: !!institutions,
    staleTime: 1000 * 60 * 5,
    retry: retryOnce,
  });
}

export function useUpdateDefaultInstitutionUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (institutionUserId: number) => {
      const res = await axiosInstance.post(
        "/user/setting/default_institutionUser",
        {
          default_institutionUser: institutionUserId,
        }
      );
      if (!res) throw new Error("Failed to update default institution user");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["defaultInstitutionUser"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}
