import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { getOwnProfile } from "@/lib/profiles";
import { ProfileEditor } from "./ProfileEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Min profil · Unique Travel",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin");

  const profile = await getOwnProfile();

  return <ProfileEditor email={user.email ?? ""} initialProfile={profile} />;
}
