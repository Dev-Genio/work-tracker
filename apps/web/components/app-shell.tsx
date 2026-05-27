"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarRange,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/track", label: "Track", icon: Activity },
  { href: "/timesheet", label: "Timesheet", icon: CalendarRange },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/chat", label: "Ask", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({
  user,
  children,
}: {
  user: { id: string; email?: string; name?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="flex">
        <DesktopSidebar />
        <main className="flex-1 min-w-0">
          <TopBar user={user} />
          <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 h-svh flex-col">
      <Brand />
      <Separator />
      <NavList />
    </aside>
  );
}

function TopBar({ user }: { user: { email?: string; id: string } }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-background/70 border-b">
      <div className="h-14 px-4 md:px-8 flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <Brand />
            <Separator />
            <NavList />
          </SheetContent>
        </Sheet>
        <div className="md:hidden font-semibold">work-tracker</div>
        <div className="flex-1" />
        <div className="text-sm text-muted-foreground truncate max-w-[40ch]">
          {user.email ?? user.id}
        </div>
      </div>
    </header>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-4 h-14 font-semibold tracking-tight">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </span>
      work-tracker
    </Link>
  );
}

function NavList() {
  const pathname = usePathname();
  return (
    <nav className="p-2 flex flex-col gap-0.5">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
