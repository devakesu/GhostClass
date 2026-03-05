"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Centralized Toaster component with consistent configuration across the app.
 * Uses Sonner's default styling with richColors and bottom-right positioning.
 * `invert: true` globally inverts the toast color scheme so toasts always
 * contrast against the page (dark bg in light mode, light bg in dark mode).
 */
export function Toaster() {
  return (
    <SonnerToaster 
      richColors 
      position="bottom-right"
      toastOptions={{ invert: true }}
    />
  );
}
