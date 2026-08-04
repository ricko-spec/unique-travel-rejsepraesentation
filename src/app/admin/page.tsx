import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/auth";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unique Travel · Administration",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { reset?: string };
}) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <AdminLogin
        notice={
          searchParams?.reset === "ok"
            ? "Din adgangskode er ændret. Log ind med din nye adgangskode."
            : null
        }
      />
    );
  }
  return <AdminDashboard userEmail={user.email ?? ""} />;
}
