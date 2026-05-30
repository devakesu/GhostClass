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
const isTest = process.env.VITEST === "true";

function buildStructuredPayload(level: string, args: unknown[]) {
  const timestamp = new Date().toISOString();

  let meta: unknown = null;
  const message = typeof args[0] === "string" ? String(args[0]) : "";

  if (args.length > 0) {
    if (typeof args[0] === "string") {
      if (args.length > 1) meta = args.slice(1);
    } else if (args.length === 1) {
      // single non-string argument — treat as meta
      meta = args[0];
    } else {
      meta = args;
    }
  }

  const payload: Record<string, unknown> = {
    ts: timestamp,
    level,
  };
  if (message) payload.msg = message;
  if (meta !== null) payload.meta = meta;
  return JSON.stringify(payload);
}

export const logger = {
  dev: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isTest) return;
    if (process.env.NODE_ENV === 'production') {
      console.warn(buildStructuredPayload('warn', args));
    } else {
      console.warn(...args);
    }
  },

  error: (...args: unknown[]) => {
    if (isTest) return;
    if (process.env.NODE_ENV === 'production') {
      console.error(buildStructuredPayload('error', args));
    } else {
      console.error(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'production') {
      console.info(buildStructuredPayload('info', args));
    } else {
      console.info(...args);
    }
  },
};
