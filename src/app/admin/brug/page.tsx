import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { UsageOverview } from "./UsageOverview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brugsoverblik · Unique Travel",
  robots: { index: false, follow: false },
};

export default async function BrugPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin");

  return <UsageOverview />;
}
