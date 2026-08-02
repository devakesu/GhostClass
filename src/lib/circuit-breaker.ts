/**
 * Circuit Breaker Pattern Implementation
 *
 * Protects the application from cascading failures when the EzyGo API is down
 * or experiencing issues. Uses three states:
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: API is failing, reject requests immediately (fail fast)
 * - HALF_OPEN: Testing if API has recovered
 *
 * Configuration:
 * - Opens after 3 consecutive failures
 * - Stays open for 60 seconds before attempting recovery
 * - Tests with 2 requests before closing
 *
 * ⚠️ DEPLOYMENT NOTE — IN-MEMORY STATE:
 * This implementation stores state in the Node.js module singleton (in-memory).
 * It works correctly for the current Docker-based deployment (`output: "standalone"`)
 * where a single persistent Node.js process handles all requests.
 *
 * If the app is ever deployed to a multi-instance or serverless platform (e.g., Vercel,
 * AWS Lambda, Kubernetes with >1 replica), each instance will have its own independent
 * circuit-breaker state, making the protection ineffective across instances.
 * In that scenario, circuit-breaker state should be migrated to Redis (which is already
 * available via `@/lib/redis`) using atomic INCR/SET operations.
 */

import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";
import { redis } from "./redis";
import { toError } from "@/lib/error-handling";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Custom error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Error that should not trigger circuit breaker (e.g., 4xx client errors)
 */
export class NonBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonBreakerError";
  }
}

/**
 * Error for upstream 5xx responses that should trip the circuit breaker
 * Carries response details so they can be properly proxied to the client
 */
export class UpstreamServerError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body: string,
    public headers?: Headers,
  ) {
    super(message);
    this.name = "UpstreamServerError";
  }
}

class CircuitBreaker {
  private localState: CircuitState = "CLOSED";
  private localFailures = 0;
  private localLastFailTime = 0;
  private localSuccessCount = 0;
  private localHalfOpenInFlight = 0;

  private lastRedisCheck = 0;
  private readonly redisCheckInterval = 5000; // 5 seconds

  // Conservative thresholds for single-IP deployment
  // Opens circuit after just 3 failures to protect against extended outages
  private readonly failureThreshold = 3; // Lower threshold for faster protection
  private readonly resetTimeout = 60000; // 60 seconds - longer wait for recovery
  private readonly halfOpenMaxRequests = 2; // Test with fewer requests

  private async getRedisValue<T>(
    key: string,
    parseFn: (val: string) => T,
    fallback: T,
  ): Promise<T> {
    try {
      const val = await redis.get(key);
      if (typeof val === "string") return parseFn(val);
      if (typeof val === "number") return parseFn(String(val));
    } catch (e) {
      logger.dev(`Redis error in circuit breaker for key ${key}`, e);
      Sentry.captureException(toError(e), {
        tags: { location: "circuit-breaker/getRedisValue", key },
      });
    }
    return fallback;
  }

  private async setRedisValue(
    key: string,
    value: string | number,
  ): Promise<void> {
    try {
      await redis.set(key, String(value));
    } catch (e) {
      logger.dev(`Redis error in circuit breaker set for key ${key}`, e);
      Sentry.captureException(toError(e), {
        tags: { location: "circuit-breaker/setRedisValue", key },
      });
    }
  }

  private async getState(): Promise<CircuitState> {
    const now = Date.now();
    if (
      this.localState === "CLOSED" &&
      now - this.lastRedisCheck < this.redisCheckInterval
    ) {
      return this.localState;
    }
    this.lastRedisCheck = now;
    const state = await this.getRedisValue(
      "circuit:state",
      (val) => val as CircuitState,
      this.localState,
    );
    this.localState = state;
    return state;
  }

  private async setState(state: CircuitState): Promise<void> {
    this.localState = state;
    this.lastRedisCheck = Date.now();
    await this.setRedisValue("circuit:state", state);
  }

  private getFailures(): Promise<number> {
    return this.getRedisValue(
      "circuit:failures",
      (val) => parseInt(val, 10),
      this.localFailures,
    );
  }

  private async setFailures(failures: number): Promise<void> {
    this.localFailures = failures;
    await this.setRedisValue("circuit:failures", failures);
  }

  private async incrFailures(): Promise<number> {
    this.localFailures++;
    try {
      return await redis.incr("circuit:failures");
    } catch (e) {
      logger.dev("Redis error in circuit breaker incr for failures", e);
      return this.localFailures;
    }
  }

  private getLastFailTime(): Promise<number> {
    return this.getRedisValue(
      "circuit:last_fail_time",
      (val) => parseInt(val, 10),
      this.localLastFailTime,
    );
  }

  private async setLastFailTime(time: number): Promise<void> {
    this.localLastFailTime = time;
    await this.setRedisValue("circuit:last_fail_time", time);
  }

