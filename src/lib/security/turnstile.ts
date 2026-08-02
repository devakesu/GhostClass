// src/lib/security/turnstile.ts
import { logger } from "@/lib/logger";

/**
 * Verifies a Cloudflare Turnstile CAPTCHA token.
 */
export async function verifyTurnstile(
  token: string,
  failedErrorMessage = "CAPTCHA validation failed. Are you a robot?",
): Promise<{ success: boolean; error?: string }> {
  if (!token) {
    return {
      success: false,
      error: "Security verification failed. Please refresh.",
    };
  }

  try {
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      },
    );
    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      logger.warn("Turnstile verification failed", { verifyData });
      return { success: false, error: failedErrorMessage };
    }
    return { success: true };
  } catch (err) {
    logger.error("Turnstile verification exception", err);
    return {
      success: false,
      error: "Security check failed. Please check your connection.",
    };
  }
}
