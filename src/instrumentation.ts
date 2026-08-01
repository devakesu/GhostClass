import { validateEnvironment } from "./lib/validate-env.ts";

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
    await import("./instrumentation-server.ts");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./instrumentation-edge.ts");
  }
}

// captureRequestError is a first-class export in Sentry v10+ and matches the
// exact signature Next.js expects for the onRequestError instrumentation hook.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
