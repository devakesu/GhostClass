"use client";

import { useState, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
import { redact } from "@/lib/utils";
import {
  captureSentryException,
  captureSentryMessage,
} from "@/lib/sentry-lazy";
import axios from "@/lib/axios";
import { isAxiosError } from "axios";

export interface SyncResponse {
  success?: boolean;
  processed?: number;
  deletions?: number;
  conflicts?: number;
  updates?: number;
  errors?: number;
}

export interface UseSyncOnMountOptions {
  username: string | undefined;
  userId: string | number | undefined;
  enabled?: boolean;
  onPartialSync?: (data: SyncResponse) => void | Promise<void>;
  onSuccess?: (data: SyncResponse) => void | Promise<void>;
  sentryLocation: string;
  sentryTag: string;
}

export interface UseSyncOnMountReturn {
  isSyncing: boolean;
  // True when a sync attempt has settled (either success or failure)
  syncSettled: boolean;
  // True when the last sync attempt failed
  syncFailed: boolean;
}

// Module-level global state to persist sync status and promise across all component mounts/unmounts.
// Use a `globalThis`-backed singleton so Fast Refresh / HMR doesn't reset this state in development.
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
type ActiveSyncHandle = {
  username: string;
  promise: Promise<{ data: SyncResponse; status: number }>;
} | null;

interface SyncMountState {
  lastSyncSuccessTime: number;
  lastSyncUsername: string | null;
  activeSyncPromise: ActiveSyncHandle;
}

declare global {
  var __ghostclass_useSyncOnMount_state_v1: SyncMountState | undefined;
}

const _global = globalThis.__ghostclass_useSyncOnMount_state_v1 ??= {
  lastSyncSuccessTime: 0,
  lastSyncUsername: null,
  activeSyncPromise: null,
};

// Local aliases for clarity; always read/write to `_global` to persist across HMR
const getLastSyncSuccessTime = () => _global.lastSyncSuccessTime;
const setLastSyncSuccessTime = (v: number) => { _global.lastSyncSuccessTime = v; };
const getLastSyncUsername = () => _global.lastSyncUsername;
const setLastSyncUsername = (v: string | null) => { _global.lastSyncUsername = v; };
const getActiveSyncPromise = () => _global.activeSyncPromise;
const setActiveSyncPromise = (v: ActiveSyncHandle) => { _global.activeSyncPromise = v; };

async function executeGlobalSync() {
  const res = await axios.get<SyncResponse>(`/api/cron/sync`, {
    baseURL: "",
  });
  if (!res.data) throw new Error("Empty response");
  return { data: res.data, status: res.status };
}

function handleSyncError(
  error: unknown,
  sentryLocation: string,
  sentryTag: string,
  userId: string | number | undefined,
  setIsSyncing: (val: boolean) => void
) {
  const errName = error instanceof Error ? error.name : (error as { name?: string })?.name;
  if (errName === "CanceledError" || errName === "AbortError") {
    logger.dev(`[${sentryLocation}] Sync request aborted`);
    return;
  }
  if (isAxiosError(error)) {
    if (error.response?.status === 500 || error.response?.status === 503) {
      setIsSyncing(false);
      return;
    }
  }
  logger.error(`${sentryLocation} sync failed`, error);
  captureSentryException(error, {
    tags: { type: sentryTag, location: `${sentryLocation}/useSyncOnMount` },
    extra: { userId: redact("id", String(userId)) },
  });
}

export function useSyncOnMount({
  username,
  userId,
  enabled = true,
  onPartialSync,
  onSuccess,
  sentryLocation,
  sentryTag,
}: UseSyncOnMountOptions): UseSyncOnMountReturn {
  const syncFinishedRef = useRef(false);

  const onPartialSyncRef = useRef(onPartialSync);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onPartialSyncRef.current = onPartialSync;
    onSuccessRef.current = onSuccess;
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSettled, setSyncSettled] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !username) return;

    // Check if successfully synced within cooldown period
    const now = Date.now();
    const isAlreadySynced =
      getLastSyncUsername() === username && (now - getLastSyncSuccessTime()) < SYNC_COOLDOWN_MS;

    if (isAlreadySynced || syncFinishedRef.current) {
      setSyncSettled(true);
      return;
    }

    let isCleanedUp = false;

    const finalizeSync = (status: number, data: SyncResponse) => {
      if (isCleanedUp) return;
      syncFinishedRef.current = true;
      setLastSyncSuccessTime(Date.now());
      setLastSyncUsername(username);

      // mark settled and clear failure state on success
      setSyncSettled(true);
      setSyncFailed(false);

      if (status === 207) {
        captureSentryMessage(`Partial sync failure in ${sentryLocation}`, {
          level: "warning",
          tags: {
            type: `${sentryTag}_partial_sync`,
            location: `${sentryLocation}/useSyncOnMount`,
          },
          extra: { userId: redact("id", String(userId)), response: data },
        });
        onPartialSyncRef.current?.(data);
      } else if (
        data.success &&
        (data.deletions ?? 0) + (data.conflicts ?? 0) + (data.updates ?? 0) > 0
      ) {
        onSuccessRef.current?.(data);
      }
    };

    const runSync = async () => {
      // Re-check inside async run to handle concurrent mounts firing in the same tick
      const innerNow = Date.now();
      if (getLastSyncUsername() === username && (innerNow - getLastSyncSuccessTime()) < SYNC_COOLDOWN_MS) {
        setSyncSettled(true);
        return;
      }

      setIsSyncing(true);

      try {
        if (!getActiveSyncPromise() || getActiveSyncPromise()!.username !== username) {
          logger.dev(`[${sentryLocation}] Initiating global EzyGo sync request`);
          // H-6: Use a shared object reference so the promise identity is captured
          // before any async continuation (catch/finally) fires. The previous pattern
          // assigned currentPromise after the IIFE started, so a synchronous throw
          // inside executeGlobalSync would compare against null and leave activeSyncPromise stale.
          const syncHandle: { promise: Promise<{ data: SyncResponse; status: number }> | null } = { promise: null };
          const promise = (async () => {
            try {
              return await executeGlobalSync();
            } catch (err) {
              if (getActiveSyncPromise()?.promise === syncHandle.promise) {
                setActiveSyncPromise(null);
              }
              throw err;
            } finally {
              if (getActiveSyncPromise()?.promise === syncHandle.promise) {
                setActiveSyncPromise(null);
              }
            }
          })();
          syncHandle.promise = promise;
          setActiveSyncPromise({ username, promise });
        } else {
          logger.dev(`[${sentryLocation}] Awaiting existing active EzyGo sync request`);
        }

        const result = await getActiveSyncPromise()!.promise;
        if (isCleanedUp) return;
        finalizeSync(result.status, result.data);
      } catch (error: unknown) {
        if (isCleanedUp) return;
        // mark failure for callers that need to know
        setSyncFailed(true);
        handleSyncError(error, sentryLocation, sentryTag, userId, setIsSyncing);
      } finally {
        if (!isCleanedUp) {
          setIsSyncing(false);
          // Mark the sync attempt as settled even on failure (intentional fail-open)
          setSyncSettled(true);
        }
      }
    };

    runSync();
    return () => {
      isCleanedUp = true;
    };
  }, [enabled, username, userId, sentryLocation, sentryTag]);

  const effectiveSettled = syncSettled || (!username && !!userId);

  return { isSyncing, syncSettled: effectiveSettled, syncFailed };
}

/** TEST ONLY: Reset module-level singleton state. */
export function _resetModuleState() {
  setLastSyncSuccessTime(0);
  setLastSyncUsername(null);
  setActiveSyncPromise(null);
}

