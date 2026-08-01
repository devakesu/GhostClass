"use client";

import { useUserSettings } from "@/providers/user-settings";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function GlobalInit() {
  const { settings } = useUserSettings();

  useEffect(() => {
    // Remove the pre-hydration spinner overlay now that React has mounted.
    // The element is SSR'd into the initial HTML so it's visible during the
    // JS parse + hydration gap; removing it here reveals the real app shell.
    document.getElementById("prehyd-loader")?.remove();
  }, []);

  useEffect(() => {
    if (settings) {
      // Enrich Sentry error reports with user preferences for better debugging context
      Sentry.setContext("user_preferences", { ...settings });
    }
  }, [settings]);

  return null;
}
