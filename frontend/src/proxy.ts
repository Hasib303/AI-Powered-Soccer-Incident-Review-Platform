import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const PUBLIC_PATHS = new Set(["/", "/login"]);

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSupabaseSession(request);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(path);

  // Authenticated users on /login → bounce to their role landing.
  if (user && (path === "/" || path === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/official/assignments";
    return NextResponse.redirect(url);
  }

  // Anonymous users on app routes → /login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every page route except Next.js internals and static files.
     * Server Action POSTs route through the same matcher so the session
     * is always fresh for mutations.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
