// src/lib/redis.ts
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

/**
 * Creates a Redis client with validated environment variables
 * @throws {Error} If required environment variables are missing
 */
function createRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL is not defined. " +
      "Please add it to your .env file."
    );
  }
  
  if (!token) {
    throw new Error(
      "UPSTASH_REDIS_REST_TOKEN is not defined. " +
      "Please add it to your .env file."
    );
  }
  
  return new Redis({ url, token });
}

/**
 * Singleton Redis client instance
 * Initialized on first access
 */
let redisInstance: Redis | null = null;

/**
 * Get the singleton Redis client
 * Creates the client on first call, then returns the cached instance
 * 
 * @returns {Redis} The Redis client instance
 * @example
 * ```typescript
 * import { getRedis } from '@/lib/redis';
 * 
 * const redis = getRedis();
 * await redis.set('key', 'value');
 * ```
 */
export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisClient();
    
    if (process.env.NODE_ENV === 'development') {
      logger.dev('[Redis] Client initialized successfully');
    }
  }
  
  return redisInstance;
}

/**
 * Reset the Redis client (useful for testing)
 * @internal
 */
export function __resetRedisClient(): void {
  redisInstance = null;
}

/**
 * Default export for convenience - uses lazy initialization
 * Usage: import redis from '@/lib/redis'
 *
 * The proxy always resolves through getRedis() so every access shares the
 * same singleton instance.
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value = client[prop as keyof Redis];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});