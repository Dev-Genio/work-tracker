"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "signin" | "signup";

export default function SignInPage() {
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  async function withGoogle() {
    setBusy("google");
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
    } catch (e) {
      setBusy(null);
      toast.error(extractMsg(e));
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy("email");
    try {
      const res =
        tab === "signin"
          ? await authClient.signIn.email({
              email,
              password,
              callbackURL: "/dashboard",
            })
          : await authClient.signUp.email({
              email,
              password,
              name: name || email.split("@")[0],
              callbackURL: "/dashboard",
            });
      // Better Auth returns { data, error } rather than throwing.
      const err = (res as { error?: { message?: string } | null } | undefined)?.error;
      if (err) {
        toast.error(err.message ?? "Authentication failed");
        setBusy(null);
        return;
      }
      // On success it usually redirects via callbackURL; fall back if not.
      window.location.href = "/dashboard";
    } catch (err) {
      setBusy(null);
      toast.error(extractMsg(err));
    }
  }

  return (
    <main className="min-h-svh grid place-items-center px-4 py-10 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="flex items-center gap-2 font-semibold justify-center">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          work-tracker
        </Link>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4">
                <EmailForm
                  tab="signin"
                  email={email}
                  password={password}
                  name={name}
                  setEmail={setEmail}
                  setPassword={setPassword}
                  setName={setName}
                  onSubmit={withEmail}
                  busy={busy === "email"}
                />
              </TabsContent>
              <TabsContent value="signup" className="mt-4">
                <EmailForm
                  tab="signup"
                  email={email}
                  password={password}
                  name={name}
                  setEmail={setEmail}
                  setPassword={setPassword}
                  setName={setName}
                  onSubmit={withEmail}
                  busy={busy === "email"}
                />
              </TabsContent>
            </Tabs>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-card px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <Button
              onClick={withGoogle}
              disabled={busy === "google"}
              variant="outline"
              size="lg"
              className="w-full"
            >
              {busy === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </Button>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Your OpenRouter key never leaves your browser.
        </p>
      </div>
    </main>
  );
}

function EmailForm({
  tab, email, password, name, setEmail, setPassword, setName, onSubmit, busy,
}: {
  tab: Tab;
  email: string;
  password: string;
  name: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  setName: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {tab === "signup" && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={tab === "signin" ? "current-password" : "new-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {tab === "signup" && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {tab === "signin" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.92h5.45c-.24 1.4-1.66 4.1-5.45 4.1-3.28 0-5.96-2.72-5.96-6.07s2.68-6.07 5.96-6.07c1.87 0 3.13.8 3.85 1.48l2.62-2.52C16.83 3.51 14.65 2.5 12 2.5 6.97 2.5 2.9 6.57 2.9 11.6S6.97 20.7 12 20.7c6.93 0 9.5-4.87 9.5-7.4 0-.5-.06-.88-.13-1.26L12 12v-1.8z"/>
      <path fill="#4285F4" d="M21.5 12.18c0-.69-.06-1.2-.2-1.78H12v3.6h5.45c-.24 1.4-1.66 4.1-5.45 4.1v3.4c3.17 0 5.83-1.05 7.77-2.85 1.98-1.83 3.13-4.52 3.13-7.47z"/>
      <path fill="#FBBC05" d="M5.5 11.6c0-.7.12-1.36.32-1.98V6.13H2.36A9.7 9.7 0 0 0 1.5 11.6c0 1.56.38 3.04 1.04 4.34l3.13-2.42a5.86 5.86 0 0 1-.17-1.92z"/>
      <path fill="#34A853" d="M12 5.98c1.87 0 3.13.8 3.85 1.48l2.62-2.52C16.83 3.51 14.65 2.5 12 2.5 8.27 2.5 5.06 4.62 3.46 7.65l3.13 2.42C7.38 7.54 9.5 5.98 12 5.98z"/>
    </svg>
  );
}

function extractMsg(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
  }
  return String(e);
}
