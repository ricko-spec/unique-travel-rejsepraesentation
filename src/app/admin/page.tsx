import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unique Travel · Administration",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  if (!isAdminAuthenticated()) {
    return <AdminLogin />;
  }
  return <AdminDashboard />;
}
