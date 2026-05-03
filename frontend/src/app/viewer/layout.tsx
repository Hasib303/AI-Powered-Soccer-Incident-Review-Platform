import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("viewer");
  return (
    <AppShell role="viewer" displayName={session.profile.display_name}>
      {children}
    </AppShell>
  );
}
