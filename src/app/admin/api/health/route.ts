import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  envDiagnostics,
  getSupabaseService,
  describeFetchError,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const env = envDiagnostics();
  let supabaseReachable = false;
  let supabaseError: string | null = null;

  try {
    const supabase = getSupabaseService();
    // Cheapest probe: HEAD-count against trips with limit 0.
    const { error } = await supabase
      .from("trips")
      .select("id", { count: "exact", head: true });
    if (error) {
      supabaseError = `${error.message}${error.code ? ` (${error.code})` : ""}`;
    } else {
      supabaseReachable = true;
    }
  } catch (e) {
    supabaseError = describeFetchError(e);
  }

  return NextResponse.json({
    env,
    supabaseReachable,
    supabaseError,
    nodeVersion: process.version,
  });
}
