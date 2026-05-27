"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AuthView } from "@neondatabase/auth-ui";
import { Card, CardContent } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="min-h-svh grid place-items-center px-4 py-10 bg-background">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" className="flex items-center gap-2 font-semibold justify-center">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          work-tracker
        </Link>
        <Card>
          <CardContent className="pt-6">
            <AuthView pathname="sign-in" />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-center">
          By signing in you agree to authorize OpenRouter API calls from your device. Your key never leaves the browser.
        </p>
      </div>
    </main>
  );
}
