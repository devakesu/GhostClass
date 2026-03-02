// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
const isProd = process.env.NODE_ENV === "production";

const replayRate = isProd
  ? Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_RATE ?? 0)
  : 0.1;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: replayRate > 0 ? [Sentry.replayIntegration()] : [],

  tracesSampleRate: isProd ? 0.1 : 1,

  replaysSessionSampleRate: replayRate,
  replaysOnErrorSampleRate: Math.min(1, Math.max(0, replayRate * 5)),

  sendDefaultPii: false,
});

export const onRouterTransitionStart = () => {
  const sentryWithHook = Sentry as unknown as {
    captureRouterTransitionStart?: () => void;
  };

  sentryWithHook.captureRouterTransitionStart?.();
};
