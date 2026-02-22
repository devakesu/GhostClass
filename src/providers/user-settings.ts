"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { UserSettings } from "@/types/user-settings";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// Default attendance target percentage used throughout the application
// This constant ensures consistency across different parts of the codebase
export const DEFAULT_TARGET_PERCENTAGE = 75;

// Shared error message for "no authenticated user" — used in mutationFn throw,
// retry logic, and onError handler to avoid fragile string duplication.
const NO_USER_ERROR_MESSAGE = "No user";

// normalizeTarget is defined at module-level (outside the hook) to avoid recreation on every render.
// This is preferred over useCallback because:
// 1. The function has no dependencies (pure function with no closure over component state/props)
// 2. Module-level avoids the overhead of useCallback's dependency checking
// 3. Provides a stable reference without requiring React hooks infrastructure
// If this function needed access to component state/props, useCallback would be more appropriate.
//
// Minimum target defaults to 75% but can be configured via NEXT_PUBLIC_ATTENDANCE_TARGET_MIN environment variable
// to support institutions with different minimum attendance requirements.
// Values below the configured minimum are unrealistic and could cause issues in attendance calculations.
//
// DATABASE MIGRATION CONSIDERATION: If NEXT_PUBLIC_ATTENDANCE_TARGET_MIN is changed to a higher value
// (e.g., from 75 to 80), users with stored target_percentage values below the new minimum will have
// their targets silently adjusted upward on the next read. This is intentional behavior to enforce
// the institutional minimum, but consider:
// 1. Announcing the change to users before deployment
// 2. Optionally creating a database migration to update existing values proactively
// 3. Adding a database constraint: CHECK (target_percentage >= [configured_minimum])
//
// Parse the environment variable once at module load time for performance
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

// Helper function to load and validate prefetched settings from sessionStorage
// When currentUserId is provided (user is authenticated), validates that stored settings
// belong to that user and rejects legacy records without userId. When currentUserId is null
// (no user authenticated), accepts any valid settings format.
// Defined at module level to avoid recreation on every render
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
  
  try {
    const raw = sessionStorage.getItem("prefetchedSettings");
    if (!raw) return null;
    
    // Parse as unknown first to avoid unsafe type assertions and enable proper runtime validation
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return clearAndReturn();
    
    // Convert to Record for safe property access
    const parsedRecord = parsed as Record<string, unknown>;

    // Validate userId if we have a current user - prevent cross-user leakage
    if (currentUserId) {
      // When a user is authenticated, only accept prefetched settings with a matching userId
      // First check if userId field exists (new format), reject if missing (legacy format)
      if (!('userId' in parsedRecord)) {
        // Legacy format without userId - reject when user is known to prevent cross-user leakage
        return clearAndReturn();
      }
      // Then validate the userId is a string and matches the current user
      if (typeof parsedRecord.userId !== "string" || parsedRecord.userId !== currentUserId) {
        // Invalid type or belongs to a different user - clear and ignore
        return clearAndReturn();
      }
    }
    // Note: When currentUserId is null (unauthenticated), we accept both new and legacy formats
    // since there's no cross-user leakage risk. This supports the migration path from legacy format.

    // Determine if this is the new format { userId, settings } or legacy format { bunk_calculator_enabled, target_percentage }
    // Runtime type guards for both shapes
    let settingsData: Record<string, unknown>;
    
    if ('settings' in parsedRecord && parsedRecord.settings !== null && typeof parsedRecord.settings === "object") {
      // New format: { userId?: string; settings: { bunk_calculator_enabled, target_percentage } }
      settingsData = parsedRecord.settings as Record<string, unknown>;
    } else if ('bunk_calculator_enabled' in parsedRecord || 'target_percentage' in parsedRecord) {
      // Legacy format: { bunk_calculator_enabled, target_percentage }
      settingsData = parsedRecord;
    } else {
      // Unknown format - clear stale data
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

    // Only use prefetched settings if both fields are valid; otherwise, clear and fall back to null.
    if (
      typeof bunk_calculator_enabled !== "boolean" ||
      typeof target_percentage !== "number"
    ) {
      return clearAndReturn();
    }

    return {
      bunk_calculator_enabled,
      target_percentage,
    };
  } catch {
    // Clear invalid data that caused parse failure
    return clearAndReturn();
  }
}

