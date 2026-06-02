import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Session-bundet Supabase-klient (anon-nøgle). Bruger cookies til at holde på
// brugerens login-session. Til forskel fra getSupabaseService() i ./server.ts
// — som bruger service-role til data-adgang — handler denne klient KUN om auth
// og om hvem den indloggede bruger er.
export function createSessionClient(): SupabaseClient {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            // cookies().set() kaster i en Server Component (read-only kontekst).
            // Det er fint: token-refresh håndteres af middleware.ts. Læsning
            // (getUser) virker uanset.
          }
        },
      },
    },
  );
}

// Returnerer den indloggede bruger eller null. Sikker at kalde i en Server
// Component — den skriver ikke cookies (kun læser).
export async function getSessionUser(): Promise<User | null> {
  const {
    data: { user },
  } = await createSessionClient().auth.getUser();
  return user ?? null;
}
