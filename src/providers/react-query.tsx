// React Query provider
// src/providers/react-query.tsx

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PropsWithChildren } from "react";
import { AttendanceSettingsProvider } from "./attendance-settings";

/**
 * React Query provider with pre-configured defaults for the application.
 * Wraps the app with QueryClientProvider and AttendanceSettingsProvider.
 * 
 * Query Configuration:
 * - Stale time: 3 minutes
 * - Garbage collection: 10 minutes
 * - Retry: 2 attempts
 * - Window focus refetch: Disabled globally; enabled per-query for time-sensitive data
 * - Reconnect refetch: Enabled globally (covers PWA offline→online transitions)
 * - Refetch interval: Disabled globally; time-sensitive queries (courses, attendance,
 *   tracking) set their own 60 s interval explicitly
 * 
 * @param children - Child components to wrap
 * @returns Configured React Query provider with attendance settings
 * 
 * @example
 * ```tsx
 * <ReactQueryProvider>
 *   <App />
 * </ReactQueryProvider>
 * ```
 */
export default function ReactQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 3 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            // Disable global window focus refetch to avoid performance issues.
            // Enable per-query for data that needs cross-device sync.
            refetchOnWindowFocus: false,
            // Always refetch when network reconnects (page coming back online).
            // Critical for PWA offline→online transitions.
            refetchOnReconnect: true,
            // No global background poll — each time-sensitive query (courses,
            // attendance, tracking) sets its own refetchInterval explicitly.
            // This avoids draining battery on slow-changing data (user, profile,
            // institutions, settings) that don't need frequent background refresh.
            refetchInterval: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AttendanceSettingsProvider>
        {children}
      </AttendanceSettingsProvider>
    </QueryClientProvider>
  );
}
