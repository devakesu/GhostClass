"use client";

import { useMemo } from "react";

export interface BuildInfo {
  version: string;
  branch: string;
  commit: string;
  is_legacy: boolean;
  timestamp: string;
}

/**
 * Hook to provide build-time metadata to the client.
 * In a real environment, these are populated via process.env during build.
 */
export function useBuildInfo() {
  const buildInfo = useMemo<BuildInfo>(() => ({
    version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    branch: process.env.NEXT_PUBLIC_BRANCH || "main",
    commit: process.env.NEXT_PUBLIC_COMMIT || "test-commit",
    is_legacy: process.env.NEXT_PUBLIC_IS_LEGACY === "true",
    timestamp: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString(),
  }), []);

  return {
    buildInfo,
    isLoading: false,
    data: buildInfo, // compatibility with some components
  };
}
