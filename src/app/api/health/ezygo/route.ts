import { NextResponse } from "next/server";
import { getRateLimiterStats } from "@/lib/ezygo-batch-fetcher";
import { ezygoCircuitBreaker } from "@/lib/circuit-breaker";

/**
 * Health check endpoint for EzyGo API integration
 * Returns health status and timestamp in all environments.
 * In development/test, also returns detailed rate limiter and circuit breaker metrics.
 * 
 * GET /api/health/ezygo
 */
export async function GET() {
  const rateLimiterStats = getRateLimiterStats();
  const circuitBreakerStatus = ezygoCircuitBreaker.getStatus();
  
  const hasBacklog = rateLimiterStats.queueLength > 0;
  
  // Return HTTP 503 when circuit is open, 200 otherwise
  // Status payload indicates 'healthy', 'degraded', or 'unhealthy' for monitoring
  const status = circuitBreakerStatus.isOpen ? 'unhealthy' : 
                 hasBacklog ? 'degraded' : 
                 'healthy';
  
  // Only expose detailed metrics in non-production environments to avoid information disclosure
  // Default to production-safe behavior if NODE_ENV is not explicitly set to development/test
  const includeDetails = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  
  const basePayload = {
    status,
    timestamp: new Date().toISOString(),
  };
  
  const payload = includeDetails ? {
    ...basePayload,
    rateLimiter: {
      activeRequests: rateLimiterStats.activeRequests,
      queueLength: rateLimiterStats.queueLength,
      maxConcurrent: rateLimiterStats.maxConcurrent,
      cacheSize: rateLimiterStats.cacheSize,
      utilizationPercent: Math.round(
        (rateLimiterStats.activeRequests / rateLimiterStats.maxConcurrent) * 100
      ),
    },
    circuitBreaker: {
      state: circuitBreakerStatus.state,
      failures: circuitBreakerStatus.failures,
      isOpen: circuitBreakerStatus.isOpen,
    },
  } : basePayload;
  
  return NextResponse.json(payload, {
    status: circuitBreakerStatus.isOpen ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
