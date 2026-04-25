import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { _customFetch } from "./fetch";

/**
 * Creates a Supabase server client with cookie-based session management.
 * For use in Server Components, Server Actions, and Route Handlers.
 * 
 * Features:
 * - Automatic cookie handling for session persistence
 * - Environment variable validation with Sentry reporting
 * - Graceful handling of Server Component cookie writes
 * 
 * @returns Configured Supabase server client
 * @throws {Error} If Supabase environment variables are missing
 * 
 * @example
 * ```ts
 * const supabase = await createClient();
 * const { data } = await supabase.from('users').select();
 * ```
 */
export async function createClient() {
  const cookieStore = await cookies();
  
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Use development overrides if present
  if (process.env.NODE_ENV === "development") {
    if (process.env.NEXT_PUBLIC_SUPABASE_DEV_URL && process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY) {
      url = process.env.NEXT_PUBLIC_SUPABASE_DEV_URL;
      key = process.env.NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY;
    } else {
      // Environment Guard: Alert developer if production URL is leaking into development
      import("@/lib/logger").then(({ logger }) => {
        logger.warn(
          "[Supabase Security] Production URL detected in development! ⚠️",
          `\nTarget: ${url}\nEnsure NEXT_PUBLIC_SUPABASE_DEV_URL and NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY are correctly configured.`
        );
      });
    }
  }

  if (!url || !key) {
      const error = new Error("Supabase Environment Variables missing in Server Client");
      Sentry.captureException(error, { tags: { type: "config_critical", location: "createClient" } });
      throw error;
  }

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // The 'setAll' method was called from a Server Component.
            // This can be ignored if you have middleware refreshing the session.
            if (process.env.NODE_ENV === 'development') {
                logger.warn(`Supabase cookie set ignored (Server Component context) - This is usually normal. Error: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        },
      },
      ...(_customFetch ? { global: { fetch: _customFetch } } : {})
    }
  );
}