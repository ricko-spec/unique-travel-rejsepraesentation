import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-klient (anon-nøgle, cookie-baseret — deler session med serverens
// createSessionClient i ./auth.ts). Bruges KUN hvor auth-tokens udelukkende
// findes i browseren, fx recovery-linkets URL-hash på reset-password-siden.
// Service-role hører til i ./server.ts og må ALDRIG bruges her.
export function createBrowserSupabase(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
