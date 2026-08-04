import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unique Travel · Ny adgangskode",
  robots: { index: false, follow: false },
};

// Landingsside for Supabase password-recovery-links. Al token-håndtering sker
// client-side i ResetPasswordForm — tokens ankommer i URL-hash'en, som
// serveren aldrig ser.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
