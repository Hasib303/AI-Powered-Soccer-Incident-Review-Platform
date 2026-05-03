import { Activity } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Activity className="size-5" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-base font-semibold leading-none">
              Atlético Intelligence
            </p>
            <p className="text-xs text-text-dim">
              Single-camera incident review
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use the demo official or viewer account you created in Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-text-dim">
          Demo accounts: <span className="font-mono">official@…</span> or{" "}
          <span className="font-mono">viewer@…</span>
        </p>
      </div>
    </main>
  );
}
