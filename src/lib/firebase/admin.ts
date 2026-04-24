import { logger } from "@/lib/logger";

export interface DecodedAppCheckToken {
  appId: string;
}

export interface AppCheckVerifier {
  verifyToken(
    token: string,
    options?: { consume?: boolean },
  ): Promise<DecodedAppCheckToken>;
}

/**
 * Compatibility shim for environments where Firebase Admin App Check is not initialized.
 * Callers are expected to gracefully fall back when this returns null.
 */
export function getAppCheck(): AppCheckVerifier | null {
  logger.warn("Firebase Admin App Check is not configured in this environment");
  return null;
}
