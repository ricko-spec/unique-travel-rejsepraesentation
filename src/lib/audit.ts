import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// Typed union så en tastefejl i et action-navn fanges af compileren i stedet
// for at ende som en ny, usøgbar kategori i audit_log (Fable DATA-2).
export type AuditAction =
  | "unlock_success"
  | "unlock_failed"
  | "unlock_rate_limited"
  | "intro_edited"
  | "login_success"
  | "login_failed"
  | "login_rate_limited"
  | "password_changed"
  | "password_change_failed"
  | "password_change_rate_limited"
  | "destination_image_uploaded";

export type AuditEntry = {
  // "admin:{email}" for sælgere, "customer:{slug}" for kunder
  actor: string;
  action: AuditAction;
  resource: string;
  metadata?: Record<string, unknown>;
};

// IP (første hop i x-forwarded-for) + user-agent for den aktuelle request.
// Virker i både route handlers og server actions.
export function requestMeta(): { ip: string; userAgent: string | null } {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    userAgent: h.get("user-agent"),
  };
}

// Best-effort audit-logning: må ALDRIG blokere eller vælte den handling der
// auditeres (konsistent med fail-open-princippet for rate limiting).
// Kræver en service-role-klient — audit_log har kun service_role-policy.
export async function writeAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { ip, userAgent } = requestMeta();
    const { error } = await supabase.from("audit_log").insert({
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      ip,
      user_agent: userAgent,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error(`[audit] ${entry.action} insert error:`, error);
  } catch (e) {
    console.error(`[audit] ${entry.action} insert threw:`, e);
  }
}
