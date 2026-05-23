"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import { UserProfile } from "@/types";
import * as Sentry from "@sentry/nextjs";
import { retryOnce } from "@/lib/query-utils";

interface UpdateProfileData {
  first_name: string;
  last_name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
}

export const useProfile = (options?: { initialData?: UserProfile; sync?: boolean; force?: boolean }) => {
  return useQuery<UserProfile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const params: Record<string, string> = {};
      params.sync = "true";
      params.force = "true";

      const res = await axiosInstance.get<UserProfile>("/api/profile", {
        params: Object.keys(params).length > 0 ? params : undefined,
        baseURL: "", // Override baseURL to hit top-level /api/profile
      });
      return res.data;
    },
    initialData: options?.initialData,
    // Cache for 5 mins to avoid spamming the sync logic
    staleTime: 1000 * 60 * 5,
    gcTime: 30 * 60 * 1000,
    // Never retry 4xx errors (rate limit, auth, bad request) — retrying a 429
    // would waste a rate-limit slot. Retries once for 5xx / network errors.
    retry: retryOnce,
  });
};

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data }: { data: UpdateProfileData }) => {
      const res = await axiosInstance.patch<UpdateProfileData>("/api/profile", data, {
        baseURL: "", // Override baseURL to hit top-level /api/profile
      });
      return res.data;
    },
    // Optimistic Update: Update UI instantly
    // 1. SNAPSHOT & OPTIMISTIC UPDATE
    onMutate: async ({ data }) => {
        // Stop any background refetches so they don't overwrite our optimistic update
        await queryClient.cancelQueries({ queryKey: ["profile"] });
        
        // SNAPSHOT: Get the current valid data before we mess with it
        const previousProfile = queryClient.getQueryData<UserProfile>(["profile"]);

        // UPDATE: Manually write the new data to the cache immediately
        if (previousProfile) {
            queryClient.setQueryData<UserProfile>(["profile"], {
                ...previousProfile, // Keep existing fields (id, email, etc.)
                ...data,            // Overwrite with new edits (first_name, etc.)
            });
        }

        // Return the snapshot so 'onError' can access it
        return { previousProfile };
    },

    // 2. ROLLBACK ON FAILURE
    onError: (err, _variables, context) => {
      // Check if we have a saved snapshot
      if (context?.previousProfile) {
          // REVERT: Force the cache back to the old data
          queryClient.setQueryData(["profile"], context.previousProfile);
      }
      // Report the crash
      Sentry.captureException(err, { tags: { type: "profile_update_mutation_error", location: "useUpdateProfile/onError" } });
    },

    // 3. FINAL VERIFICATION
    onSettled: () => {
      // Always refetch from server at the end to ensure 100% consistency
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}