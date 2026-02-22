/**
 * Tests for Analytics API Route
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/analytics", () => ({
  trackGA4Event: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ratelimit", () => ({
  syncRateLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("192.168.1.1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Analytics API Route", () => {
  const createMockRequest = (body: any): NextRequest => {
    return {
      json: async () => body,
      headers: new Headers({
        "x-forwarded-for": "192.168.1.1",
      }),
    } as NextRequest;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Request Validation", () => {
    it("should accept valid analytics request", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",  // Valid format: timestamp.random
        events: [
          {
            name: "page_view",
            params: { page_location: "https://example.com" },
          },
        ],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should reject request without client ID", async () => {
      const req = createMockRequest({
        events: [{ name: "page_view" }],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid clientId");
    });

    it("should reject request with invalid clientId format", async () => {
      const req = createMockRequest({
        clientId: "invalid-format",  // Should be timestamp.random format
        events: [{ name: "page_view" }],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid clientId format");
    });

    it("should reject request without events", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid request body");
    });

    it("should reject request with non-array events", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: "not-an-array",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid request body");
    });
  });

  describe("Event Validation", () => {
    it("should reject events with invalid name format", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          {
            name: "Invalid Event Name!", // Contains spaces and special chars
            params: {},
          },
        ],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain("Internal server error");
    });

    it("should accept valid event names", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          { name: "page_view" },
          { name: "button_click" },
          { name: "form_submit" },
        ],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });

    it("should truncate long event names", async () => {
      const longName = "a".repeat(100); // Exceeds 40 char limit
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [{ name: longName }],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });

    it("should reject too many events per request", async () => {
      const events = Array(30).fill({ name: "test_event" }); // Exceeds 25 limit
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Too many events");
    });
  });

  describe("Event Parameter Sanitization", () => {
    it("should sanitize string parameters", async () => {
      const longString = "a".repeat(200); // Exceeds 100 char limit
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          {
            name: "test_event",
            params: {
              test_param: longString,
            },
          },
        ],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });

    it("should allow number and boolean parameters", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          {
            name: "test_event",
            params: {
              count: 42,
              is_active: true,
              price: 19.99,
            },
          },
        ],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });

    it("should filter out invalid parameter types", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          {
            name: "test_event",
            params: {
              valid_string: "test",
              valid_number: 123,
              invalid_object: { nested: "object" },
              invalid_array: [1, 2, 3],
            },
          },
        ],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
    
    it("should filter out NaN and Infinity values", async () => {
      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [
          {
            name: "test_event",
            params: {
              valid_number: 123,
              nan_value: NaN,
              infinity_value: Infinity,
              negative_infinity: -Infinity,
            },
          },
        ],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Rate Limiting", () => {
    it("should return 429 when rate limit exceeded", async () => {
      const { syncRateLimiter } = await import("@/lib/ratelimit");
      vi.mocked(syncRateLimiter.limit).mockResolvedValueOnce({
        success: false,
        limit: 10,
        remaining: 0,
        reset: Date.now() + 10000,
        pending: Promise.resolve(),
      });

      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [{ name: "test_event" }],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain("Rate limit exceeded");
    });
  });

  describe("IP Handling", () => {
    it("should reject request when IP cannot be determined", async () => {
      const { getClientIp } = await import("@/lib/utils.server");
      vi.mocked(getClientIp).mockReturnValueOnce(null);

      const req = createMockRequest({
        clientId: "1234567890.abcdefghi",
        events: [{ name: "test_event" }],
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Unable to determine client IP");
    });
  });
});
