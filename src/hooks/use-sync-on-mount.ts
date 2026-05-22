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
  syncCompleted: boolean;
}

// Module-level global state to persist sync status and promise across all component mounts/unmounts
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
let lastSyncSuccessTime = 0;
let lastSyncUsername: string | null = null;
let activeSyncPromise: {
  username: string;
  promise: Promise<{ data: SyncResponse; status: number }>;
} | null = null;

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
  const [syncCompleted, setSyncCompleted] = useState(false);

  useEffect(() => {
    if (!enabled || !username) return;

    // Check if successfully synced within cooldown period
    const now = Date.now();
    const isAlreadySynced =
      lastSyncUsername === username && (now - lastSyncSuccessTime) < SYNC_COOLDOWN_MS;

    if (isAlreadySynced || syncFinishedRef.current) {
      setSyncCompleted(true);
      return;
    }

    let isCleanedUp = false;

    const finalizeSync = (status: number, data: SyncResponse) => {
      if (isCleanedUp) return;
      syncFinishedRef.current = true;
      lastSyncSuccessTime = Date.now();
      lastSyncUsername = username;

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
      if (lastSyncUsername === username && (innerNow - lastSyncSuccessTime) < SYNC_COOLDOWN_MS) {
        setSyncCompleted(true);
        return;
      }

      setIsSyncing(true);

      try {
        if (!activeSyncPromise || activeSyncPromise.username !== username) {
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
              if (activeSyncPromise?.promise === syncHandle.promise) {
                activeSyncPromise = null;
              }
              throw err;
            } finally {
              if (activeSyncPromise?.promise === syncHandle.promise) {
                activeSyncPromise = null;
              }
            }
          })();
          syncHandle.promise = promise;
          activeSyncPromise = { username, promise };
        } else {
          logger.dev(`[${sentryLocation}] Awaiting existing active EzyGo sync request`);
        }

        const result = await activeSyncPromise.promise;
        if (isCleanedUp) return;
        finalizeSync(result.status, result.data);
      } catch (error: unknown) {
        if (isCleanedUp) return;
        handleSyncError(error, sentryLocation, sentryTag, userId, setIsSyncing);
      } finally {
        if (!isCleanedUp) {
          setIsSyncing(false);
          setSyncCompleted(true);
        }
      }
    };

    runSync();
    return () => {
      isCleanedUp = true;
    };
  }, [enabled, username, userId, sentryLocation, sentryTag]);

  const isComplete = syncCompleted || (!username && !!userId);

  return { isSyncing, syncCompleted: isComplete };
}

/** TEST ONLY: Reset module-level singleton state. */
export function _resetModuleState() {
  lastSyncSuccessTime = 0;
  lastSyncUsername = null;
  activeSyncPromise = null;
}

