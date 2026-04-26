"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";

export default function LegalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[legal] Render error:", error.message, error.digest);
    Sentry.captureException(error, {
      tags: {
        location: "legal",
        digest: error.digest,
      },
    });
  }, [error]);

  return <ErrorFallback error={error} reset={reset} homeUrl="/" />;
}
