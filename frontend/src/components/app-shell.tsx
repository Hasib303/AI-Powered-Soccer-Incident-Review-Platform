import Link from "next/link";
import {
  Activity,
  CalendarRange,
  ListChecks,
  MonitorPlay,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/lib/database.types";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = { href: string; label: string; icon: LucideIcon };

const OFFICIAL_NAV: NavItem[] = [
  { href: "/official/assignments", label: "My Assignments", icon: CalendarRange },
  { href: "/official/matches/new", label: "New Match", icon: Plus },
];

const VIEWER_NAV: NavItem[] = [
  { href: "/viewer", label: "Match History", icon: CalendarRange },
];

export function AppShell({
  role,
  displayName,
  children,
  matchHref,
}: {
  role: UserRole;
  displayName: string | null;
  children: React.ReactNode;
  /** When viewing a specific match, surface its quick links in the sidebar. */
  matchHref?: { console?: string; incidents?: string };
}) {
  const nav = role === "viewer" ? VIEWER_NAV : OFFICIAL_NAV;

  return (
    <div className="grid min-h-dvh grid-cols-[260px_1fr] bg-bg">
      <aside className="flex flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
            <Activity className="size-5" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Atlético Intel</p>
            <p className="text-[11px] text-text-dim capitalize">
              {role === "viewer" ? "Team viewer" : "Match official"}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim/70">
            Navigation
          </p>
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-dim hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {matchHref ? (
            <>
              <p className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim/70">
                Current match
              </p>
              <ul className="flex flex-col gap-1">
                {matchHref.console ? (
                  <li>
                    <Link
                      href={matchHref.console}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-dim hover:bg-surface-2 hover:text-text"
                    >
                      <MonitorPlay className="size-4" />
                      Live Console
                    </Link>
                  </li>
                ) : null}
                {matchHref.incidents ? (
                  <li>
                    <Link
                      href={matchHref.incidents}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-dim hover:bg-surface-2 hover:text-text"
                    >
                      <ListChecks className="size-4" />
                      Incidents Log
                    </Link>
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="leading-tight">
              <p className="text-sm font-medium">
                {displayName ?? (role === "viewer" ? "Coach" : "Official")}
              </p>
              <Badge tone={role === "viewer" ? "neutral" : "primary"}>
                {role === "viewer" ? "Viewer" : role === "admin" ? "Admin" : "On Duty"}
              </Badge>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex flex-col">{children}</main>
    </div>
  );
}
