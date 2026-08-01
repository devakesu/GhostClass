import { logger } from "@/lib/logger";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck as getAdminAppCheck } from "firebase-admin/app-check";
import {
  getMessaging as getAdminMessaging,
  type Messaging,
} from "firebase-admin/messaging";

export interface DecodedAppCheckToken {
  appId: string;
  token?: Record<string, unknown>;
}

export interface AppCheckVerifier {
  verifyToken(
    token: string,
    options?: { consume?: boolean },
  ): Promise<DecodedAppCheckToken>;
}

/**
 * Initialize and return Firebase Admin App Check verifier
 * Returns null if Firebase Admin is not properly configured
 */
export function getAppCheck(): AppCheckVerifier | null {
  try {
    // Check if Firebase Admin is already initialized
    const firebaseApp = getApps().length > 0
      ? getApp()
      : initializeFirebaseAdmin();

    if (!firebaseApp) {
      logger.warn(
        "Firebase Admin App Check: Failed to initialize Firebase Admin",
      );
      return null;
    }

    return {
      async verifyToken(token: string) {
        try {
          const appCheckService = getAdminAppCheck(firebaseApp);
          const decodedToken = await appCheckService.verifyToken(token);
          return {
            appId: decodedToken.appId,
            token: decodedToken.token,
          };
        } catch (error) {
          logger.error("Firebase App Check token verification failed:", error);
          throw error;
        }
      },
    };
  } catch (error) {
    logger.error("Firebase Admin App Check initialization failed:", error);
    return null;
  }
}

/**
 * Initialize and return Firebase Admin Messaging service
 * Returns null if Firebase Admin is not properly configured
 */
export function getMessaging(): Messaging | null {
  try {
    const firebaseApp = getApps().length > 0
      ? getApp()
      : initializeFirebaseAdmin();

    if (!firebaseApp) {
      logger.warn(
        "Firebase Admin Messaging: Failed to initialize Firebase Admin",
      );
      return null;
    }

    return getAdminMessaging(firebaseApp);
  } catch (error) {
    logger.error("Firebase Admin Messaging initialization failed:", error);
    return null;
  }
}

/**
 * Initialize Firebase Admin SDK with service account credentials
 */
function initializeFirebaseAdmin() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    logger.warn("Firebase Admin: GOOGLE_SERVICE_ACCOUNT_JSON not configured");
    return null;
  }

  try {
    let credentials: Record<string, unknown>;

    if (serviceAccountJson.startsWith("{")) {
      credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    } else {
      credentials = JSON.parse(
        Buffer.from(serviceAccountJson, "base64").toString("utf-8"),
      ) as Record<string, unknown>;
    }

    const app = initializeApp({
      credential: cert(credentials),
      projectId: credentials.project_id as string,
    });

    logger.info("Firebase Admin SDK initialized successfully");
    return app;
  } catch (error) {
    logger.error("Firebase Admin initialization error:", error);
    return null;
  }
}
