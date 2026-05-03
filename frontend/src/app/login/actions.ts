"use server";

import { redirect } from "next/navigation";
import * as z from "zod";

import { createSupabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";

const SignInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  next: z.string().optional(),
});

export type SignInState =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  | undefined;

function landingPathFor(role: UserRole): string {
  if (role === "viewer") return "/viewer";
  return "/official/assignments";
}

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the errors below and try again.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, message: error?.message ?? "Sign-in failed." };
  }

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role: UserRole = (profile?.role as UserRole) ?? "official";
  const next = parsed.data.next?.startsWith("/") ? parsed.data.next : null;
  redirect(next ?? landingPathFor(role));
}

export async function signOutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
