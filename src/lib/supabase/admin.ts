// Shared Supabase Admin client factory
// src/lib/supabase/admin.ts

import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase admin client using the service role key.
 * NEVER use this on the client side — the service role key bypasses Row Level Security.
 * Only call from server-side code (API routes, server actions).
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase Admin credentials");
  }

  return createClient(url, key);
}
