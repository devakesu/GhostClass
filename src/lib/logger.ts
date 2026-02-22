// Development-aware logging utility
// src/lib/logger.ts

/**
 * Logger utility that respects NODE_ENV to prevent verbose logging in production
 * 
 * Usage:
 * - logger.dev(): Development-only logs (suppressed in production)
 * - logger.info(): Important production events (always logged via console.info)
 * - logger.warn(): Warnings (always logged, suppressed in test)
 * - logger.error(): Errors (always logged, suppressed in test)
 * 
 * NOTE: The isDevelopment check is evaluated once at module load time.
 * If NODE_ENV changes at runtime (uncommon but possible in certain deployment scenarios),
 * the logger behavior will not update until the process restarts. This is intentional
 * for performance and is the expected behavior in standard Node.js applications where
 * NODE_ENV is set before the application starts and remains constant.
 */

const isDevelopment = process.env.NODE_ENV === 'development';
// Detect test environment via the VITEST env var (set automatically by Vitest runner).
// NOTE: vitest.config.ts sets NODE_ENV='development' (not 'test') so we use VITEST instead.
const isTest = !!process.env.VITEST;

export const logger = {
  /**
   * Development-only logging
   * Suppressed in production to keep logs clean
   */
  dev: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Warning messages - always logged (suppressed in test to avoid noisy CI output)
   * Use for non-critical issues that should be investigated
   */
  warn: (...args: any[]) => {
    if (!isTest) console.warn(...args);
  },

  /**
   * Error messages - always logged (suppressed in test to avoid noisy CI output)
   * Use for errors that need immediate attention
   */
  error: (...args: any[]) => {
    if (!isTest) console.error(...args);
  },

  /**
   * Info messages - always logged for important production events
   * Uses console.info (semantically distinct from logger.dev/console.log)
   */
  info: (...args: any[]) => {
    console.info(...args);
  },
};
