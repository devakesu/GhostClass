"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ErrorFallback } from "@/components/error-fallback";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Custom Error Page for client-side errors
 * Catches errors that occur during rendering in client components
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[root] Render error:", error.message, error.digest);
    Sentry.captureException(error, {
      tags: {
        location: "error.tsx",
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      
      <main className="flex-1">
        <ErrorFallback error={error} reset={reset} homeUrl="/" />
      </main>

      <Footer />
    </div>
  );
}
