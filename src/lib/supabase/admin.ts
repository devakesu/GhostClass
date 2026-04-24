// Shared Supabase Admin client factory
// src/lib/supabase/admin.ts

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { _customFetch } from "./fetch";

/**
 * Creates a Supabase admin client using the service role key.
 * NEVER use this on the client side — the service role key bypasses Row Level Security.
 * Only call from server-side code (API routes, server actions).
 */
export function getAdminClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Use development overrides if present
  if (process.env.NODE_ENV === "development") {
    if (process.env.NEXT_PUBLIC_SUPABASE_DEV_URL) {
      url = process.env.NEXT_PUBLIC_SUPABASE_DEV_URL;
    }
    if (process.env.SUPABASE_DEV_SECRET_KEY) {
      key = process.env.SUPABASE_DEV_SECRET_KEY;
    }
  }

  if (!url || !key) {
    throw new Error("Missing Supabase Admin credentials");
  }

  return createClient(url, key, _customFetch ? { global: { fetch: _customFetch } } : undefined);
}