  private async setSuccessCount(count: number): Promise<void> {
    this.localSuccessCount = count;
    await this.setRedisValue("circuit:success_count", count);
  }

  private async incrSuccessCount(): Promise<number> {
    this.localSuccessCount++;
    try {
      return await redis.incr("circuit:success_count");
    } catch (e) {
      logger.dev("Redis error in circuit breaker incr for success_count", e);
      return this.localSuccessCount;
    }
  }

  private async persistHalfOpenInFlight(): Promise<void> {
    await this.setRedisValue(
      "circuit:half_open_in_flight",
      this.localHalfOpenInFlight,
    );
  }

  private async decrHalfOpenInFlight(): Promise<number> {
    this.localHalfOpenInFlight = Math.max(0, this.localHalfOpenInFlight - 1);
    try {
      const res = await redis.decr("circuit:half_open_in_flight");
      if (res < 0) {
        await redis.set("circuit:half_open_in_flight", "0");
        return 0;
      }
      return res;
    } catch {
      return this.localHalfOpenInFlight;
    }
  }

  private async clearHalfOpenInFlight(): Promise<void> {
    try {
      await redis.set("circuit:half_open_in_flight", "0");
    } catch (error) {
      logger.dev(
        "Redis error in circuit breaker reset for half_open_in_flight",
        error,
      );
    }
    this.localHalfOpenInFlight = 0;
  }

  private async resetBreakerStateInRedis(): Promise<void> {
    try {
      if (typeof redis.mset === "function") {
        await redis.mset({
          "circuit:state": "CLOSED",
          "circuit:failures": "0",
          "circuit:last_fail_time": "0",
          "circuit:success_count": "0",
          "circuit:half_open_in_flight": "0",
        });
        return;
      }
    } catch (e) {
      logger.dev("Redis mset error in circuit breaker reset", e);
    }
    await Promise.all([
      redis.set("circuit:state", "CLOSED"),
      redis.set("circuit:failures", "0"),
      redis.set("circuit:last_fail_time", "0"),
      redis.set("circuit:success_count", "0"),
      redis.set("circuit:half_open_in_flight", "0"),
    ]);
  }

  private async enterHalfOpenIfNeeded(
    state: CircuitState,
  ): Promise<CircuitState> {
    if (state !== "OPEN") {
      return state;
    }

    const now = Date.now();
    const lastFailTime = await this.getLastFailTime();
    const timeSinceFailure = now - lastFailTime;

    if (timeSinceFailure <= this.resetTimeout) {
      const failures = await this.getFailures();
      const timeRemaining = Math.ceil(
        (this.resetTimeout - timeSinceFailure) / 1000,
      );
      logger.warn("[Circuit Breaker] Circuit is OPEN - failing fast", {
        context: "circuit-breaker",
        failures,
        timeRemaining: `${timeRemaining}s`,
      });
      throw new CircuitBreakerOpenError(
        `Circuit breaker is open - EzyGo API may be experiencing issues. Retry in ${timeRemaining}s.`,
      );
    }

    logger.dev("[Circuit Breaker] Transitioning to HALF_OPEN", {
      context: "circuit-breaker",
      timeSinceFailure,
    });
    await this.setState("HALF_OPEN");
    await this.setSuccessCount(0);
    await this.clearHalfOpenInFlight();
    return "HALF_OPEN";
  }

