"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState, useMemo, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { UserSettings, DisabledCoursesMap } from "@/types/user-settings";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// Default attendance target percentage used throughout the application
// This constant ensures consistency across different parts of the codebase
export const DEFAULT_TARGET_PERCENTAGE = 75;

// Shared error message for "no authenticated user" — used in mutationFn throw,
// retry logic, and onError handler to avoid fragile string duplication.
const NO_USER_ERROR_MESSAGE = "No user";

// Module-level constant — reads NEXT_PUBLIC_ATTENDANCE_TARGET_MIN once at startup.
// If that env var changes, consider a DB migration to enforce the new floor for existing rows.
const MIN_TARGET = (() => {
  const envValue = process.env.NEXT_PUBLIC_ATTENDANCE_TARGET_MIN;
  if (!envValue) return DEFAULT_TARGET_PERCENTAGE;
  const parsed = parseInt(envValue, 10);
  // Clamp to valid range, falling back to default if invalid
  return !isNaN(parsed) ? Math.min(100, Math.max(1, parsed)) : DEFAULT_TARGET_PERCENTAGE;
})();

const normalizeTarget = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TARGET_PERCENTAGE;
  return Math.min(100, Math.max(MIN_TARGET, Math.round(value)));
};

// Loads prefetched settings from sessionStorage/localStorage. Validates ownership when
// userId is known to prevent cross-user leakage; accepts legacy format when unauthenticated.
function loadPrefetchedSettings(currentUserId: string | null): UserSettings | null {
  if (typeof window === "undefined") return null;
  
  // Helper to clear invalid/stale prefetched settings
  const clearAndReturn = () => {
    try {
      sessionStorage.removeItem("prefetchedSettings");
    } catch {
      // Swallow storage errors to ensure we always return null
    }
    return null;
  };

  // Safely read disabled_courses from localStorage (user-scoped)
  const readLocalDisabledCourses = (userId: string): DisabledCoursesMap | null => {
    try {
      const json = localStorage.getItem(`disabledCourses_${userId}`);
      if (!json) return null;
      const parsed: unknown = JSON.parse(json);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as DisabledCoursesMap;
      }
    } catch {
      // Ignore parse / storage errors
    }
    return null;
  };
  
  try {
    const raw = sessionStorage.getItem("prefetchedSettings");
    if (!raw) {
      // sessionStorage cleared after first DB fetch — rebuild placeholder from localStorage.
      if (!currentUserId) return null;
      try {
        const bunkStr = localStorage.getItem(`showBunkCalc_${currentUserId}`);
        const targetStr = localStorage.getItem(`targetPercentage_${currentUserId}`);
        if (bunkStr === null || targetStr === null) return null;
        const bunk_calculator_enabled = bunkStr === "true";
        const target_num = normalizeTarget(Number(targetStr));
        if (isNaN(target_num)) return null;
        const disabled_courses = readLocalDisabledCourses(currentUserId) ?? {};
        return { bunk_calculator_enabled, target_percentage: target_num, disabled_courses };
      } catch {
        return null;
      }
    }
    
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return clearAndReturn();
    
    const parsedRecord = parsed as Record<string, unknown>;

    if (currentUserId) {
      // Reject legacy records (no userId) and mismatched users to prevent cross-user leakage.
      if (!('userId' in parsedRecord)) return clearAndReturn();
      if (typeof parsedRecord.userId !== "string" || parsedRecord.userId !== currentUserId) {
        return clearAndReturn();
      }
    }

    // Support both new format { userId, settings: {...} } and legacy flat format.
    let settingsData: Record<string, unknown>;
    
    if ('settings' in parsedRecord && parsedRecord.settings !== null && typeof parsedRecord.settings === "object") {
      settingsData = parsedRecord.settings as Record<string, unknown>;
    } else if ('bunk_calculator_enabled' in parsedRecord || 'target_percentage' in parsedRecord) {
      settingsData = parsedRecord;
    } else {
      return clearAndReturn();
    }

    const bunk_calculator_enabled =
      'bunk_calculator_enabled' in settingsData && typeof settingsData.bunk_calculator_enabled === "boolean"
        ? settingsData.bunk_calculator_enabled
        : undefined;
    const target_percentage =
      'target_percentage' in settingsData && typeof settingsData.target_percentage === "number"
        ? normalizeTarget(settingsData.target_percentage)
        : undefined;
    const disabled_courses =
      'disabled_courses' in settingsData && settingsData.disabled_courses !== null && typeof settingsData.disabled_courses === "object"
        ? (settingsData.disabled_courses as DisabledCoursesMap)
        : {};

    if (
      typeof bunk_calculator_enabled !== "boolean" ||
      typeof target_percentage !== "number"
    ) {
      return clearAndReturn();
    }

    return {
      bunk_calculator_enabled,
      target_percentage,
      // Fall back to localStorage for older logins that predate disabled_courses in prefetchedSettings.
      disabled_courses: Object.keys(disabled_courses).length > 0
        ? disabled_courses
        : (currentUserId ? (readLocalDisabledCourses(currentUserId) ?? {}) : {}),
    };
  } catch {
    // Clear invalid data that caused parse failure
    return clearAndReturn();
  }
}

