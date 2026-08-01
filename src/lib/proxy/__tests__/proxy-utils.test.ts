import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must be mocked for tests to run in jsdom/node
vi.mock("server-only", () => ({}));

import {
  buildEgressTargets,
  readWithLimit,
  resolveSafeUpstreamErrorMessage,
  UpstreamResponseTooLargeError,
} from "../proxy-utils";

describe("Proxy Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CF_PROXY_URL", "");
    vi.stubEnv("CF_PROXY_SECRET", "");
    vi.stubEnv("AWS_SECONDARY_URL", "");
    vi.stubEnv("AWS_SECONDARY_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("buildEgressTargets", () => {
    it("builds targets from environment variables", () => {
      vi.stubEnv("CF_PROXY_URL", "https://cf.proxy/");
      vi.stubEnv("CF_PROXY_SECRET", "cf-secret");
      vi.stubEnv("AWS_SECONDARY_URL", "https://aws.proxy/");
      vi.stubEnv("AWS_SECONDARY_SECRET", "aws-secret");
      vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://direct.proxy");

      const targets = buildEgressTargets();
      expect(targets).toHaveLength(3);

      expect(targets[0]).toMatchObject({
        name: "primary",
        baseUrl: "https://cf.proxy",
        proxyHeaders: { "x-proxy-secret": "cf-secret" },
      });

      expect(targets[1]).toMatchObject({
        name: "secondary",
        baseUrl: "https://aws.proxy",
        proxyHeaders: { "x-proxy-secret": "aws-secret" },
      });

      expect(targets[2]).toMatchObject({
        name: "direct",
        baseUrl: "https://direct.proxy",
        proxyHeaders: {},
      });
    });

    it("handles missing secrets", () => {
      vi.stubEnv("CF_PROXY_URL", "https://cf.proxy");
      const targets = buildEgressTargets();
      expect(targets[0].proxyHeaders).toEqual({});
    });

    it("trims trailing slashes from URLs", () => {
      vi.stubEnv("CF_PROXY_URL", "https://cf.proxy///");
      const targets = buildEgressTargets();
      expect(targets[0].baseUrl).toBe("https://cf.proxy");
    });
  });

  describe("readWithLimit", () => {
    it("returns empty string for null body", async () => {
      expect(await readWithLimit(null, 100)).toBe("");
    });

    it("reads full body within limit", async () => {
      const data = new TextEncoder().encode("hello world");
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const result = await readWithLimit(stream, 100);
      expect(result).toBe("hello world");
    });

    it("throws UpstreamResponseTooLargeError if limit exceeded", async () => {
      const data = new Uint8Array(10);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.enqueue(data);
          controller.close();
        },
      });

      await expect(readWithLimit(stream, 15)).rejects.toThrow(
        UpstreamResponseTooLargeError,
      );
    });

    it("handles AbortSignal", async () => {
      const controller = new AbortController();
      let streamController: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(c) {
          streamController = c;
        },
      });

      const promise = readWithLimit(stream, 100, controller.signal);
      controller.abort();

      // Trigger the loop iteration so it checks the signal
      streamController!.enqueue(new Uint8Array([1]));

      await expect(promise).rejects.toThrow();
    });
  });

  describe("resolveSafeUpstreamErrorMessage", () => {
    it("returns fallback for empty body", () => {
      expect(resolveSafeUpstreamErrorMessage("", 500)).toBe(
        "Upstream service error",
      );
      expect(resolveSafeUpstreamErrorMessage("", 400)).toBe(
        "Unable to process request",
      );
    });

    it("extracts message from JSON", () => {
      const body = JSON.stringify({ message: "Custom Error" });
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe("Custom Error");
    });

    it("extracts error from JSON if message missing", () => {
      const body = JSON.stringify({ error: "Auth Fail" });
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe("Auth Fail");
    });

    it("sanitizes and truncates plain text body", () => {
      const longBody = "A".repeat(300);
      const result = resolveSafeUpstreamErrorMessage(longBody, 400);
      expect(result).toHaveLength(283); // 280 + ...
      expect(result.endsWith("...")).toBe(true);
    });

    it("sanitizes whitespace in plain text", () => {
      const body = "Line 1\nLine 2\tEnd";
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe(
        "Line 1 Line 2 End",
      );
    });

    it("handles malformed JSON by treating as plain text", () => {
      const body = "{ invalid json";
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe("{ invalid json");
    });

    it("handles no environment variables", () => {
      const targets = buildEgressTargets();
      // Should only have the 'direct' target from getEgressConfig fallback if URLs are missing
      expect(
        targets.every((t) => t.name !== "primary" && t.name !== "secondary"),
      ).toBe(true);
    });

    it("extracts error from JSON if message missing or empty", () => {
      const body = JSON.stringify({ error: "Auth Fail", message: "  " });
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe("Auth Fail");
    });

    it("returns sanitized plain text if JSON has no known fields", () => {
      const body = JSON.stringify({ other: "data" });
      expect(resolveSafeUpstreamErrorMessage(body, 400)).toBe(
        '{"other":"data"}',
      );
    });

    it("handles missing AWS environment variables", () => {
      vi.stubEnv("AWS_SECONDARY_URL", "");
      const targets = buildEgressTargets();
      expect(targets.find((t) => t.name === "secondary")).toBeUndefined();
    });

    it("handles missing AWS secondary secret", () => {
      vi.stubEnv("AWS_SECONDARY_URL", "https://aws.proxy");
      vi.stubEnv("AWS_SECONDARY_SECRET", "");
      const targets = buildEgressTargets();
      const aws = targets.find((t) => t.name === "secondary");
      expect(aws?.proxyHeaders).toEqual({});
    });

    it("returns fallback for sanitized empty body", () => {
      expect(resolveSafeUpstreamErrorMessage("   ", 400)).toBe(
        "Unable to process request",
      );
    });

    it("returns fallback for HTML response bodies", () => {
      const htmlBody1 =
        "<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1></body></html>";
      expect(resolveSafeUpstreamErrorMessage(htmlBody1, 500)).toBe(
        "Upstream service error",
      );

      const htmlBody2 = "<html><body>Error</body></html>";
      expect(resolveSafeUpstreamErrorMessage(htmlBody2, 400)).toBe(
        "Unable to process request",
      );

      const htmlBody3 = '  <div class="error">Something went wrong</div>';
      expect(resolveSafeUpstreamErrorMessage(htmlBody3, 400)).toBe(
        "Unable to process request",
      );
    });
  });
});
