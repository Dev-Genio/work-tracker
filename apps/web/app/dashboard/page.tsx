import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import Today from "./today";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (!user) redirect("/sign-in");

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Pick a range or use the heatmap to spot patterns over time.
        </p>
      </div>
      <Today />
    </AppShell>
  );
}
