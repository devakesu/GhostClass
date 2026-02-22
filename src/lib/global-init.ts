"use client";

import { useUserSettings } from "@/providers/user-settings";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function GlobalInit() {
  const { settings } = useUserSettings();

  useEffect(() => {
    if (settings) {
      // Enrich Sentry error reports with user preferences for better debugging context
      Sentry.setContext("user_preferences", { ...settings });
    }
  }, [settings]);

  return null;
}