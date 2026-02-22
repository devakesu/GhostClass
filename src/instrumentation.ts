import * as Sentry from "@sentry/nextjs";
import { validateEnvironment } from "@/lib/validate-env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables at runtime (not during build)
    const nextPhase = process.env.NEXT_PHASE;
    const isBuildPhase =
      nextPhase === "phase-production-build" ||
      nextPhase === "phase-development-build";

    if (!isBuildPhase) {
      validateEnvironment();
    }
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
