import { logger } from "./logger";

/**
 * Safely parses a JSON string.
 * Returns null if parsing fails or input is empty, instead of throwing.
 */
export function safeJsonParse<T>(text: string | null | undefined): T | null {
  if (!text || text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    logger.warn("safeJsonParse: failed to parse JSON", { error, preview: text.slice(0, 100) });
    return null;
  }
}

/**
 * Safely reads and parses a Response body as JSON.
 * Handles empty bodies and non-JSON content gracefully.
 */
export async function safeResponseJson<T>(res: Response): Promise<T | null> {
  try {
    // Support mocks that only provide .json() and not .text()
    if (typeof res.text !== "function" && typeof (res as any).json === "function") {
      return await (res as any).json();
    }
    const text = await res.text();
    return safeJsonParse<T>(text);
  } catch (error) {
    logger.warn("safeResponseJson: failed to read response body", error);
    return null;
  }
}
