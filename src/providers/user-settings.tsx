"use client";

/**
 * User Settings Provider
 *
 * Manages user-specific configuration (bunk calculator toggle, target percentage,
 * and disabled courses per semester) with persistence in Supabase.
 *
 * Features:
 * - Real-time synchronization between Supabase and application state.
 * - Local storage fallback for "snappy" initial load (Stage 2 hydration).
 * - Automatic migration of legacy (pre-auth) settings to user-scoped records.
 * - Integration with Sentry for error tracking.
 * - Standardized "Ezygo is down" circuit breaker logic for database failures.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { disabledCoursesSchema } from "@/lib/validation/text";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export const DEFAULT_TARGET_PERCENTAGE = 75;

export interface UserSettings {
  bunk_calculator_enabled: boolean;
  target_percentage: number;
  disabled_courses: Record<string, Record<string, string>>; // semesterId -> courseId -> reason
}

interface UserSettingsContextType {
  settings: UserSettings | null;
  isLoading: boolean;
  updateBunkCalc: (enabled: boolean) => void;
  updateTarget: (percentage: number) => void;
  updateDisabledCourses: (map: Record<string, Record<string, string>>) => void;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a target percentage to be between 1 and 100.
 */
const normalizeTarget = (val: number): number =>
  Math.min(Math.max(val, 1), 100);

/**
 * Stage 2 Hydration / Migration Helper.
 *
 * Logic flow:
 * 1. Checks sessionStorage for "prefetchedSettings" (Stage 1).
 * 2. If missing, checks localStorage for individual user-scoped keys (Stage 2).
 * 3. Validates the data shape and returns a clean UserSettings object or null.
 */
const parsePrefetchedSession = (currentUserId: string): UserSettings | null => {
  const prefetchedRaw = sessionStorage.getItem("prefetchedSettings");
  if (!prefetchedRaw) return null;

  try {
    const parsed = JSON.parse(prefetchedRaw);
    if (
      parsed && typeof parsed === "object" && parsed.userId === currentUserId &&
      parsed.settings
    ) {
      const s = parsed.settings;
      if (
        typeof s.bunk_calculator_enabled === "boolean" &&
        typeof s.target_percentage === "number" &&
        s.disabled_courses
      ) {
        const disabledCourses = disabledCoursesSchema.safeParse(
          s.disabled_courses,
        );
        return {
          ...s,
          disabled_courses: disabledCourses.success ? disabledCourses.data : {},
        } as UserSettings;
      }
    }
  } catch {
    // ignore parse errors
  }
  sessionStorage.removeItem("prefetchedSettings");
  return null;
};

/**
 * Stage 2 Hydration / Migration Helper.
 */
