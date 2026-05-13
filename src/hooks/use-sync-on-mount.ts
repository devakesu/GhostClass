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

let lastSyncMountId: string | null = null;

function generateRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return String(Date.now());
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
  const [mountId] = useState(() => generateRandomId());
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
    const isAlreadySynced =
      typeof window !== "undefined" && lastSyncMountId === mountId;
    if (!enabled || !username || syncFinishedRef.current || isAlreadySynced)
      return;

    const abortController = new AbortController();
    let isCleanedUp = false;

    const finalizeSync = (status: number, data: SyncResponse) => {
      syncFinishedRef.current = true;
      lastSyncMountId = mountId;

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
      logger.dev(`[${sentryLocation}] Starting sync for mount: ${mountId}`);
      setIsSyncing(true);

      try {
        const res = await axios.get(`/api/cron/sync`, {
          signal: abortController.signal,
          baseURL: "",
        });

        if (isCleanedUp) return;
        if (!res.data) throw new Error("Empty response");

        finalizeSync(res.status, res.data);
      } catch (error: unknown) {
        if (isCleanedUp) return;
        if (isAxiosError(error)) {
          if (error.name === "CanceledError") return;
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
      abortController.abort();
    };
  }, [enabled, username, userId, sentryLocation, sentryTag, mountId]);

  const isComplete =
    syncCompleted || (!username && !!userId) || lastSyncMountId === mountId;

  return { isSyncing, syncCompleted: isComplete };
}
