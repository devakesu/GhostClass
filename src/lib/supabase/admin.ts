// Shared Supabase Admin client factory
// src/lib/supabase/admin.ts

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { _customFetch, getSupabaseConfig } from "./fetch";

/**
 * Creates a Supabase admin client using the service role key.
 * NEVER use this on the client side — the service role key bypasses Row Level Security.
 * Only call from server-side code (API routes, server actions).
 */
export function getAdminClient() {
  const { url, key } = getSupabaseConfig("admin");

  if (!url || !key) {
    throw new Error("Missing Supabase Admin credentials");
  }

  return createClient(
    url,
    key,
    _customFetch ? { global: { fetch: _customFetch } } : undefined,
  );
}
