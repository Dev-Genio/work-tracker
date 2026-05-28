import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import ReportBuilder from "./report-builder";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const user = await requirePageUser();
  if (!user) redirect("/sign-in");
  return (
    <AppShell user={user}>
      <ReportBuilder />
    </AppShell>
  );
}
