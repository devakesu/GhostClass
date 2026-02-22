"use client";

/**
 * useSyncOnMount
 *
 * Runs exactly one background sync against /api/cron/sync per real navigation.
 *
 * De-duplication strategy
 * -----------------------
 * React Strict-Mode double-invokes effects. To survive this without double-
 * syncing we track a `mountId` (random string assigned at component creation)
 * alongside `lastSyncMountId` (the mountId whose sync has already completed).
 * If they match, the sync is skipped.
 *
 * A second **empty-dep** effect regenerates `mountId` after every real mount so
 * that genuine page navigations always trigger a fresh sync.
 */

import { useState, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
import { redact } from "@/lib/utils";
import type { CaptureContext } from "@sentry/core";

// ---------------------------------------------------------------------------
// Lazy Sentry helpers – keeps the SDK (~250 KB) out of the initial bundle.
// ---------------------------------------------------------------------------
const captureSentryException = (error: unknown, context?: CaptureContext) => {
  void import("@sentry/nextjs")
    .then(({ captureException }) => captureException(error, context))
    .catch((importError) => {
      console.error("[Sentry] Failed to load SDK for captureException:", importError);
      console.error("[Sentry] Original error:", error);
    });
};
const captureSentryMessage = (message: string, context?: CaptureContext) => {
  void import("@sentry/nextjs")
    .then(({ captureMessage }) => captureMessage(message, context))
    .catch((importError) => {
      console.error("[Sentry] Failed to load SDK for captureMessage:", importError);
      console.error("[Sentry] Original message:", message);
    });
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SyncResponse {
  success?: boolean;
  processed?: number;
  deletions?: number;
  conflicts?: number;
  updates?: number;
  errors?: number;
}

export interface UseSyncOnMountOptions {
  /**
   * EzyGo username to sync. When falsy but `userId` is present the hook
   * immediately marks sync as completed so the page can render.
   */
  username: string | undefined;
  /** User ID; used only to decide whether to short-circuit when username is absent. */
  userId: string | number | undefined;
  /**
   * Set to `false` to defer the sync until prerequisite data is ready
   * (e.g. attendance and tracking queries have finished loading).
   * Defaults to `true`.
   */
  enabled?: boolean;
  /**
   * Called on HTTP 207 Partial Content – some records synced, others failed.
   * Use this to show a warning toast and/or trigger targeted refetches.
   */
  onPartialSync?: (data: SyncResponse) => void | Promise<void>;
  /**
   * Called on a fully successful sync that produced changes
   * (deletions + conflicts + updates > 0).
   */
  onSuccess?: (data: SyncResponse) => void | Promise<void>;
  /** Human-readable component name used in Sentry context (`location` tag). */
  sentryLocation: string;
  /** Short identifier used as the Sentry `type` tag (e.g. `"background_sync"`). */
  sentryTag: string;
}

export interface UseSyncOnMountReturn {
  /** True while the `/api/cron/sync` fetch is in-flight. */
  isSyncing: boolean;
  /** True once sync has finished (or been skipped). Safe to render page content. */
  syncCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSyncOnMount({
  username,
  userId,
  enabled = true,
  onPartialSync,
  onSuccess,
  sentryLocation,
  sentryTag,
}: UseSyncOnMountOptions): UseSyncOnMountReturn {
  const mountId = useRef(Math.random().toString(36));
  const lastSyncMountId = useRef<string | null>(null);

  // Keep callbacks in refs so the sync effect never needs to re-run when the
  // caller re-creates the callback functions.
  const onPartialSyncRef = useRef(onPartialSync);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onPartialSyncRef.current = onPartialSync;
    onSuccessRef.current = onSuccess;
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCompleted, setSyncCompleted] = useState(false);

  // Regenerate the mountId on every real navigation so that navigating back to
  // the same page triggers a fresh sync. This runs after the sync effect so the
  // stable initial ID is used for the first sync and the new ID is ready for the
  // next real mount.
  useEffect(() => {
    mountId.current = Math.random().toString(36);
  }, []);

  useEffect(() => {
    // Wait until the caller signals all prerequisite queries have loaded.
    if (!enabled) return;

    if (!username) {
      // User is authenticated but has no EzyGo username – nothing to sync.
      // Unblock the page immediately.
      if (userId) setSyncCompleted(true);
      return;
    }

    // Dedup: this mount already ran a sync – skip.
    if (lastSyncMountId.current === mountId.current) {
      logger.dev(`[${sentryLocation}] Sync already completed for this mount, skipping`);
      setSyncCompleted(true);
      return;
    }

    const abortController = new AbortController();
    let isCleanedUp = false;

    const performSync = async () => {
      logger.dev(`[${sentryLocation}] Starting sync for mount: ${mountId.current}`);
      setIsSyncing(true);

      try {
        const res = await fetch(`/api/cron/sync`, {
          signal: abortController.signal,
        });

        const data: SyncResponse = await res.json();

        if (isCleanedUp) return;

        if (res.status === 207) {
          // Partial failure – call the page-specific handler.
          captureSentryMessage(`Partial sync failure in ${sentryLocation}`, {
            level: "warning",
            tags: { type: `${sentryTag}_partial_sync`, location: `${sentryLocation}/useSyncOnMount` },
            extra: { userId: redact("id", String(userId)), response: data },
          });
          await onPartialSyncRef.current?.(data);
        } else if (!res.ok) {
          throw new Error(`Sync API responded with status: ${res.status}`);
        } else if (
          data.success &&
          ((data.deletions ?? 0) + (data.conflicts ?? 0) + (data.updates ?? 0)) > 0
        ) {
          await onSuccessRef.current?.(data);
        }
      } catch (error: unknown) {
        if (isCleanedUp) return;
        const e = error as Error;
        if (e.name === "AbortError") {
          logger.dev(`[${sentryLocation}] Sync request aborted`);
          return;
        }

        logger.error(`${sentryLocation} background sync failed`, error);
        captureSentryException(error, {
          tags: { type: sentryTag, location: `${sentryLocation}/useSyncOnMount` },
          extra: { userId: redact("id", String(userId)) },
        });
      } finally {
        if (!isCleanedUp) {
          logger.dev(`[${sentryLocation}] Sync completed for mount: ${mountId.current}`);
          lastSyncMountId.current = mountId.current;
          setIsSyncing(false);
          setSyncCompleted(true);
        }
      }
    };

    performSync();

    return () => {
      isCleanedUp = true;
      abortController.abort();
    };
  }, [enabled, username, userId, sentryLocation, sentryTag]);

  return { isSyncing, syncCompleted };
}
