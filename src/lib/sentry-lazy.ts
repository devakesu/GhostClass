export type SentryCaptureContext = {
  tags?: Record<string, string>;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  extra?: Record<string, unknown>;
};

export const captureSentryException = (
  error: unknown,
  context?: SentryCaptureContext,
) => {
  import("@sentry/nextjs")
    .then(({ captureException }) => captureException(error, context))
    .catch((importError) => {
      console.error(
        "[Sentry] Failed to load SDK for captureException:",
        importError,
      );
      console.error("[Sentry] Original error:", error);
    });
};

export const captureSentryMessage = (
  message: string,
  context?: SentryCaptureContext,
) => {
  import("@sentry/nextjs")
    .then(({ captureMessage }) => captureMessage(message, context))
    .catch((importError) => {
      console.error(
        "[Sentry] Failed to load SDK for captureMessage:",
        importError,
      );
      console.error("[Sentry] Original message:", message);
    });
};
