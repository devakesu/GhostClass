// src/lib/security/auth-lock.ts
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Distributed lock for institutional login synchronization.
 * Prevents race conditions when multiple devices attempt to log in with the
 * same institutional ID simultaneously.
 */

/**
 * Acquire a lock for a specific user ID.
 *
 * @param userId - Institutional User ID (e.g., random UUID or roll number)
 * @param ttlMs - Time-to-live for the lock in milliseconds
 * @returns A unique lock value if acquired, null otherwise
 */
export async function getAuthLock(
  userId: string,
  ttlMs: number = 30000,
): Promise<string | null> {
  const lockKey = `auth_lock:${userId}`;
  const lockValue = crypto.randomUUID();

  try {
    // NX: Only set if not exists, PX: Set expiry in ms
    // @ts-ignore - Upstash Redis 'set' signature supports NX and PX options
    const acquired = await redis.set(lockKey, lockValue, {
      nx: true,
      px: ttlMs,
    });

    if (acquired === "OK") {
      if (process.env.NODE_ENV === "development") {
        logger.dev(`[Auth-Lock] Acquired for ${userId}`);
      }
      return lockValue;
    }
    return null;
  } catch (err) {
    logger.error(`[Auth-Lock] Failed to acquire for ${userId}:`, err);
    return null;
  }
}

/**
 * Release a previously acquired lock.
 * Uses a Lua script for atomicity to ensure we only delete the lock if the value
 * matches our unique ID, preventing us from deleting someone else's lock if ours
 * has already expired.
 *
 * @param userId - Institutional User ID
 * @param lockValue - The unique value returned by getAuthLock
 */
export async function releaseAuthLock(
  userId: string,
  lockValue: string,
): Promise<boolean> {
  const lockKey = `auth_lock:${userId}`;

  try {
    // Atomic check-and-delete Lua script
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, [lockKey], [lockValue]);

    if (result === 1) {
      if (process.env.NODE_ENV === "development") {
        logger.dev(`[Auth-Lock] Released for ${userId}`);
      }
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[Auth-Lock] Failed to release for ${userId}:`, err);
    return false;
  }
}
