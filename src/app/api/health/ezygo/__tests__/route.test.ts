/**
 * Tests for EzyGo Health Check API Route
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies before importing the route
vi.mock("@/lib/ezygo-batch-fetcher", () => ({
  getRateLimiterStats: vi.fn(() => ({
    activeRequests: 2,
    queueLength: 5,
    maxConcurrent: 3,
    cacheSize: 12,
  })),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  ezygoCircuitBreaker: {
    getStatus: vi.fn(() => ({
      state: "CLOSED",
      failures: 0,
      isOpen: false,
      timeUntilReset: 0,
      successCount: 0,
    })),
  },
}));

describe("EzyGo Health Check API Route", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original NODE_ENV
    vi.unstubAllEnvs();
    if (originalNodeEnv !== undefined) {
      vi.stubEnv("NODE_ENV", originalNodeEnv);
    }
  });

  describe("Production Environment", () => {
    it("should return minimal payload in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
      expect(data).not.toHaveProperty("rateLimiter");
      expect(data).not.toHaveProperty("circuitBreaker");
      expect(data.status).toBe("degraded"); // degraded because queueLength > 0
    });

    it("should return minimal payload when NODE_ENV is unset", async () => {
      vi.stubEnv("NODE_ENV", "staging"); // Use a non-development/test value
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
      expect(data).not.toHaveProperty("rateLimiter");
      expect(data).not.toHaveProperty("circuitBreaker");
    });

    it("should return 200 status code when healthy in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "CLOSED",
        failures: 0,
        isOpen: false,
        timeUntilReset: 0,
        successCount: 0,
      });

      const { GET } = await import("../route");
      const response = await GET();

      expect(response.status).toBe(200);
    });
  });

  describe("Development Environment", () => {
    it("should return detailed payload in development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("rateLimiter");
      expect(data).toHaveProperty("circuitBreaker");
      
      // Verify rateLimiter structure
      expect(data.rateLimiter).toHaveProperty("activeRequests");
      expect(data.rateLimiter).toHaveProperty("queueLength");
      expect(data.rateLimiter).toHaveProperty("maxConcurrent");
      expect(data.rateLimiter).toHaveProperty("cacheSize");
      expect(data.rateLimiter).toHaveProperty("utilizationPercent");
      
      // Verify circuitBreaker structure
      expect(data.circuitBreaker).toHaveProperty("state");
      expect(data.circuitBreaker).toHaveProperty("failures");
      expect(data.circuitBreaker).toHaveProperty("isOpen");
    });

    it("should calculate utilization percentage correctly", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      // activeRequests = 2, maxConcurrent = 3, so utilization = 67%
      expect(data.rateLimiter.utilizationPercent).toBe(67);
    });
  });

  describe("Test Environment", () => {
    it("should return detailed payload in test", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("rateLimiter");
      expect(data).toHaveProperty("circuitBreaker");
    });
  });

  describe("HTTP Status Codes", () => {
    it("should return 503 when circuit breaker is open", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "OPEN",
        failures: 5,
        isOpen: true,
        timeUntilReset: 30,
        successCount: 0,
      });

      const { GET } = await import("../route");
      const response = await GET();

      expect(response.status).toBe(503);
      
      const data = await response.json();
      expect(data.status).toBe("unhealthy");
    });

    it("should return 200 when circuit breaker is closed", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "CLOSED",
        failures: 0,
        isOpen: false,
        timeUntilReset: 0,
        successCount: 0,
      });
      
      const { getRateLimiterStats } = await import("@/lib/ezygo-batch-fetcher");
      vi.mocked(getRateLimiterStats).mockReturnValue({
        activeRequests: 1,
        queueLength: 0,
        maxConcurrent: 3,
        cacheSize: 5,
      });

      const { GET } = await import("../route");
      const response = await GET();

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe("healthy");
    });

    it("should return correct status regardless of environment", async () => {
      // Test production with open circuit
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      // Re-import circuit breaker after resetModules to get the fresh mocked instance
      const { ezygoCircuitBreaker: prodCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(prodCircuitBreaker.getStatus).mockReturnValue({
        state: "OPEN",
        failures: 3,
        isOpen: true,
        timeUntilReset: 30,
        successCount: 0,
      });
      
      let { GET } = await import("../route");
      let response = await GET();
      expect(response.status).toBe(503);
      
      // Test development with open circuit
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      // Re-import circuit breaker after resetModules to get the fresh mocked instance
      const { ezygoCircuitBreaker: devCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(devCircuitBreaker.getStatus).mockReturnValue({
        state: "OPEN",
        failures: 3,
        isOpen: true,
        timeUntilReset: 30,
        successCount: 0,
      });
      
      ({ GET } = await import("../route"));
      response = await GET();
      expect(response.status).toBe(503);
    });
  });

  describe("Response Headers", () => {
    it("should include Cache-Control header", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();

      expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    });
  });

  describe("Status Logic", () => {
    it("should return 'unhealthy' when circuit is open", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "OPEN",
        failures: 5,
        isOpen: true,
        timeUntilReset: 30,
        successCount: 0,
      });

      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe("unhealthy");
    });

    it("should return 'degraded' when there is queue backlog", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      const { getRateLimiterStats } = await import("@/lib/ezygo-batch-fetcher");
      
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "CLOSED",
        failures: 0,
        isOpen: false,
        timeUntilReset: 0,
        successCount: 0,
      });
      
      vi.mocked(getRateLimiterStats).mockReturnValue({
        activeRequests: 2,
        queueLength: 5, // Has backlog
        maxConcurrent: 3,
        cacheSize: 10,
      });

      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe("degraded");
    });

    it("should return 'healthy' when circuit is closed and no backlog", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      
      const { ezygoCircuitBreaker } = await import("@/lib/circuit-breaker");
      const { getRateLimiterStats } = await import("@/lib/ezygo-batch-fetcher");
      
      vi.mocked(ezygoCircuitBreaker.getStatus).mockReturnValue({
        state: "CLOSED",
        failures: 0,
        isOpen: false,
        timeUntilReset: 0,
        successCount: 0,
      });
      
      vi.mocked(getRateLimiterStats).mockReturnValue({
        activeRequests: 1,
        queueLength: 0, // No backlog
        maxConcurrent: 3,
        cacheSize: 5,
      });

      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe("healthy");
    });
  });

  describe("Timestamp Format", () => {
    it("should return timestamp in ISO format", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      
      const { GET } = await import("../route");
      const response = await GET();
      const data = await response.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
