"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/login/actions";

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => signOutAction())}
      className="justify-start gap-2"
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
