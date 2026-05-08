/**
 * Shared TanStack Query utility helpers.
 */

import { isAxiosError } from "axios";
import { isGlobalOutageDetected } from "@/lib/axios";

/**
 * Returns a TanStack Query `retry` function that never retries on 4xx client
 * errors and retries up to `maxRetries` times for 5xx / network failures.
 *
 * Rationale for skipping 4xx retries:
 * - 429 Too Many Requests — retrying consumes another rate-limit slot, making
 *   the back-off situation worse.
 * - 401 / 403 — auth failures need user action; retrying won't help.
 * - 400 / 422 — bad request / validation errors; the payload won't change.
 *
 * Handles both Axios errors (`.response.status`) and plain fetch errors where
 * a `.status` property has been manually attached to the Error object.
 */
export function makeRetryFn(maxRetries = 1) {
  return (failureCount: number, error: unknown): boolean => {
    if (isGlobalOutageDetected()) return false;
    
    if (isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 503 || status === 500) return false; // Circuit breaker active
      if (error.code === "ERR_NETWORK") return false; // Fail fast when offline
      if (status !== undefined && status >= 400 && status < 500) return false;
    }
    // Fetch-based errors with a .status property manually attached
    if (typeof error === "object" && error !== null) {
      const status = (error as { status?: number }).status;
      if (status === 503 || status === 500) return false; // Circuit breaker active
      if (status !== undefined && status >= 400 && status < 500) return false;
    }
    return failureCount < maxRetries;
  };
}

/** Retry once on transient 5xx / network errors; skip all 4xx. */
export const retryOnce = makeRetryFn(1);

/** Retry twice on transient 5xx / network errors; skip all 4xx. */
export const retryTwice = makeRetryFn(2);
