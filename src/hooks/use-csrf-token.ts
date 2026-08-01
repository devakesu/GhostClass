"use client";

import { useEffect, useRef } from "react";
import axios from "@/lib/axios";
import { getCsrfToken, setCsrfToken } from "@/lib/axios";
import { logger } from "@/lib/logger";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
export const CSRF_LAST_INIT_KEY_PREFIX = "csrf_last_init_";
export const CSRF_LAST_INIT_KEY = `${CSRF_LAST_INIT_KEY_PREFIX}${APP_VERSION}`;
const CSRF_REINIT_INTERVAL_MS = 30 * 60 * 1000;

let csrfInitPromise: Promise<void> | null = null;

async function initializeCsrfToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  if (isCsrfFresh()) {
    return getCsrfToken();
  }

  if (csrfInitPromise) {
    try {
      await csrfInitPromise;
    } catch {
      logger.dev("CSRF promise rejected");
    }
    const token = getCsrfToken();
    if (token) return token;
  }

  csrfInitPromise = (async () => {
    try {
      const response = await axios.get("/api/csrf", {
        baseURL: "",
        withCredentials: true,
      });

      if (response.status >= 200 && response.status < 300) {
        handleInitResponse(response.data);
      }
    } catch (error) {
      logger.error("CSRF init failed", error);
      throw error;
    } finally {
      csrfInitPromise = null;
    }
  })();

  try {
    await csrfInitPromise;
  } catch (err) {
    logger.dev("CSRF wait failed", err);
  }

  return getCsrfToken();
}

function isCsrfFresh(): boolean {
  const existingToken = getCsrfToken();
  if (!existingToken) return false;

  try {
    const lastInit = sessionStorage.getItem(CSRF_LAST_INIT_KEY);
    if (!lastInit) return false;
    return Date.now() - parseInt(lastInit, 10) < CSRF_REINIT_INTERVAL_MS;
  } catch (e) {
    logger.dev?.("sessionStorage check failed", e);
    return false;
  }
}

function cleanupStaleKeys() {
  try {
    const items = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        key.startsWith(CSRF_LAST_INIT_KEY_PREFIX) &&
        key !== CSRF_LAST_INIT_KEY
      ) {
        items.push(key);
      }
    }
    items.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    logger.dev?.("Cleanup failed", e);
  }
}

function handleInitResponse(data: unknown) {
  if (
    data && typeof data === "object" && "token" in data &&
    typeof data.token === "string"
  ) {
    setCsrfToken(data.token);
  }
  cleanupStaleKeys();
  try {
    sessionStorage.setItem(CSRF_LAST_INIT_KEY, Date.now().toString());
  } catch (e) {
    logger.dev?.("sessionStorage write failed", e);
  }
}

export function useCSRFToken() {
  const hasInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const performInit = async () => {
      if (typeof window === "undefined" || hasInitialized.current) return;
      hasInitialized.current = true;

      try {
        await initializeCsrfToken();
        if (!isMounted) return;
      } catch (err) {
        logger.dev("CSRF wait failed", err);
      }
    };

    void performInit();
    return () => {
      isMounted = false;
    };
  }, []);
}

export async function ensureCSRFToken(): Promise<string | null> {
  return initializeCsrfToken();
}
