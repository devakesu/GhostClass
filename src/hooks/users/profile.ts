"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserProfile } from "@/types";
import * as Sentry from "@sentry/nextjs";
import { getCsrfToken } from "@/lib/axios";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";

interface UpdateProfileData {
  first_name: string;
  last_name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
}

export const useProfile = (options?: { initialData?: UserProfile }) => {
  return useQuery<UserProfile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(
          json.error ?? "Failed to load profile data from remote source."
        );
      }
      return res.json() as Promise<UserProfile>;
    },
    initialData: options?.initialData,
    // Cache for 5 mins to avoid spamming the sync logic
    staleTime: 1000 * 60 * 5,
    gcTime: 30 * 60 * 1000,
    retry: 1, // Only retry once if Ezygo fails
  });
};

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data }: { data: UpdateProfileData }) => {
      const csrfToken = getCsrfToken();
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to update profile");
      }
      return res.json() as Promise<UpdateProfileData>;
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