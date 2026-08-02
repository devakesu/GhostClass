// Auth token management utilities
// src/lib/security/auth.ts
import { createClient } from "@/lib/supabase/client";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { safeResponseJson } from "@/lib/json";

export const isAuthSessionMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const msg = (Object.prototype.hasOwnProperty.call(error, "message"))
    ? String((error as { message?: unknown }).message)
    : "";
  const lower = msg.toLowerCase();
  return lower.includes("session missing") || lower.includes("auth session");
};

export const isSupabaseLockTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const msg = (Object.prototype.hasOwnProperty.call(error, "message"))
    ? String((error as { message?: unknown }).message)
    : "";
  const lower = msg.toLowerCase();
  return (
    lower.includes("navigator lockmanager") ||
    lower.includes("exclusive navigator lockmanager lock") ||
    (lower.includes("timed out") && lower.includes("auth-token"))
  );
};

async function fetchFreshCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await safeResponseJson<{ token: string }>(res);
    return (data && Object.prototype.hasOwnProperty.call(data, "token"))
      ? String(data.token)
      : null;
  } catch (err) {
    logger.error("[auth] CSRF fetch failed", err);
    return null;
  }
}

async function callLogoutApi(token: string | null) {
  let t = token;
  if (!t) t = await fetchFreshCsrfToken();
  if (!t) {
    logger.warn("[auth] No CSRF for logout");
    return;
  }

  try {
    const res = await fetch("/api/logout", {
      method: "POST",
      headers: { "x-csrf-token": t },
    });
    if (res.status === 403) {
      const fresh = await fetchFreshCsrfToken();
      if (fresh) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "x-csrf-token": fresh },
        });
      }
    }
  } catch (e) {
    logger.error("[auth] Logout API error", e);
  }
}

function clearClientState() {
  if (typeof window !== "undefined") {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  }
}

export const handleLogout = async (csrfToken?: string | null) => {
  const supabase = createClient();
  let token: string | null = csrfToken ?? null;

  try {
    if (!token && typeof window !== "undefined") {
      const { getCsrfToken: getToken } = await import("@/lib/axios");
      token = getToken();
    }

    await supabase.auth.signOut({ scope: "local" });
    await callLogoutApi(token);
    clearClientState();
  } catch (error) {
    logger.error("Logout failed", error);
    Sentry.captureException(error, { tags: { location: "handleLogout" } });
    await callLogoutApi(token);
    clearClientState();
  }
};
