import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServer } from "@/lib/supabase/server";
import type { UserProfile, UserRole } from "@/lib/database.types";

export type AuthSession = {
  userId: string;
  email: string | null;
  profile: UserProfile;
};

/**
 * Confirm the request has a Supabase session AND a `users_profile` row,
 * fetching the role-specific landing data needed by every authenticated
 * page. Redirects to `/login` if anything is missing.
 */
export async function requireUser(): Promise<AuthSession> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("id, team_account_id, role, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle<UserProfile>();

  if (!profile) {
    // Authenticated but no profile row → seed missed this user. Send them
    // back to /login with a hint rather than crash deeper in the app.
    await supabase.auth.signOut();
    redirect("/login?next=/");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
  };
}

export async function requireRole(...allowed: UserRole[]): Promise<AuthSession> {
  const session = await requireUser();
  if (!allowed.includes(session.profile.role)) {
    if (session.profile.role === "viewer") redirect("/viewer");
    redirect("/official/assignments");
  }
  return session;
}
