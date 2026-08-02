import { logger } from "./logger";

/**
 * Helper to safely parse EzyGo responses as JSON.
 * Standardizes strict parsing logic across sync.ts and ezygo-batch-fetcher.ts.
 *
 * @param res - The Response object to parse
 * @returns Parsed JSON value, raw text fallback, or null on failure
 */
export async function safeEzygoJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    const text = await res.text();
    if (!text || text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch (parseError) {
      // EzyGo occasionally returns naked (non-JSON) strings.
      // Preserve this legacy behavior for callers that can handle text payloads.
      logger.dev(
        "[ezygo] safeEzygoJson fallback to raw text payload",
        parseError,
      );
      return text as unknown as T;
    }
  } catch (err) {
    logger.warn("[ezygo] safeEzygoJson: failed to read response body:", err);
    return null;
  }
}
