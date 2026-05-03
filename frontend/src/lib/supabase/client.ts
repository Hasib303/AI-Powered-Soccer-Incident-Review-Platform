"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for use in Client Components.
 *
 * Don't call this at the module top level — call inside a component or hook
 * so the cookie store is the per-request one and not a stale singleton on
 * the server during build.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
