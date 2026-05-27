"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseService } from "@/lib/supabase/server";

export type UnlockResult = { error: string } | void;

export async function unlockTrip(
  slug: string,
  code: string,
): Promise<UnlockResult> {
  const cleanCode = (code || "").trim();
  if (!cleanCode) {
    return { error: "Indtast venligst en kode." };
  }

  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("trips")
    .select("booking_no")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return { error: "Rejsen kunne ikke findes. Tjek venligst linket." };
  }

  if (data.booking_no !== cleanCode) {
    return { error: "Forkert kode. Tjek venligst jeres email." };
  }

  cookies().set(`trip_access_${slug}`, data.booking_no, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/${slug}`,
    maxAge: 60 * 60 * 24 * 30, // 30 dage
  });

  redirect(`/${slug}`);
}
