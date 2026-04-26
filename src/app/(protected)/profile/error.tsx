"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[profile] Render error:", error.message, error.digest);
    Sentry.captureException(error, {
      tags: {
        location: "profile",
        digest: error.digest,
      },
    });
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
