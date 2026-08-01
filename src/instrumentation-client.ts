import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

const replayRate = isProd
  ? Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_RATE ?? 0)
  : 0.1;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: replayRate > 0 ? [Sentry.replayIntegration()] : [],

  // Define how likely traces are sampled. Update this value in production, or use tracesSampler
  // for greater control.
  tracesSampleRate: isProd ? 0.1 : 1,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: replayRate,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: Math.min(1, Math.max(0, replayRate * 5)),

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Security: Handle PII carefully
  sendDefaultPii: false,
});

/**
 * Capture router transitions (Sentry v8+ requirement for App Router)
 */
export const onRouterTransitionStart = (
  pathname: string,
  type: "push" | "replace",
) => {
  Sentry.captureRouterTransitionStart?.(pathname, type);
};
