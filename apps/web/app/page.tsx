"use client";

import Link from "next/link";
import { ArrowRight, Activity, GitCommit, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            work-tracker
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild><Link href="/sign-in">Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium bg-muted text-muted-foreground px-3 py-1 rounded-full mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Now with agentic RAG over your work history
        </div>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1]">
          Know what you actually worked on.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Captures your screen every few seconds, layers in git activity and running processes,
          and asks a free VLM what you were doing. Then lets you ask questions in plain English.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/sign-in">Sign in with Google <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="https://github.com/Dev-Genio/work-tracker" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </Button>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-4">
          <Feature icon={<Activity className="h-5 w-5" />} title="Always-on capture">
            getDisplayMedia in the browser, native screenshots in Tauri. Configurable cadence so you stay within free VLM quotas.
          </Feature>
          <Feature icon={<GitCommit className="h-5 w-5" />} title="Real context">
            On desktop we attach your gh commits, running processes, and CPU/memory snapshot to each batch. The VLM gets the full picture.
          </Feature>
          <Feature icon={<MessageSquare className="h-5 w-5" />} title="Ask anything">
            Multi-turn tool-calling agent — search logs, aggregate hours, fetch commits. Answers grounded in your real data.
          </Feature>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      </CardContent>
    </Card>
  );
}
