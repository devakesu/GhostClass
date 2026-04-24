// Auth token management utilities
// src/lib/auth.ts
import { createClient } from "@/lib/supabase/client";
import * as Sentry from "@sentry/nextjs";

const deleteClientCookie = (name: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const handleLogout = async () => {
  const supabase = createClient();
  
  try {
    // 1. Sign out from Supabase (Server-side session)
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // 2. Clear Local Storage (Client-side cache)
    if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
    }

    // 3. Clear Cookies
    await fetch("/api/logout", { method: "POST" }); // Clear auth token
    deleteClientCookie("terms_version"); // Clear legal acceptance
    
    // 4. Redirect
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }

  } catch (error) {
    console.error("Logout failed:", error);
    
    // Capture the error but don't trap the user
    Sentry.captureException(error, { 
        tags: { type: "logout_failure", location: "handleLogout" } 
    });

    // Force redirect anyway so user isn't stuck on a broken page
    if (typeof window !== "undefined") {
      // Best-effort cleanup of known app cookies; HttpOnly cookies cannot be cleared client-side
      await fetch("/api/logout", { method: "POST" });
      deleteClientCookie("terms_version");
      window.location.href = "/";
    }
  }
};
