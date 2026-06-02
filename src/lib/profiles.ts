import { createSessionClient } from "./supabase/auth";
import { getSupabaseService } from "./supabase/server";
import type { Trip } from "./types";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  advisor_match_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = {
  full_name: string;
  phone: string;
  advisor_match_name: string;
};

// Henter den indloggede brugers egen profil. RLS sikrer self-only.
export async function getOwnProfile(): Promise<Profile | null> {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[profiles] getOwnProfile", error);
    return null;
  }
  return (data as Profile | null) ?? null;
}

// Opdaterer den indloggede brugers egen profil (kun de tre redigerbare felter).
// Profil-rækken oprettes automatisk af on_auth_user_created-triggeren ved signup,
// så her er en ren UPDATE tilstrækkelig.
export async function updateOwnProfile(
  update: ProfileUpdate,
): Promise<{ ok: true; profile: Profile | null } | { ok: false; status: number; error: string }> {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Ikke logget ind" };

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: update.full_name,
      phone: update.phone,
      advisor_match_name: update.advisor_match_name,
    })
    .eq("id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[profiles] updateOwnProfile", error);
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, profile: (data as Profile | null) ?? null };
}

// Slår trip.advisor (navnet fra TravelWire-PDF'en) op i profiles.advisor_match_name
// (case-insensitivt) og kopierer email + phone ind på trip'en. Bruger service-role,
// fordi RLS ellers kun ville give adgang til den indloggede brugers egen profil.
// Ingen match → felterne sættes til null + en warning logges.
export async function enrichAdvisorContact(trip: Trip): Promise<Trip> {
  const advisor = (trip.advisor ?? "").trim();
  if (!advisor) {
    return { ...trip, advisorEmail: null, advisorPhone: null };
  }

  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("profiles")
      .select("email, phone, advisor_match_name")
      .ilike("advisor_match_name", advisor)
      .limit(1);

    if (error) {
      console.warn(`[enrichAdvisorContact] Opslag fejlede for "${advisor}": ${error.message}`);
      return { ...trip, advisorEmail: null, advisorPhone: null };
    }

    const match = data?.[0] as { email: string | null; phone: string | null } | undefined;
    if (!match) {
      console.warn(
        `[enrichAdvisorContact] Ingen profil matcher advisor "${advisor}" (booking ${trip.bookingNo}) — advisorEmail/advisorPhone sat til null.`,
      );
      return { ...trip, advisorEmail: null, advisorPhone: null };
    }

    return {
      ...trip,
      advisorEmail: match.email ?? null,
      advisorPhone: match.phone ?? null,
    };
  } catch (e) {
    console.warn(`[enrichAdvisorContact] Uventet fejl for "${advisor}":`, e);
    return { ...trip, advisorEmail: null, advisorPhone: null };
  }
}
