import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/auth";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unique Travel · Administration",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) {
    return <AdminLogin />;
  }
  return <AdminDashboard userEmail={user.email ?? ""} />;
}
