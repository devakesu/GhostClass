"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";

export default function LeaveApplicationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[leave-applications] Render error:", error.message, error.digest);
    Sentry.captureException(error, {
      tags: {
        location: "leave-applications",
        digest: error.digest,
      },
    });
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