  private async handleBreakerError(error: unknown): Promise<never> {
    if (error instanceof NonBreakerError) {
      const currentState = await this.getState();
      const failures = await this.getFailures();
      if (currentState === "HALF_OPEN" || failures > 0) {
        await this.onSuccess();
      }
      throw error;
    }

    await this.onFailure(error);
    throw error;
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.enterHalfOpenIfNeeded(await this.getState());

    if (state === "HALF_OPEN") {
      const inFlight = this.localHalfOpenInFlight;
      if (inFlight >= this.halfOpenMaxRequests) {
        logger.warn(
          "[Circuit Breaker] HALF_OPEN request limit reached - rejecting request",
          {
            context: "circuit-breaker",
            halfOpenInFlight: inFlight,
            maxRequests: this.halfOpenMaxRequests,
          },
        );
        throw new CircuitBreakerOpenError(
          "Circuit breaker is testing recovery - please try again shortly.",
        );
      }
      this.localHalfOpenInFlight = inFlight + 1;
      await this.persistHalfOpenInFlight();
    }

    // Capture whether this request consumed a HALF_OPEN slot before entering the
    // try block. The finally block must use this snapshot — not this.state — because
    // onSuccess() may have already transitioned the breaker to CLOSED by the time
    // finally runs, which would cause the CLOSED-state branch to double-decrement.
    const wasHalfOpen = state === "HALF_OPEN";

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      return this.handleBreakerError(error);
    } finally {
      // Release HALF_OPEN slot only if this request actually claimed one.
      // Using the wasHalfOpen snapshot avoids double-decrement when onSuccess()
      // transitions the breaker to CLOSED before finally executes.
      if (wasHalfOpen) {
        await this.decrHalfOpenInFlight();
      }
    }
  }

  /**
   * Handle successful request
   */
  private async onSuccess(): Promise<void> {
    const state = await this.getState();
    if (state === "HALF_OPEN") {
      const successCount = await this.incrSuccessCount();
      logger.dev(
        `[Circuit Breaker] Success in HALF_OPEN (${successCount}/${this.halfOpenMaxRequests})`,
        {
          context: "circuit-breaker",
        },
      );

      // After successful requests in half-open, close the circuit
      if (successCount >= this.halfOpenMaxRequests) {
        logger.dev(
          "[Circuit Breaker] Transitioning to CLOSED - API recovered",
          {
            context: "circuit-breaker",
          },
        );
        await this.setState("CLOSED");
        await this.setFailures(0);
        await this.setSuccessCount(0);
        await this.clearHalfOpenInFlight();
      }
    } else {
      // Optimize: avoid a Redis read on every successful request by checking
      // the local mirror first. Successful requests are the common case when
      // the circuit is CLOSED and localFailures will typically be 0.
      if (this.localFailures === 0 && this.localLastFailTime === 0) return;

      // If local mirror indicates failures > 0, read authoritative value
      // from Redis and reset it if needed.
      const failures = await this.getFailures();
      if (failures > 0) {
        logger.dev("[Circuit Breaker] Resetting failure count", {
          context: "circuit-breaker",
          previousFailures: failures,
        });
        await this.setFailures(0);
      }
    }
  }

  /**
   * Handle failed request
   */
  private async onFailure(error: unknown): Promise<void> {
    const failures = await this.incrFailures();
    const now = Date.now();
    await this.setLastFailTime(now);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const state = await this.getState();

    if (state === "HALF_OPEN") {
      logger.warn(
        "[Circuit Breaker] Failure in HALF_OPEN - reopening circuit",
        {
          context: "circuit-breaker",
          error: errorMessage,
        },
      );
      await this.setState("OPEN");
      await this.setSuccessCount(0);
      await this.clearHalfOpenInFlight();
    } else if (failures >= this.failureThreshold) {
      logger.error("[Circuit Breaker] Threshold reached - opening circuit", {
        context: "circuit-breaker",
        failures,
        threshold: this.failureThreshold,
        error: errorMessage,
      });
      Sentry.captureMessage(
        "[Circuit Breaker] Circuit opened — EzyGo API failures exceeded threshold",
        {
          level: "error",
          extra: {
            failures,
            threshold: this.failureThreshold,
            error: errorMessage,
          },
        },
      );
      await this.setState("OPEN");
      await this.clearHalfOpenInFlight();
    } else {
      logger.warn("[Circuit Breaker] Request failed", {
        context: "circuit-breaker",
        failures,
        threshold: this.failureThreshold,
        error: errorMessage,
      });
    }
  }

  /**
   * Get current circuit breaker status (for monitoring).
   *
   * Status is read from Redis first so monitoring sees the authoritative
   * breaker state even after a process restart. Raw lastFailTime (Unix ms) is
   * omitted — it would leak information about when EzyGo last failed if this
   * object is ever surfaced via a health endpoint. timeUntilReset is the only
   * operationally useful derivative and carries no additional timing
   * information beyond what the client already knows.
   */
  async getStatus() {
    const [state, failures, lastFailTime, successCount] = await Promise.all([
      this.getState(),
      this.getFailures(),
      this.getLastFailTime(),
      this.getRedisValue(
        "circuit:success_count",
        (val) => parseInt(val, 10),
        this.localSuccessCount,
      ),
    ]);

    const timeUntilReset = state === "OPEN"
      ? Math.max(
        0,
        Math.ceil((this.resetTimeout - (Date.now() - lastFailTime)) / 1000),
      )
      : 0;
    return {
      state,
      failures,
      timeUntilReset,
      successCount,
      isOpen: state === "OPEN",
    };
  }

  /**
   * Manually reset the circuit breaker (for testing/admin purposes)
   */
  async reset(): Promise<void> {
    logger.dev("[Circuit Breaker] Manual reset", {
      context: "circuit-breaker",
    });
    this.localState = "CLOSED";
    this.localFailures = 0;
    this.localLastFailTime = 0;
    this.localSuccessCount = 0;
    this.localHalfOpenInFlight = 0;
    this.lastRedisCheck = 0;
    await this.resetBreakerStateInRedis().catch((error) => {
      logger.dev("Redis error in circuit breaker manual reset", error);
    });
  }
}

// Export singleton instance
export const ezygoCircuitBreaker = new CircuitBreaker();
