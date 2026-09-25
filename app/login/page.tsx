"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GrainBackdrop } from "@/components/shell/grain-backdrop";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/auth/gate";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    try {
      await api.auth.login(password);
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <Card className="bezel-core w-full max-w-sm gap-0 border-0 p-5">
      <Image
        src="/brand/wordmark.png"
        alt="Qalaa"
        width={90}
        height={22}
        priority
        style={{ height: 22, width: "auto" }}
        className="opacity-95"
      />
      <h1 className="font-display mt-4 text-[22px] leading-none text-text-1">
        Sign in
      </h1>
      <p className="mt-1.5 text-text-2">
        This Qalaa instance is password-protected.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-text-2">
          Password
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mono-data border-line bg-bg-2"
          />
        </label>
        <Button type="submit" disabled={busy || !password} className="w-fit">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <GrainBackdrop />
      <React.Suspense fallback={null}>
        <LoginForm />
      </React.Suspense>
    </main>
  );
}
