"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    let errToCapture: Error;
    if (error instanceof Error) {
      errToCapture = error;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error
    ) {
      errToCapture = new Error(
        String((error as { message?: unknown }).message),
      );
    } else {
      errToCapture = new Error(String(error));
    }

    logger.error(
      "[dashboard] Render error:",
      errToCapture.message,
      error?.digest,
    );
    Sentry.captureException(errToCapture, {
      tags: {
        location: "dashboard",
        digest: error?.digest,
      },
    });
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