export function useUserSettings() {
  // Create stable Supabase client reference to avoid re-subscribing to auth changes on every render
  // The client is stateless and safe to memoize - auth state is managed separately via Supabase's session management
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  
  // Track current user ID in state to scope the query key
  // This prevents cross-user settings flash when switching users
  // Also maintained in a ref for synchronous access during cleanup
  const [userId, setUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // We derive this from userId via useMemo so that prefetched settings are available
  // during the same render where userId first becomes non-null, preventing an initial
  // "defaults" flash when the React Query hook is enabled.
  const prefetchedSettings = useMemo<UserSettings | null>(() => {
    // If there's no resolved user, do not expose any prefetched settings to avoid cross-user leakage
    if (!userId) {
      return null;
    }

    // When a valid userId is available, load and validate prefetched settings for that user
    return loadPrefetchedSettings(userId);
  }, [userId]);
  
  // Track mutation window to prevent focus refetch from overwriting optimistic updates
  // When user toggles a setting, we set this to true during onMutate
  // and clear it after onSuccess/onError to prevent stale data from overwriting changes
  const isMutatingRef = useRef(false);
  
  // Track if we've attempted initialization to prevent redundant mutation calls
  // This prevents duplicate initialization during rapid refetches before mutation completes
  const hasAttemptedInitializationRef = useRef(false);
  
  // Track if component is still mounted to prevent state updates after unmount
  // Using a ref ensures the latest value is always accessed in async callbacks
  const isMountedRef = useRef(true);

  // Monitor session changes to trigger settings fetch on login
  // This ensures settings are loaded immediately when user authenticates,
  // not just when navigating to protected routes
  useEffect(() => {
    // Reset mounted flag at the start of the effect to handle effect re-runs
    isMountedRef.current = true;
    
    // Initialize userId on mount and subscribe to auth changes in a single effect
    // to avoid race conditions between separate initialization and listener effects
    const initializeAndSubscribe = async () => {
      // Subscribe to auth changes FIRST (before reading session) to ensure we don't miss
      // any auth events that occur during initialization. The INITIAL_SESSION event will
      // provide the current session state.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        // Guard against state updates on unmounted component
        if (!isMountedRef.current) return;
        
        const newUserId = session?.user?.id ?? null;
        
        // Handle initial session event (replaces the previous getSession() call)
        // or when user signs in or session refreshes
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // Update both state and ref when session changes
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
          // useMemo will handle recomputing prefetched settings based on the new userId
          
          // Reset initialization flag on new login/refresh to allow fresh initialization if needed
          // For INITIAL_SESSION, this is the first time, so flag is already false
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            hasAttemptedInitializationRef.current = false;
          }
          // Only invalidate queries for a valid user ID to avoid inconsistent cache operations
          if (newUserId) {
            queryClient.invalidateQueries({ queryKey: ["userSettings", newUserId] });
          }
          // Also remove any queries that might have been created with null userId during initial mount
          queryClient.removeQueries({ queryKey: ["userSettings", null] });
        }
        // When user signs out, clear settings from cache and browser storage
        else if (event === "SIGNED_OUT") {
          // Store the previous userId before clearing the ref
          const previousUserId = currentUserIdRef.current;
          
          // Update state and ref to null for the signed-out state
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
          // useMemo will handle recomputing prefetched settings (clearing) based on userId becoming null
          
          // Remove user-scoped queries using the previous user's ID
          // Only remove queries if we have a valid previousUserId to avoid inconsistent cache operations
          if (previousUserId) {
            queryClient.removeQueries({ queryKey: ["userSettings", previousUserId] });
          }
          hasAttemptedInitializationRef.current = false;
          
          // Clear user-specific storage to prevent data leakage between users
          try {
            if (typeof window !== "undefined") {
              // Clear user-scoped keys for the user who just signed out
              if (previousUserId) {
                localStorage.removeItem(`showBunkCalc_${previousUserId}`);
                localStorage.removeItem(`targetPercentage_${previousUserId}`);
              }

              // Also clear non-scoped prefetched settings to avoid cross-user leakage
              // This prevents the next user from seeing the previous user's prefetched settings
              sessionStorage.removeItem("prefetchedSettings");
            }
          } catch (error) {
            // Ignore storage clearing errors (e.g., restricted environment)
            logger.dev("Failed to clear storage on sign out", { error });
          }
        } else {
          // For all other events (e.g., USER_UPDATED, PASSWORD_RECOVERY), just update the tracking
          currentUserIdRef.current = newUserId;
          setUserId(newUserId);
        }
      });

      return subscription;
    };

    const subscriptionPromise = initializeAndSubscribe();
    
    return () => {
      // Mark component as unmounted to prevent state updates
      isMountedRef.current = false;
      
      subscriptionPromise
        .then(subscription => subscription?.unsubscribe())
        .catch(error => {
          // Log initialization/cleanup errors but don't throw to avoid breaking cleanup
          logger.dev("Failed to unsubscribe from auth state changes", { error });
        });
    };
  }, [queryClient, supabase.auth]);

  // 1. Fetch from DB
  const { data: settings, isLoading, isFetching } = useQuery({
    queryKey: ["userSettings", userId],
    // Only apply placeholder data when we have a concrete userId to avoid leaking
    // prefetched settings into an unauthenticated or unresolved session state.
    placeholderData: userId ? prefetchedSettings ?? undefined : undefined,
    // Gate the query itself on a non-null userId so we never fetch for ["userSettings", null].
    enabled: !!userId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_settings")
        .select("bunk_calculator_enabled, target_percentage")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching settings:", error);
        Sentry.captureException(error, { tags: { type: "settings_fetch_error", location: "useUserSettings" } });
        return null;
      }

      return data as UserSettings | null;
    },
    staleTime: 30 * 1000, // 30 seconds - reduces API load while keeping data reasonably fresh
    gcTime: 5 * 60 * 1000, // 5 minutes - keep cache for reasonable time to avoid unnecessary refetches
    // Enable window focus refetch for cross-device sync, but block during mutations
    // The mutation lifecycle is responsible for keeping isMutatingRef in sync
    refetchOnWindowFocus: () => !isMutatingRef.current,
    retry: (failureCount, error) => {
      // Retry on network errors, but not on auth errors
      // This allows initial fetch attempts while auth is pending to fail gracefully
      // and automatically retry once session is established
      //
      // TECHNICAL DEBT: Using error message string matching is fragile as error messages
      // can change between Supabase versions or be localized. However, Supabase doesn't
      // currently provide specific error codes for "no user" scenarios, so string matching
      // is the most reliable method available. If Supabase adds error codes in the future,
      // this should be updated to use those instead (e.g., error.code === "NO_USER").
      const isNoUserError = error instanceof Error && error.message === NO_USER_ERROR_MESSAGE;
      return failureCount < 3 && !isNoUserError;
    }
  });
  
  // 2. Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: { bunk_calculator_enabled?: boolean; target_percentage?: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(NO_USER_ERROR_MESSAGE);

      const { data, error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, ...newSettings })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    // Optimistic update: update cache before server responds
    onMutate: async (newSettings): Promise<{ previousSettings: UserSettings | undefined; currentUserId: string | null }> => {
      // Mark that we're in a mutation window - prevents focus refetch from pulling stale data
      isMutatingRef.current = true;
      
      // Derive userId from the same source as the mutation (getUser) to ensure
      // cache updates happen even if currentUserIdRef is stale/null.
      // getUser() validates the session with the server (unlike getSession() which reads localStorage).
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;
      
      // If no userId is available, we shouldn't proceed with cache operations
      if (!currentUserId) {
        // Reset mutation window flag since we're aborting optimistic update
        isMutatingRef.current = false;
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
      } catch (error) {
        // Ignore storage errors (e.g., private mode, disabled storage, quota exceeded)
        // Settings update can still proceed without localStorage sync
        logger.dev("Failed to sync settings to localStorage", { error });
      }
      
      return { previousSettings, currentUserId };
    },
    onSuccess: (newData, _variables, context) => {
      // Update cache with actual server response (ensures normalized values)
      // Context should always be present since onMutate returns it (unless onMutate throws before returning)
      if (context?.currentUserId) {
        queryClient.setQueryData(["userSettings", context.currentUserId], newData);
      }
      
      // DO NOT write to localStorage here - already done in onMutate
      // This prevents redundant writes and event dispatches that cause glitches
      // Server response only validates the optimistic update was correct
      
      // Clear mutation window flag - safe to refetch on focus now
      isMutatingRef.current = false;
    },
    onError: (err, _variables, context) => {
      // Rollback to previous data on error
      // Only rollback if we have both the previous settings and a valid userId for the query key
      if (context?.previousSettings && context?.currentUserId) {
        queryClient.setQueryData(["userSettings", context.currentUserId], context.previousSettings);
      }
      
      if (err.message !== NO_USER_ERROR_MESSAGE) {
        toast.error("Failed to save settings");
        Sentry.captureException(err, { tags: { type: "settings_update_error", location: "useUserSettings" } });
      }
      
      // Clear mutation window flag - safe to refetch on focus now
      isMutatingRef.current = false;
    }
  });

  const { mutate: mutateSettings } = updateSettingsMutation;

  // 3. Centralized Sync Logic
  // IMPORTANT: This effect handles two cases:
  // - Case A: DB has settings -> Sync down to localStorage (DB is source of truth)
  // - Case B: DB query completed and is empty (new user) -> Create DB record from localStorage or defaults
  useEffect(() => {
    // Skip on server-side render
    if (typeof window === 'undefined') return;
    
    // Skip while mutation is pending, or while query is loading/fetching
    // We need complete data from DB before deciding whether to initialize
    if (updateSettingsMutation.isPending || isLoading || isFetching) return;

    // Track if effect is still mounted to prevent state updates after unmount
    let isMounted = true;

    // Helper to validate session is still active and belongs to the expected user
    // Returns true if session is valid, matches the expected userId, and component is still mounted
    const validateActiveSession = async (expectedUserId: string): Promise<boolean> => {
      // Check current mount state from closure to prevent race conditions
      if (!isMounted) return false;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          // Log at dev level so auth/network issues are diagnosable while still treating them as "no user"
          logger.dev("Error fetching auth user in validateActiveSession:", error);
          return false;
        }
        const user = data?.user;
        // Verify user exists, matches, and component is still mounted (re-check after async)
        return !!(user && user.id === expectedUserId && isMounted);
      } catch (err) {
        // Catch any unexpected thrown errors from the Supabase client
        logger.dev("Unexpected error in validateActiveSession:", err);
        return false;
      }
    };

    // Async IIFE to perform storage synchronization operations
    (async () => {
      // Check if component is still mounted before proceeding
      if (!isMounted) return;

      try {
        // Get current user ID from auth (getUser() validates the token server-side)
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const userId = currentUser?.id;
        
        if (!userId) {
          logger.dev("No user ID available for storage sync, skipping");
          return;
        }

        // Case A: DB has data -> Sync to LocalStorage ONLY if different (Source of Truth = DB)
        // This handles cross-device sync (e.g., changed settings on another device)
        if (settings) {
          // Clean up prefetched settings after first successful DB fetch
          // This prevents stale prefetched data from being reused on subsequent initialData calls
          const legacyKey = "prefetchedSettings";
          if (sessionStorage.getItem(legacyKey) !== null) {
            sessionStorage.removeItem(legacyKey);
          }
          
          // Validate session is still active and belongs to the same user before performing localStorage operations
          // This prevents race condition where user logs out while this promise is pending
          if (!(await validateActiveSession(userId))) {
            return;
          }
          
          const localBunkKey = `showBunkCalc_${userId}`;
          const localBunk = localStorage.getItem(localBunkKey);
          const dbBunk = (settings.bunk_calculator_enabled ?? true).toString();
          
          // Only sync if localStorage differs from DB (cross-device change)
          if (localBunk !== dbBunk) {
            // Check if component is still mounted before performing side effects
            if (!isMounted) return;
            localStorage.setItem(localBunkKey, dbBunk);
            window.dispatchEvent(new CustomEvent("bunkCalcToggle", { detail: settings.bunk_calculator_enabled ?? true }));
          }
          
          const localTargetKey = `targetPercentage_${userId}`;
          const localTarget = localStorage.getItem(localTargetKey);
          const dbTarget = normalizeTarget(settings.target_percentage).toString();
          
          // Only sync if localStorage differs from DB
          if (localTarget !== dbTarget) {
            // Check if component is still mounted before performing side effects
            if (!isMounted) return;
            localStorage.setItem(localTargetKey, dbTarget);
          }
        } 
        // Case B: DB is empty (New User) -> Migrate LocalStorage to DB or Initialize with defaults
        // This runs once per session when DB returns null after initial fetch completes
        else if (settings === null) {
          // Helper function to determine if initialization should be skipped
          const shouldSkipInitialization = () => {
            // Skip if we've already attempted initialization (prevent redundant mutations)
            // This ensures we only try once per session, even if refetches still return null
            if (hasAttemptedInitializationRef.current) return true;
            
            return false;
          };
          
          if (shouldSkipInitialization()) {
            return;
          }

          // Validate session is still active and belongs to the same user before calling mutateSettings
          // This prevents race condition where user logs out while this promise is pending
          if (!(await validateActiveSession(userId))) {
            return;
          }

          // Mark that we've attempted initialization to prevent duplicate calls
          // Even if the mutation fails, we won't retry automatically - user can refresh
          hasAttemptedInitializationRef.current = true;

          // Determine settings to use for DB initialization
          let settingsToInitialize: { bunk_calculator_enabled: boolean; target_percentage: number };
          
          // Check if we have prefetched settings that should be synced to DB
          // This happens when user just logged in and settings were fetched from /api/auth/save-token
          // If the backend returned settings but no DB row exists, we need to create the row from prefetched values
          const legacyKey = "prefetchedSettings";
          const prefetchedFromStorage = loadPrefetchedSettings(userId);
          
          if (prefetchedFromStorage) {
            // Use prefetched settings from the backend (ensures DB row is created with server values)
            settingsToInitialize = {
              bunk_calculator_enabled: prefetchedFromStorage.bunk_calculator_enabled,
              target_percentage: prefetchedFromStorage.target_percentage
            };
            // Clean up prefetched settings after using them for initialization
            // Wrap in try/catch so DB initialization proceeds even if storage cleanup fails
            try {
              sessionStorage.removeItem(legacyKey);
            } catch (cleanupError) {
              // Ignore cleanup failures - they won't prevent DB initialization
              logger.dev("Failed to clean up prefetched settings from sessionStorage:", cleanupError);
            }
          } else {
            // Fall back to localStorage values if they exist, otherwise use defaults
            // Check user-scoped keys first, then fall back to legacy keys for migration
            const localBunkKey = `showBunkCalc_${userId}`;
            const localTargetKey = `targetPercentage_${userId}`;
            const localBunk = localStorage.getItem(localBunkKey) ?? localStorage.getItem("showBunkCalc");
            const localTarget = localStorage.getItem(localTargetKey) ?? localStorage.getItem("targetPercentage");
            
            // Clean up legacy keys after migration
            const legacyCleanupFlagKey = "legacyKeysCleaned";
            const hasCleanedLegacyKeysThisSession = sessionStorage.getItem(legacyCleanupFlagKey) === "true";
            
            if (!hasCleanedLegacyKeysThisSession) {
              if (localStorage.getItem("showBunkCalc") !== null) {
                localStorage.removeItem("showBunkCalc");
              }
              if (localStorage.getItem("targetPercentage") !== null) {
                localStorage.removeItem("targetPercentage");
              }
              sessionStorage.setItem(legacyCleanupFlagKey, "true");
            }
            
            settingsToInitialize = {
              bunk_calculator_enabled: localBunk !== null ? localBunk === "true" : true,
              target_percentage: localTarget !== null ? normalizeTarget(Number(localTarget)) : DEFAULT_TARGET_PERCENTAGE
            };
          }

          // Create DB record from determined settings
          // This runs only once per session when settings is null after initial fetch
          mutateSettings(settingsToInitialize);
        }
      } catch (error) {
        // Log error and return gracefully to avoid unhandled promise rejection
        logger.dev("Error during storage sync:", error);
        return;
      }
    })();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
    // mutateSettings is stable - it's the mutate function from useMutation and doesn't change between renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, isLoading, isFetching, updateSettingsMutation.isPending, supabase.auth]);

  return {
    settings,
    isLoading: isLoading || isFetching,
    updateBunkCalc: (enabled: boolean) => mutateSettings({ bunk_calculator_enabled: enabled }),
    updateTarget: (target: number) => mutateSettings({ target_percentage: normalizeTarget(target) })
  };
}