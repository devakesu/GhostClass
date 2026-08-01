import { describe, expect, it } from "vitest";
import { makeRetryFn, retryOnce, retryTwice } from "../query-utils";
import { AxiosError } from "axios";

describe("query-utils.ts", () => {
  describe("makeRetryFn", () => {
    it("returns false for 4xx axios errors", () => {
      const retry = makeRetryFn(3);
      const error = {
        isAxiosError: true,
        response: { status: 404 },
      } as unknown as AxiosError;

      expect(retry(0, error)).toBe(false);
    });

    it("returns false for 503 axios errors (circuit breaker)", () => {
      const retry = makeRetryFn(3);
      const error = {
        isAxiosError: true,
        response: { status: 503 },
      } as unknown as AxiosError;

      expect(retry(0, error)).toBe(false);
    });

    it("returns false for ERR_NETWORK axios code", () => {
      const retry = makeRetryFn(3);
      const error = {
        isAxiosError: true,
        code: "ERR_NETWORK",
      } as unknown as AxiosError;

      expect(retry(0, error)).toBe(false);
    });

    it("returns false for 500/503 (circuit breaker) and true for 502 (transient)", () => {
      const retry = makeRetryFn(3);
      const error500 = { isAxiosError: true, response: { status: 500 } } as any;
      const error502 = { isAxiosError: true, response: { status: 502 } } as any;

      expect(retry(0, error500)).toBe(false);
      expect(retry(0, error502)).toBe(true);
      expect(retry(2, error502)).toBe(true);
      expect(retry(3, error502)).toBe(false);
    });

    it("returns false for 4xx fetch-based errors (with manual .status)", () => {
      const retry = makeRetryFn(3);
      const error = { status: 400 };

      expect(retry(0, error)).toBe(false);
    });

    it("returns false for 503 fetch-based errors", () => {
      const retry = makeRetryFn(3);
      const error = { status: 503 };

      expect(retry(0, error)).toBe(false);
    });

    it("returns true for generic errors within retry limit", () => {
      const retry = makeRetryFn(2);
      const error = new Error("Generic failure");

      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(true);
      expect(retry(2, error)).toBe(false);
    });

    it("handles null errors gracefully", () => {
      const retry = makeRetryFn(1);
      expect(retry(0, null)).toBe(true);
    });
  });

  it("retryOnce has maxRetries = 1", () => {
    expect(retryOnce(0, new Error())).toBe(true);
    expect(retryOnce(1, new Error())).toBe(false);
  });

  it("retryTwice has maxRetries = 2", () => {
    expect(retryTwice(1, new Error())).toBe(true);
    expect(retryTwice(2, new Error())).toBe(false);
  });
});
