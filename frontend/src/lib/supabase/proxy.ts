import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresh the Supabase session on every request from `src/proxy.ts`.
 *
 * @supabase/ssr writes refreshed auth cookies onto the response; we have to
 * bridge those onto the actual `NextResponse` we return so the browser
 * receives them.
 */
export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching auth.getUser triggers a refresh if the access token is close to
  // expiry. We deliberately do not branch on the response — the proxy is for
  // session keep-alive, not authorization.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
