import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Holder Supabase-session-cookien frisk på admin-stier. Dette er det eneste
// sted vi må skrive cookies under en navigation (Server Components må ikke).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Trigger en evt. token-refresh og persistér de opdaterede cookies.
  await supabase.auth.getUser();

  return response;
}

// Vision 3.0 Fase 1B (Issue #65, Model B): kundeåbninger registreres
// cookie-frit direkte i src/app/[bookingId]/page.tsx — bevidst INGEN
// matcher for kundesider her. Se docs/VISION-3.0-EVENT-MODEL.md §4/§8 for
// hvorfor det ikke kræver en middleware-udvidelse (den forkastede
// cookie-model gjorde). Udvid IKKE denne matcher til kundesider uden at
// genåbne den beslutning eksplicit.
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