const loadPrefetchedSettings = (
  currentUserId: string | null,
): UserSettings | null => {
  if (typeof window === "undefined" || !currentUserId) return null;

  try {
    const fromSession = parsePrefetchedSession(currentUserId);
    if (fromSession) return fromSession;

    const storedBunk = localStorage.getItem(`showBunkCalc_${currentUserId}`);
    const storedTarget = localStorage.getItem(
      `targetPercentage_${currentUserId}`,
    );
    const storedDisabled = localStorage.getItem(
      `disabledCourses_${currentUserId}`,
    );

    if (storedBunk === null && storedTarget === null) return null;

    return {
      bunk_calculator_enabled: storedBunk === "true",
      target_percentage: storedTarget
        ? parseInt(storedTarget, 10)
        : DEFAULT_TARGET_PERCENTAGE,
      disabled_courses: (() => {
        if (!storedDisabled || typeof storedDisabled !== "string") return {};

        const disabledCourses = disabledCoursesSchema.safeParse(
          JSON.parse(storedDisabled),
        );
        return disabledCourses.success ? disabledCourses.data : {};
      })(),
    };
  } catch (err) {
    logger.error("Failed to load prefetched settings:", err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Provider Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook managing the internal state and Supabase synchronization.
 */
function useUserSettingsState() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Use a ref to track the user ID synchronously during events to avoid
  // closure staleness before the next render cycle.
  const currentUserIdRef = useRef<string | null>(null);

  // Subscribe to auth state changes to re-fetch settings on login/logout
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const currentUserId = session?.user?.id ?? null;
        const previousUserId = currentUserIdRef.current;
        currentUserIdRef.current = currentUserId;

        if (
          event === "SIGNED_IN" || event === "INITIAL_SESSION" ||
          event === "TOKEN_REFRESHED" || event === "USER_UPDATED" ||
          event === "PASSWORD_RECOVERY"
        ) {
          setUserId(currentUserId);
          if (currentUserId) {
            // Force a fresh fetch for the new user
            queryClient.invalidateQueries({
              queryKey: ["userSettings", currentUserId],
            });
          }
          // Always remove the null-user cache to ensure clean state
          queryClient.removeQueries({ queryKey: ["userSettings", null] });
        } else if (event === "SIGNED_OUT") {
          // Clear local storage keys for the user who just logged out
          if (previousUserId) {
            localStorage.removeItem(`showBunkCalc_${previousUserId}`);
            localStorage.removeItem(`targetPercentage_${previousUserId}`);
            localStorage.removeItem(`disabledCourses_${previousUserId}`);
          }
          setUserId(null);
          queryClient.removeQueries({ queryKey: ["userSettings"] });
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, queryClient]); // Removed userId from dependencies

  // Determine the placeholder data for the query (Stage 2 hydration)
  const prefetchedSettings = useMemo(
    () => {
      if (!userId) {
        return null;
      }
      return loadPrefetchedSettings(userId);
    },
    [userId],
  );

  // Supabase Query
  const { data: dbSettings, isLoading, isFetching } = useQuery({
    queryKey: ["userSettings", userId],
    queryFn: async () => {
      // Security check: only fetch if authenticated.
      // the userId was already server-validated when onAuthStateChange fired.
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_settings")
        .select("bunk_calculator_enabled, target_percentage, disabled_courses")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        Sentry.captureException(error);
        throw error;
      }
      return data as UserSettings | null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: (failureCount: number, error: unknown) => {
      // Type guard for Supabase/PostgREST errors
      if (
        error && typeof error === "object" && "code" in error &&
        error.code === "PGRST116"
      ) {
        return false; // Not found (no record yet)
      }
      return failureCount < 3;
    },
    placeholderData: userId ? prefetchedSettings ?? undefined : undefined,
  });

  // Supabase Mutation
  const mutation = useMutation({
    mutationFn: async (updates: Partial<UserSettings>) => {
      if (!userId) return;

      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: userId,
          ...updates,
          ...(updates.disabled_courses
            ? {
              disabled_courses: disabledCoursesSchema.parse(
                updates.disabled_courses,
              ),
            }
            : {}),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        Sentry.captureException(error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        ["userSettings", userId],
        (old: UserSettings | null) => ({
          ...old,
          ...variables,
        }),
      );
    },
    onError: (err) => {
      toast.error("Failed to save settings. Changes might not persist.");
      logger.error("Settings mutation failed:", err);
    },
  });

  // ---------------------------------------------------------------------------
  // Effects: Sync DB -> LocalStorage & Initialization
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (
      !userId || isLoading || mutation.isPending || dbSettings === undefined
    ) return;

    try {
      // 1. If DB has no record for this user, create one using local preferences (migration)
      //    or defaults (new user).
      if (dbSettings === null) {
        const legacyBunk = localStorage.getItem("showBunkCalc");
        const legacyTarget = localStorage.getItem("targetPercentage");

        const initialBunk = legacyBunk !== null
          ? legacyBunk === "true"
          : (prefetchedSettings?.bunk_calculator_enabled ?? true);
        const initialTarget = legacyTarget !== null
          ? normalizeTarget(parseInt(legacyTarget, 10))
          : (prefetchedSettings?.target_percentage ??
            DEFAULT_TARGET_PERCENTAGE);
        const initialDisabled = prefetchedSettings?.disabled_courses ?? {};

        mutation.mutate({
          bunk_calculator_enabled: initialBunk,
          target_percentage: initialTarget,
          disabled_courses: initialDisabled,
        });

        // Cleanup legacy keys if they existed
        if (legacyBunk !== null) localStorage.removeItem("showBunkCalc");
        if (legacyTarget !== null) localStorage.removeItem("targetPercentage");

        return;
      }

      // 2. Clear Stage 1 hydration flag since we've now reconciled with the DB.
      //    This ensures subsequent loads use Stage 2 (individual keys) which are
      //    more likely to be fresh.
      sessionStorage.removeItem("prefetchedSettings");

      // 3. Sync DB settings to user-scoped localStorage keys.
      //    This powers Stage 2 hydration on the next app load.
      const sync = (key: string, val: string) => {
        if (localStorage.getItem(key) !== val) {
          localStorage.setItem(key, val);
          // Dispatch a custom event for parts of the app that don't use this context
          if (key.startsWith("showBunkCalc_")) {
            window.dispatchEvent(
              new CustomEvent("bunkCalcToggle", { detail: val === "true" }),
            );
          }
        }
      };

      sync(
        `showBunkCalc_${userId}`,
        String(dbSettings.bunk_calculator_enabled),
      );
      sync(`targetPercentage_${userId}`, String(dbSettings.target_percentage));
      sync(
        `disabledCourses_${userId}`,
        JSON.stringify(dbSettings.disabled_courses),
      );
    } catch (err) {
      // Non-fatal error; just log to dev console
      logger.dev("Error during storage sync:", err);
    }
  }, [dbSettings, userId, isLoading, mutation, prefetchedSettings]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const updateBunkCalc = (enabled: boolean) =>
    mutation.mutate({ bunk_calculator_enabled: enabled });
  const updateTarget = (percentage: number) =>
    mutation.mutate({ target_percentage: normalizeTarget(percentage) });
  const updateDisabledCourses = (map: Record<string, Record<string, string>>) =>
    mutation.mutate({ disabled_courses: map });

  return {
    settings: dbSettings ?? null,
    isLoading: isLoading || isFetching,
    updateBunkCalc,
    updateTarget,
    updateDisabledCourses,
  };
}

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

export function UserSettingsProvider(
  { children }: { children: React.ReactNode },
) {
  const state = useUserSettingsState();

  return (
    <UserSettingsContext.Provider value={state}>
      {children}
    </UserSettingsContext.Provider>
  );
}

/**
 * Access user settings context.
 * Throws if used outside a UserSettingsProvider.
 */
export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useUserSettings must be used inside <UserSettingsProvider>",
    );
  }
  return context;
}
