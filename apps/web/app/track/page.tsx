import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import Tracker from "./tracker";

export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const user = await requireUser();
  if (!user) redirect("/sign-in");
  return (
    <AppShell user={user}>
      <Tracker />
    </AppShell>
  );
}
