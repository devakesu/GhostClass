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

const isDevelopment = process.env.NODE_ENV === "development";
// Detect test environment via the VITEST env var (set automatically by Vitest runner).
const isTest = process.env.VITEST === "true";

export function formatError(err: unknown): unknown {
  if (
    err instanceof Error ||
    (typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string" &&
      "name" in err &&
      typeof (err as { name: unknown }).name === "string")
  ) {
    const errorObj: Record<string, unknown> = {
      name: (err as Error).name || "Error",
      message: (err as Error).message,
    };
    if ((err as Error).stack) {
      errorObj.stack = (err as Error).stack;
    }
    if (
      "cause" in (err as Error) &&
      (err as { cause?: unknown }).cause !== undefined
    ) {
      const cause = (err as { cause?: unknown }).cause;
      errorObj.cause = formatError(cause);
    }
    const ignoredKeys = new Set([
      "__proto__",
      "constructor",
      "prototype",
      "name",
      "message",
      "stack",
      "cause",
    ]);
    for (const prop of Object.getOwnPropertyNames(err)) {
      if (!ignoredKeys.has(prop)) {
        Object.defineProperty(errorObj, prop, {
          value: Reflect.get(err as object, prop),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return errorObj;
  }
  return err;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (
        v instanceof Error ||
        (typeof v === "object" &&
          v !== null &&
          "message" in v &&
          typeof (v as { message: unknown }).message === "string" &&
          "name" in v &&
          typeof (v as { name: unknown }).name === "string")
      ) {
        return formatError(v);
      }
      return v;
    });
  } catch {
    return '"[unserializable]"';
  }
}

function extractMeta(args: unknown[]): unknown {
  if (args.length === 0) return null;
  if (typeof args[0] === "string") {
    if (args.length === 2) return formatError(args[1]);
    if (args.length > 2) return args.slice(1).map(formatError);
    return null;
  }
  if (args.length === 1) return formatError(args[0]);
  return args.map(formatError);
}

export function buildStructuredPayload(level: string, args: unknown[]) {
  const timestamp = new Date().toISOString();
  const meta = extractMeta(args);
  let message = typeof args[0] === "string" ? String(args[0]) : "";

  if (
    !message &&
    meta &&
    typeof meta === "object" &&
    "message" in meta &&
    typeof (meta as { message: unknown }).message === "string"
  ) {
    message = (meta as { message: string }).message;
  }

  const payload: Record<string, unknown> = {
    ts: timestamp,
    level,
  };
  if (message) payload.msg = message;
  if (meta !== null) payload.meta = meta;
  return safeStringify(payload);
}

export type LogEntry = {
  level: "dev" | "info" | "warn" | "error";
  args: unknown[];
};
export const testLogs: LogEntry[] = [];

/**
 * Resets captured test logs.
 */
export function clearTestLogs(): void {
  testLogs.length = 0;
}

export const logger = {
  dev: (...args: unknown[]) => {
    if (isTest) {
      testLogs.push({ level: "dev", args });
    }
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isTest) {
      testLogs.push({ level: "warn", args });
      return;
    }
    if (process.env.NODE_ENV === "production") {
      console.warn(buildStructuredPayload("warn", args));
    } else {
      console.warn(...args);
    }
  },

  error: (...args: unknown[]) => {
    if (isTest) {
      testLogs.push({ level: "error", args });
      return;
    }
    if (process.env.NODE_ENV === "production") {
      console.error(buildStructuredPayload("error", args));
    } else {
      console.error(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (isTest) {
      testLogs.push({ level: "info", args });
    }
    if (process.env.NODE_ENV === "production") {
      console.info(buildStructuredPayload("info", args));
    } else {
      console.info(...args);
    }
  },
};
