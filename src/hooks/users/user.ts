// Fetch user data using React Query
// src/hooks/users/user.ts

import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import { User } from "@/types";
import { handleLogout } from "@/lib/security/auth";

/**
 * React Query hook for fetching and caching authenticated user data.
 * Automatically logs out user on authentication failure.
 *
 * @returns Query result containing user data
 *
 * Query Configuration:
 * - Stale time: 5 minutes
 * - Retry: Disabled (auto-logout on failure)
 * - Cache key: ["user"]
 *
 * @example
 * ```tsx
 * const { data: user, isLoading } = useUser();
 * if (user) {
 *   console.log(user.username);
 * }
 * ```
 */
export const useUser = () => {
  return useQuery<User>({
    queryKey: ["user"],
    queryFn: async () => {
      const res = await axiosInstance.get("/user");
      if (!res) {
        handleLogout();
        return null;
      }
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
};
