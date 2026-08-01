import * as Sentry from "@sentry/nextjs";
import { getMessaging } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { redact } from "@/lib/utils";

export interface SendPushNotificationProps {
  /** Secure FCM device token */
  token: string;
  /** Notification title */
  title: string;
  /** Notification body description */
  body: string;
  /** Optional extra key-value payload data */
  data?: Record<string, string>;
}

export interface PushNotificationResult {
  /** Whether the notification was successfully dispatched */
  success: boolean;
  /** Unique message ID returned by FCM upon successful dispatch */
  messageId?: string;
  /** Error message details if dispatch failed */
  error?: string;
}

function sanitizePayload(
  data?: Record<string, string>,
): Record<string, string> {
  if (!data) return {};
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const codeVal = (error as Record<string, unknown>).code;
    return typeof codeVal === "string" ? codeVal : undefined;
  }
  return undefined;
}

function isTerminalError(code?: string): boolean {
  return code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered";
}

/**
 * Dispatches a secure push notification via Firebase Cloud Messaging (FCM).
 * Integrates error tracking and logging with redacting to protect device identifiers.
 *
 * @param props - Push notification parameters (token, title, body, data)
 * @returns Promise resolving to dispatch execution result
 */
export async function sendPushNotification({
  token,
  title,
  body,
  data,
}: SendPushNotificationProps): Promise<PushNotificationResult> {
  const messaging = getMessaging();

  if (!messaging) {
    const errorMsg =
      "Firebase Messaging service is not available or unconfigured";
    logger.warn(`[push] ${errorMsg}`);
    Sentry.captureMessage(errorMsg, {
      level: "warning",
      tags: {
        type: "push_service_unavailable",
        location: "sendPushNotification",
      },
    });
    return { success: false, error: errorMsg };
  }

  try {
    const sanitizedData = sanitizePayload(data);

    const messageId = await messaging.send({
      token,
      notification: {
        title,
        body,
      },
      data: sanitizedData,
      android: {
        priority: "high",
        notification: {
          channelId: "high_importance_channel",
        },
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: "default",
          },
        },
      },
    });

    logger.dev(
      `[push] Successfully dispatched notification. Message ID: ${messageId}`,
    );
    return { success: true, messageId };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error
      ? error.message
      : "Unknown push dispatch failure";
    const safeToken = redact("id", token);

    logger.error(
      `[push] Failed to send notification to token ${safeToken}:`,
      error instanceof Error ? error : errorMsg,
    );

    const errorCode = getErrorCode(error);
    const isTerminalTokenError = isTerminalError(errorCode);

    Sentry.captureException(error, {
      tags: {
        type: isTerminalTokenError ? "fcm_stale_token" : "fcm_dispatch_error",
        location: "sendPushNotification",
      },
      extra: {
        token_redacted: safeToken,
        title,
        error_code: errorCode,
      },
    });

    return { success: false, error: errorMsg };
  }
}
