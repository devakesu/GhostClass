export const PUBLIC_PATHS = new Set<string>([
  "auth/login",
  "auth/register",
  "auth/forgot-password",
  "institution/public",
]);

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_ERROR_BODY_LOG_LENGTH = 1_000;
export const RETRYABLE_UPSTREAM_STATUSES = new Set<number>([429, 500, 502, 503, 504]);
