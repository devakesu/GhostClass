import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { makeRetryFn, retryOnce, retryTwice } from "@/lib/query-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real AxiosError with the given HTTP status. */
function axiosError(status: number): AxiosError {
  const err = new AxiosError("Request failed", String(status));
  err.response = {
    status,
    statusText: String(status),
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

/** Build a plain Error with a .status property attached (fetch-style). */
function fetchError(status: number): Error & { status: number } {
  const err = new Error("Fetch failed") as Error & { status: number };
  err.status = status;
  return err;
}

// ---------------------------------------------------------------------------
// makeRetryFn
// ---------------------------------------------------------------------------

describe("makeRetryFn", () => {
  describe("Axios errors — 4xx block list", () => {
    const fn = makeRetryFn(3); // high ceiling so we're testing the status block, not count

    it.each([400, 401, 403, 422, 429])(
      "returns false for HTTP %i regardless of failureCount",
      (status) => {
        expect(fn(0, axiosError(status))).toBe(false);
        expect(fn(1, axiosError(status))).toBe(false);
      }
    );

    it("returns true for 499 (unknown 4xx not yet hard-coded) — no, actually 4xx is the whole range", () => {
      // The guard covers the entire 400–499 range
      expect(fn(0, axiosError(499))).toBe(false);
    });
  });

  describe("Axios errors — 5xx / network should retry up to maxRetries", () => {
    it("retries for 500 when failureCount < maxRetries", () => {
      const fn = makeRetryFn(2);
      expect(fn(0, axiosError(500))).toBe(true);
      expect(fn(1, axiosError(500))).toBe(true);
    });

    it("stops retrying for 500 when failureCount >= maxRetries", () => {
      const fn = makeRetryFn(2);
      expect(fn(2, axiosError(500))).toBe(false);
    });

    it.each([502, 503, 504])(
      "retries on HTTP %i (transient server error)",
      (status) => {
        const fn = makeRetryFn(1);
        expect(fn(0, axiosError(status))).toBe(true);
        expect(fn(1, axiosError(status))).toBe(false);
      }
    );
  });

  describe("Axios errors — no response (network failure)", () => {
    it("retries network errors (no .response) up to maxRetries", () => {
      const fn = makeRetryFn(2);
      const err = new AxiosError("Network Error");
      // err.response is undefined — simulates a connection reset / timeout
      expect(fn(0, err)).toBe(true);
      expect(fn(1, err)).toBe(true);
      expect(fn(2, err)).toBe(false);
    });
  });

  describe("Fetch-style errors (.status property)", () => {
    const fn = makeRetryFn(3);

    it.each([400, 401, 403, 422, 429])(
      "returns false for status %i on a plain Error with .status",
      (status) => {
        expect(fn(0, fetchError(status))).toBe(false);
      }
    );

    it("retries for fetch-style 500 up to maxRetries", () => {
      const fn2 = makeRetryFn(2);
      expect(fn2(0, fetchError(500))).toBe(true);
      expect(fn2(1, fetchError(500))).toBe(true);
      expect(fn2(2, fetchError(500))).toBe(false);
    });
  });

  describe("Plain errors with no status", () => {
    it("retries plain Error (no status) up to maxRetries", () => {
      const fn = makeRetryFn(1);
      expect(fn(0, new Error("timeout"))).toBe(true);
      expect(fn(1, new Error("timeout"))).toBe(false);
    });

    it("retries non-Error throws (e.g. string) up to maxRetries", () => {
      const fn = makeRetryFn(1);
      expect(fn(0, "something blew up")).toBe(true);
      expect(fn(1, "something blew up")).toBe(false);
    });
  });

  describe("maxRetries boundary", () => {
    it("makeRetryFn(0) never retries", () => {
      const fn = makeRetryFn(0);
      expect(fn(0, new Error("any"))).toBe(false);
    });

    it("makeRetryFn(1) retries exactly once", () => {
      const fn = makeRetryFn(1);
      expect(fn(0, new Error("any"))).toBe(true);
      expect(fn(1, new Error("any"))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Exported conveniences
// ---------------------------------------------------------------------------

describe("retryOnce", () => {
  it("is equivalent to makeRetryFn(1)", () => {
    // 4xx — no retry
    expect(retryOnce(0, axiosError(429))).toBe(false);
    // 5xx first attempt — retry
    expect(retryOnce(0, axiosError(500))).toBe(true);
    // 5xx after one failure — stop
    expect(retryOnce(1, axiosError(500))).toBe(false);
  });
});

describe("retryTwice", () => {
  it("is equivalent to makeRetryFn(2)", () => {
    // 4xx — no retry
    expect(retryTwice(0, axiosError(401))).toBe(false);
    // 5xx first and second attempt — retry
    expect(retryTwice(0, axiosError(503))).toBe(true);
    expect(retryTwice(1, axiosError(503))).toBe(true);
    // 5xx after two failures — stop
    expect(retryTwice(2, axiosError(503))).toBe(false);
  });
});
