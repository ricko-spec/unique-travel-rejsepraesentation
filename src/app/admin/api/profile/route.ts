import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnProfile, updateOwnProfile } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getOwnProfile();
  if (!profile) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  return NextResponse.json({ profile });
}

const patchSchema = z.object({
  full_name: z.string().max(200).optional().default(""),
  phone: z.string().max(50).optional().default(""),
  advisor_match_name: z.string().max(200).optional().default(""),
});

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldige data" }, { status: 400 });
  }

  const res = await updateOwnProfile({
    full_name: parsed.data.full_name.trim(),
    phone: parsed.data.phone.trim(),
    advisor_match_name: parsed.data.advisor_match_name.trim(),
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return NextResponse.json({ profile: res.profile });
}
