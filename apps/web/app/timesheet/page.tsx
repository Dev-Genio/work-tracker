import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import Timesheet from "./timesheet";

export const dynamic = "force-dynamic";

export default async function TimesheetPage() {
  const user = await requirePageUser();
  if (!user) redirect("/sign-in");
  return (
    <AppShell user={user}>
      <Timesheet />
    </AppShell>
  );
}
