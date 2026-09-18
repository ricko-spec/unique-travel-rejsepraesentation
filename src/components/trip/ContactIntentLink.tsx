"use client";

import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from "react";
import { trackContactIntent } from "@/lib/contact-intent-client";
import type { ContactChannel } from "@/lib/contact-intent";

// Vision 3.0 Fase 3 (Issue #73) — kontakt-intent på faktiske mailto:/tel:-
// links. Al beslutningslogik (dedup, fetch med keepalive, fejl-sanitering)
// ligger i src/lib/contact-intent-client.ts og er unit-testet; denne fil er
// bevidst EKSTREMT tynd.
//
// DEDUP-SCOPE — hvorfor en provider og IKKE en module-level Set: en
// module-level Set lever, så længe JS-modulet lever, dvs. på tværs af Next.js
// client-side navigation. Har kunden en soft-navigation væk fra og tilbage til
// rejseplanen (eller til en anden rejseplan) i samme browser-session, ville et
// klik i det nye "besøg" fejlagtigt blive dedup'et mod det gamle. Providerens
// Set lever i en ref, der følger selve kundesidens komponent-træ (monteres
// forfra ved hver sidevisning) og nulstilles desuden eksplicit hvis `slug`
// skifter. Semantikken er derfor "pr. page load" — også under Next-navigation.
// UDELUKKENDE in-memory: ingen cookie, ingen localStorage, ingen sessionStorage.
type Track = (channel: ContactChannel) => void;

const ContactIntentContext = createContext<Track | null>(null);

export function ContactIntentProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const state = useRef<{ slug: string; track: Track } | null>(null);
  if (state.current === null || state.current.slug !== slug) {
    const sent = new Set<ContactChannel>();
    state.current = {
      slug,
      track: (channel) => {
        trackContactIntent({ sent, channel, slug });
      },
    };
  }
  return (
    <ContactIntentContext.Provider value={state.current.track}>
      {children}
    </ContactIntentContext.Provider>
  );
}

/**
 * Et helt normalt <a>. Klik-handleren kalder KUN track() som side-effect —
 * ingen preventDefault(), ingen stopPropagation(), ingen await. Browseren
 * navigerer til mailto:/tel: præcis som uden tracking, uanset om
 * analytics-requesten lykkes, fejler eller aldrig sendes. Uden en
 * ContactIntentProvider (fx i en isoleret test) er linket stadig et almindeligt
 * anker — bare uden tracking.
 */
export function ContactIntentLink({
  channel,
  href,
  className,
  style,
  "aria-label": ariaLabel,
  children,
}: {
  channel: ContactChannel;
  href: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const track = useContext(ContactIntentContext);
  return (
    <a
      href={href}
      className={className}
      style={style}
      aria-label={ariaLabel}
      onClick={() => track?.(channel)}
    >
      {children}
    </a>
  );
}
