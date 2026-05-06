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

import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

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

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a target percentage to be between 1 and 100.
 */
const normalizeTarget = (val: number): number => Math.min(Math.max(val, 1), 100);

/**
 * Stage 2 Hydration / Migration Helper.
 * 
 * Logic flow:
 * 1. Checks sessionStorage for "prefetchedSettings" (Stage 1).
 * 2. If missing, checks localStorage for individual user-scoped keys (Stage 2).
 * 3. Validates the data shape and returns a clean UserSettings object or null.
 */
const loadPrefetchedSettings = (currentUserId: string | null): UserSettings | null => {
  if (typeof window === "undefined") return null;

  const clearAndReturn = () => {
    try {
      sessionStorage.removeItem("prefetchedSettings");
    } catch {
      // Swallow storage errors to ensure we always return null
    }
    return null;
  };
  
  try {
    const raw = sessionStorage.getItem("prefetchedSettings");

    if (!raw) {
      // Stage 2: sessionStorage is gone (cleared after the first successful DB fetch).
      // Build placeholder from individual localStorage keys so returning users get their
      // settings immediately without waiting for Supabase query completion.
      if (!currentUserId) return null;

      const storedBunk = localStorage.getItem(`showBunkCalc_${currentUserId}`);
      const storedTarget = localStorage.getItem(`targetPercentage_${currentUserId}`);
      const storedDisabled = localStorage.getItem(`disabledCourses_${currentUserId}`);

      if (storedBunk === null && storedTarget === null) return null;

      try {
        return {
          bunk_calculator_enabled: storedBunk === "true",
          target_percentage: storedTarget ? parseInt(storedTarget, 10) : DEFAULT_TARGET_PERCENTAGE,
          disabled_courses: storedDisabled ? JSON.parse(storedDisabled) : {},
        };
      } catch {
        return null;
      }
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return clearAndReturn();

    const parsedRecord = parsed as Record<string, unknown>;

    // Security check: if currentUserId is provided, the record MUST belong to them
    if (currentUserId) {
      if (!('userId' in parsedRecord)) {
        // Legacy format without userId - clear it to avoid leaking cross-user data
        return clearAndReturn();
      }
      // Then validate the userId is a string and matches the current user
      if (typeof parsedRecord.userId !== "string" || parsedRecord.userId !== currentUserId) {
        // Invalid type or belongs to a different user - clear and ignore
        return clearAndReturn();
      }
    }

    let settingsData: Record<string, unknown>;
    
    if ('settings' in parsedRecord && parsedRecord.settings !== null && typeof parsedRecord.settings === "object") {
      // New format: { userId?: string; settings: { bunk_calculator_enabled, target_percentage } }
      settingsData = parsedRecord.settings as Record<string, unknown>;
    } else if ('bunk_calculator_enabled' in parsedRecord || 'target_percentage' in parsedRecord) {
      // Legacy format: { bunk_calculator_enabled, target_percentage }
      settingsData = parsedRecord;
    } else {
      return clearAndReturn();
    }

    const { bunk_calculator_enabled, target_percentage, disabled_courses } = settingsData;

    if (
      typeof bunk_calculator_enabled !== "boolean" ||
      typeof target_percentage !== "number"
    ) {
      return clearAndReturn();
    }

    return {
      bunk_calculator_enabled,
      target_percentage: normalizeTarget(target_percentage),
      disabled_courses: (disabled_courses && typeof disabled_courses === "object") 
        ? (disabled_courses as Record<string, Record<string, string>>) 
        : {},
    };
  } catch (err) {
    logger.error("Failed to load prefetched settings:", err);
    return clearAndReturn();
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id ?? null;
      currentUserIdRef.current = currentUserId;

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        setUserId(currentUserId);
        if (currentUserId) {
          // Force a fresh fetch for the new user
          queryClient.invalidateQueries({ queryKey: ["userSettings", currentUserId] });
        }
        // Always remove the null-user cache to ensure clean state
        queryClient.removeQueries({ queryKey: ["userSettings", null] });
      } else if (event === "SIGNED_OUT") {
        // Clear local storage keys for the user who just logged out
        if (userId) {
          localStorage.removeItem(`showBunkCalc_${userId}`);
          localStorage.removeItem(`targetPercentage_${userId}`);
          localStorage.removeItem(`disabledCourses_${userId}`);
        }
        setUserId(null);
        queryClient.removeQueries({ queryKey: ["userSettings"] });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, queryClient, userId]);

  // Determine the placeholder data for the query (Stage 2 hydration)
  const prefetchedSettings = useMemo(
    () => {
      if (!userId) {
        return null;
      }
      return loadPrefetchedSettings(userId);
    },
    [userId]
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
    retry: (failureCount, error: any) => {
      if (error?.code === 'PGRST116') return false; // Not found
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
          updated_at: new Date().toISOString(),
        });

      if (error) {
        Sentry.captureException(error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      // Optimistically update the cache
      queryClient.setQueryData(["userSettings", userId], (old: UserSettings | null) => ({
        ...old,
        ...variables,
      }));
    },
    onError: (err) => {
      toast.error("Failed to save settings. Changes might not persist.");
      logger.error("Settings mutation failed:", err);
    }
  });

  // ---------------------------------------------------------------------------
  // Effects: Sync DB -> LocalStorage & Initialization
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!userId || isLoading || mutation.isPending) return;

    try {
      // 1. If DB has no record for this user, create one using local preferences (migration)
      //    or defaults (new user).
      if (dbSettings === null) {
        const legacyBunk = localStorage.getItem("showBunkCalc");
        const legacyTarget = localStorage.getItem("targetPercentage");

        const initialBunk = legacyBunk !== null ? legacyBunk === "true" : (prefetchedSettings?.bunk_calculator_enabled ?? true);
        const initialTarget = legacyTarget !== null ? normalizeTarget(parseInt(legacyTarget, 10)) : (prefetchedSettings?.target_percentage ?? DEFAULT_TARGET_PERCENTAGE);
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
            window.dispatchEvent(new CustomEvent("bunkCalcToggle", { detail: val === "true" }));
          }
        }
      };

      sync(`showBunkCalc_${userId}`, String(dbSettings.bunk_calculator_enabled));
      sync(`targetPercentage_${userId}`, String(dbSettings.target_percentage));
      sync(`disabledCourses_${userId}`, JSON.stringify(dbSettings.disabled_courses));

    } catch (err) {
      // Non-fatal error; just log to dev console
      logger.dev("Error during storage sync:", err);
    }
  }, [dbSettings, userId, isLoading, mutation, prefetchedSettings]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const updateBunkCalc = (enabled: boolean) => mutation.mutate({ bunk_calculator_enabled: enabled });
  const updateTarget = (percentage: number) => mutation.mutate({ target_percentage: normalizeTarget(percentage) });
  const updateDisabledCourses = (map: Record<string, Record<string, string>>) => mutation.mutate({ disabled_courses: map });

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

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
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
    throw new Error("useUserSettings must be used inside <UserSettingsProvider>");
  }
  return context;
}
