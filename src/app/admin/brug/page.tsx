import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth";
import { AnalyseTabs } from "./AnalyseTabs";
import { parseAnalyseTab } from "./analyse-tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brugsoverblik · Unique Travel",
  robots: { index: false, follow: false },
};

// Issue #92: samlet analyseområde (ruten /admin/brug bevares). Samme adgangskrav
// som før: uden session ⇒ tilbage til /admin (login). Fanen vælges fra
// ?visning=kunder|brug|konvertering (standard: kunder).
export default async function BrugPage({ searchParams }: { searchParams?: { visning?: string | string[] } }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin");

  return (
    <div className="admin-shell">
      <div className="admin-wrap">
        <div className="admin-header">
          <div>
            <div className="admin-title">Brugsoverblik</div>
            <div className="admin-sub">Analyse · kundeadfærd, intern brug og konvertering</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link className="admin-btn admin-btn-secondary" href="/admin">
              Til administration
            </Link>
          </div>
        </div>
        <AnalyseTabs initialTab={parseAnalyseTab(searchParams?.visning)} />
      </div>
    </div>
  );
}
