// src/lib/redis.ts
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

/**
 * Creates a Redis client with validated environment variables
 * @throws {Error} If required environment variables are missing
 */
function createRedisClient(): Redis {
  // During unit tests (Vitest) we avoid making network calls to Upstash.
  // Provide a lightweight in-memory mock that implements the small subset
  // of Redis operations used by the application. This keeps tests hermetic
  // and avoids requiring real UPSTASH credentials in CI or local environments.
  if (process.env.VITEST === 'true') {
    const store = new Map<string, string>();
    const mock: Partial<Redis> = {
      get: <TData>(key: string): Promise<TData | null> => {
        return Promise.resolve(store.has(key) ? (store.get(key) as unknown as TData) : null);
      },
      set: <TData>(key: string, value: TData): Promise<"OK" | TData | null> => {
        store.set(key, String(value));
        return Promise.resolve('OK');
      },
      incr: (key: string): Promise<number> => {
        const cur = parseInt(store.get(key) ?? '0', 10) || 0;
        const next = cur + 1;
        store.set(key, String(next));
        return Promise.resolve(next);
      },
      decr: (key: string): Promise<number> => {
        const cur = parseInt(store.get(key) ?? '0', 10) || 0;
        const next = Math.max(0, cur - 1);
        store.set(key, String(next));
        return Promise.resolve(next);
      },
    };
    return mock as unknown as Redis;
  }
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  
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