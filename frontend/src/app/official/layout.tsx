import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function OfficialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("official", "admin");
  return (
    <AppShell role={session.profile.role} displayName={session.profile.display_name}>
      {children}
    </AppShell>
  );
}
