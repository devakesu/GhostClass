"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { useTheme } from "@/providers/theme";

/**
 * Centralized Toaster component with consistent configuration across the app.
 * Uses Sonner's default styling with richColors and bottom-right positioning.
 * `invert: true` globally inverts the toast color scheme so toasts always
 * contrast against the page (dark bg in light mode, light bg in dark mode).
 */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster 
      richColors 
      invert
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
    />
  );
}
