import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import Today from "./today";

export default async function DashboardPage() {
  const session = await auth.getSession();
  if (!session) redirect("/sign-in");

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
            {session.user.email ?? session.user.id}
          </span>
        </div>
      </header>

      <Today />
    </main>
  );
}