export function useUserSettingsState() {
  // Stable client ref — stateless, safe to memoize.
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  
  // Scoped to userId to prevent cross-user flash; ref allows synchronous access in async callbacks.
  const [userId, setUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Derived on the same render userId becomes non-null, so placeholder data is ready immediately
  // and there's no "defaults" flash before the React Query hook activates.
  const prefetchedSettings = useMemo<UserSettings | null>(() => {
    if (!userId) return null;
    return loadPrefetchedSettings(userId);
  }, [userId]);
  
  const hasAttemptedInitializationRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    const initializeAndSubscribe = async () => {
      // Subscribe BEFORE reading the session so no events are missed during initialization.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMountedRef.current) return;
        
        const newUserId = session?.user?.id ?? null;
        
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
          
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            hasAttemptedInitializationRef.current = false;
          }
          // Invalidate only on SIGNED_IN — TOKEN_REFRESHED is Supabase's hourly session renewal
          // and settings are unchanged; INITIAL_SESSION is covered by `enabled: !!userId`.
          if (newUserId && event === "SIGNED_IN") {
            queryClient.invalidateQueries({ queryKey: ["userSettings", newUserId] });
          }
          queryClient.removeQueries({ queryKey: ["userSettings", null] });
        } else if (event === "SIGNED_OUT") {
          const previousUserId = currentUserIdRef.current;
          
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
          
          if (previousUserId) {
            queryClient.removeQueries({ queryKey: ["userSettings", previousUserId] });
          }
          hasAttemptedInitializationRef.current = false;
          
          try {
            if (typeof window !== "undefined") {
              if (previousUserId) {
                localStorage.removeItem(`showBunkCalc_${previousUserId}`);
                localStorage.removeItem(`targetPercentage_${previousUserId}`);
                localStorage.removeItem(`disabledCourses_${previousUserId}`);
              }
              sessionStorage.removeItem("prefetchedSettings");
            }
          } catch (error) {
            logger.dev("Failed to clear storage on sign out", { error });
          }
        } else {
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
        }
      });

      return subscription;
    };

    const subscriptionPromise = initializeAndSubscribe();
    
    return () => {
      isMountedRef.current = false;
      subscriptionPromise
        .then(subscription => subscription?.unsubscribe())
        .catch(error => {
          logger.dev("Failed to unsubscribe from auth state changes", { error });
        });
    };
  }, [queryClient, supabase.auth]);

  // 1. Fetch from DB
  const { data: settings, isLoading, isFetching } = useQuery({
    queryKey: ["userSettings", userId],
    // Only apply placeholder when userId is resolved to prevent cross-user leakage.
    placeholderData: userId ? prefetchedSettings ?? undefined : undefined,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_settings")
        .select("bunk_calculator_enabled, target_percentage, disabled_courses")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching settings:", error);
        Sentry.captureException(error, { tags: { type: "settings_fetch_error", location: "useUserSettings" } });
        // Throw so React Query sets isError (not isSuccess with null), preventing the
        // sync effect from mistaking a transient fetch failure for a "new user / no row"
        // and overwriting existing settings.
        throw error;
      }

      return data as UserSettings | null;
    },
    staleTime: 5 * 60 * 1000,  // 5 min — settings rarely change
    gcTime: 30 * 60 * 1000,     // 30 min — avoid cold-start refetches on re-mount
    refetchOnWindowFocus: false, // mutations keep cache fresh; focus refetch wastes quota
    refetchInterval: false,
    retry: (failureCount, error) => {
      // Don't retry "No user" — auth hasn't resolved yet; retrying would hammer Supabase.
      const isNoUserError = error instanceof Error && error.message === NO_USER_ERROR_MESSAGE;
      return failureCount < 3 && !isNoUserError;
    }
  });
  
  // 2. Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: { bunk_calculator_enabled?: boolean; target_percentage?: number; disabled_courses?: DisabledCoursesMap }) => {
      const mutationUserId = currentUserIdRef.current;
      if (!mutationUserId) throw new Error(NO_USER_ERROR_MESSAGE);

      const { data, error } = await supabase
        .from("user_settings")
        .upsert({ user_id: mutationUserId, ...newSettings })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    // Optimistic update: update cache before server responds
    onMutate: async (newSettings: { bunk_calculator_enabled?: boolean; target_percentage?: number; disabled_courses?: DisabledCoursesMap }): Promise<{ previousSettings: UserSettings | undefined; currentUserId: string | null }> => {
      const currentUserId = currentUserIdRef.current;
      
      if (!currentUserId) {
        logger.dev("Mutation attempted without userId - session not available");
        return { previousSettings: undefined, currentUserId: null };
      }
      
      // Cancel any pending queries for userSettings (scoped by userId)
      await queryClient.cancelQueries({ queryKey: ["userSettings", currentUserId] });
      
      // Snapshot the previous data for rollback
      const previousSettings = queryClient.getQueryData<UserSettings>(["userSettings", currentUserId]);
      
      // Optimistically update the cache with normalized values
      const optimisticData = {
        ...(previousSettings || {}),
        ...newSettings,
        target_percentage:
          newSettings.target_percentage !== undefined
            ? normalizeTarget(newSettings.target_percentage)
            : previousSettings?.target_percentage
      } as UserSettings;
      
      queryClient.setQueryData(["userSettings", currentUserId], optimisticData);
      
      // Sync to localStorage immediately for instant UI feedback (scoped per user)
      try {
        if (newSettings.bunk_calculator_enabled !== undefined) {
          localStorage.setItem(`showBunkCalc_${currentUserId}`, newSettings.bunk_calculator_enabled.toString());
          window.dispatchEvent(new CustomEvent("bunkCalcToggle", { detail: newSettings.bunk_calculator_enabled }));
        }
        if (newSettings.target_percentage !== undefined) {
          const normalizedTarget = normalizeTarget(newSettings.target_percentage);
          localStorage.setItem(`targetPercentage_${currentUserId}`, normalizedTarget.toString());
        }
        if (newSettings.disabled_courses !== undefined) {
          localStorage.setItem(`disabledCourses_${currentUserId}`, JSON.stringify(newSettings.disabled_courses));
        }
      } catch (error) {
        // Ignore storage errors (e.g., private mode, disabled storage, quota exceeded)
        // Settings update can still proceed without localStorage sync
        logger.dev("Failed to sync settings to localStorage", { error });
      }
      
      return { previousSettings, currentUserId };
    },
    onSuccess: (newData, _variables, context) => {
      // Reconcile cache with the server response. localStorage was already written in onMutate.
      if (context?.currentUserId) {
        queryClient.setQueryData(["userSettings", context.currentUserId], newData);
      }
    },
    onError: (err, _variables, context) => {
      if (context?.previousSettings && context?.currentUserId) {
        queryClient.setQueryData(["userSettings", context.currentUserId], context.previousSettings);
      }
      
      // err is unknown by default in useMutation — narrow before comparing to NO_USER_ERROR_MESSAGE.
      const isNoUserError = err instanceof Error && err.message === NO_USER_ERROR_MESSAGE;
      if (!isNoUserError) {
        toast.error("Failed to save settings");
        Sentry.captureException(err, { tags: { type: "settings_update_error", location: "useUserSettings" } });
      }
    }
  });

  const { mutate: mutateSettings } = updateSettingsMutation;

  // Sync: Case A — DB → localStorage (DB is source of truth; picks up cross-device changes).
  //       Case B — DB empty (new user) → create row from localStorage or defaults.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (updateSettingsMutation.isPending || isLoading || isFetching) return;

    let isMounted = true;
    const validateActiveSession = (expectedUserId: string): boolean =>
      isMounted && currentUserIdRef.current === expectedUserId;

    (async () => {
      if (!isMounted) return;

      try {
        // Use the ref kept up-to-date by onAuthStateChange — no extra network call.
        const userId = currentUserIdRef.current;

        if (!userId) {
          logger.dev("No user ID available for storage sync, skipping");
          return;
        }

        // Case A: sync DB → localStorage (only write on diff to avoid redundant events).
        if (settings) {
          if (sessionStorage.getItem("prefetchedSettings") !== null) sessionStorage.removeItem("prefetchedSettings");
          if (!validateActiveSession(userId)) return;

          const localBunkKey = `showBunkCalc_${userId}`;
          const dbBunk = (settings.bunk_calculator_enabled ?? true).toString();
          if (localStorage.getItem(localBunkKey) !== dbBunk) {
            if (!isMounted) return;
            localStorage.setItem(localBunkKey, dbBunk);
            window.dispatchEvent(new CustomEvent("bunkCalcToggle", { detail: settings.bunk_calculator_enabled ?? true }));
          }
          
          const localTargetKey = `targetPercentage_${userId}`;
          const dbTarget = normalizeTarget(settings.target_percentage).toString();
          if (localStorage.getItem(localTargetKey) !== dbTarget) {
            if (!isMounted) return;
            localStorage.setItem(localTargetKey, dbTarget);
          }

          const localDisabledKey = `disabledCourses_${userId}`;
          const dbDisabled = JSON.stringify(settings.disabled_courses ?? {});
          if (localStorage.getItem(localDisabledKey) !== dbDisabled) {
            if (!isMounted) return;
            localStorage.setItem(localDisabledKey, dbDisabled);
          }
        } else if (settings === null) {
          // Case B: new user — create DB row from prefetched settings or localStorage/defaults. Runs once per session.
          if (hasAttemptedInitializationRef.current) return;
          if (!validateActiveSession(userId)) return;

          hasAttemptedInitializationRef.current = true;

          let settingsToInitialize: { bunk_calculator_enabled: boolean; target_percentage: number };
          const prefetchedFromStorage = loadPrefetchedSettings(userId);
          
          if (prefetchedFromStorage) {
            settingsToInitialize = {
              bunk_calculator_enabled: prefetchedFromStorage.bunk_calculator_enabled,
              target_percentage: prefetchedFromStorage.target_percentage
            };
            try {
              sessionStorage.removeItem("prefetchedSettings");
            } catch (cleanupError) {
              logger.dev("Failed to clean up prefetchedSettings:", cleanupError);
            }
          } else {
            // Prefer user-scoped keys; fall back to legacy un-scoped keys for one-time migration.
            const localBunk = localStorage.getItem(`showBunkCalc_${userId}`) ?? localStorage.getItem("showBunkCalc");
            const localTarget = localStorage.getItem(`targetPercentage_${userId}`) ?? localStorage.getItem("targetPercentage");
            
            if (sessionStorage.getItem("legacyKeysCleaned") !== "true") {
              if (localStorage.getItem("showBunkCalc") !== null) localStorage.removeItem("showBunkCalc");
              if (localStorage.getItem("targetPercentage") !== null) localStorage.removeItem("targetPercentage");
              sessionStorage.setItem("legacyKeysCleaned", "true");
            }
            
            settingsToInitialize = {
              bunk_calculator_enabled: localBunk !== null ? localBunk === "true" : true,
              target_percentage: localTarget !== null ? normalizeTarget(Number(localTarget)) : DEFAULT_TARGET_PERCENTAGE
            };
          }

          mutateSettings(settingsToInitialize);
        }
      } catch (error) {
        // Log error and return gracefully to avoid unhandled promise rejection
        logger.dev("Error during storage sync:", error);
        return;
      }
    })();

    return () => { isMounted = false; };
    // mutateSettings is stable (useMutation) and doesn't need to be in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, isLoading, isFetching, updateSettingsMutation.isPending]);

  return {
    settings,
    isLoading: isLoading || isFetching,
    updateBunkCalc: (enabled: boolean) => mutateSettings({ bunk_calculator_enabled: enabled }),
    updateTarget: (target: number) => mutateSettings({ target_percentage: normalizeTarget(target) }),
    updateDisabledCourses: (disabledCourses: DisabledCoursesMap) => mutateSettings({ disabled_courses: disabledCourses }),
  };
}

// ---------------------------------------------------------------------------
// Context — ensures a single auth listener and single React Query subscription
// regardless of how many components call useUserSettings().
// ---------------------------------------------------------------------------

type UserSettingsContextValue = ReturnType<typeof useUserSettingsState>;

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const value = useUserSettingsState();
  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings(): UserSettingsContextValue {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error("useUserSettings must be used inside <UserSettingsProvider>");
  }
  return ctx;
}