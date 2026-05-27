import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import Today from "./today";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/sign-in");

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Today</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/track">Track</Link>
          <Link href="/timesheet">Timesheet</Link>
          <Link href="/chat">Ask</Link>
          <Link href="/settings">Settings</Link>
          <span style={{ color: "var(--muted)" }}>
            {user.email ?? user.id}
          </span>
        </div>
      </header>

      <Today />
    </main>
  );
}
