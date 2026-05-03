import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import "server-only";

/**
 * Supabase client for use inside Server Components, Server Actions, and
 * Route Handlers. Refresh of the session cookie is handled by the proxy
 * (`src/proxy.ts`); here we still provide `setAll` so server actions that
 * call `signInWithPassword` / `signOut` can persist updated tokens.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `cookies().set` throws when called from a Server Component.
            // The proxy already refreshes the session cookie for ordinary
            // GET requests, so this branch only matters when a Server
            // Action or Route Handler is mid-mutation — which is fine.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server-side operations that need to
 * bypass RLS (e.g. writing the AI payload back to an incident the user
 * just created). Never import this from a Client Component.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";

export function createSupabaseServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local before using the service-role client.",
    );
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
