import { describe, it, expect } from "vitest";
import {
  shouldRecordTripVisit,
  isBotUserAgent,
  hasAdminAuthCookie,
  isProductionHost,
  VISIT_WINDOW_MINUTES,
  TRACKING_SINCE,
  type VisitDecisionInput,
} from "./trip-visit";

const REAL_CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REAL_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const REAL_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

const ADMIN_COOKIE = "sb-iunixfpthdftmkgpugex-auth-token";
const ADMIN_COOKIE_CHUNK_0 = "sb-iunixfpthdftmkgpugex-auth-token.0";
const ADMIN_COOKIE_CHUNK_1 = "sb-iunixfpthdftmkgpugex-auth-token.1";

function validInput(overrides: Partial<VisitDecisionInput> = {}): VisitDecisionInput {
  return {
    vercelEnv: "production",
    host: "rejseplaner.uniquetravel.dk",
    userAgent: REAL_CHROME_WINDOWS,
    cookieNames: ["trip_access_ab12cd34ef56"],
    ...overrides,
  };
}

describe("isBotUserAgent", () => {
  it("genkender navngivne bots/crawlere/link-previews", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("LinkedInBot/1.0")).toBe(true);
    expect(isBotUserAgent("Applebot/0.1")).toBe(true);
  });

  it("genkender scripting-/automation-værktøjer uden 'bot' i navnet", () => {
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent("python-requests/2.31.0")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120.0.0.0")).toBe(true);
    expect(isBotUserAgent("wget/1.21.4")).toBe(true);
  });

  it("behandler tom/manglende User-Agent som bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("   ")).toBe(true);
  });

  it("genkender IKKE ægte browser-UA'er som bots", () => {
    expect(isBotUserAgent(REAL_CHROME_WINDOWS)).toBe(false);
    expect(isBotUserAgent(REAL_SAFARI_IOS)).toBe(false);
    expect(isBotUserAgent(REAL_EDGE)).toBe(false);
  });
});

describe("hasAdminAuthCookie", () => {
  it("genkender den rigtige Supabase-auth-cookie", () => {
    expect(hasAdminAuthCookie([ADMIN_COOKIE])).toBe(true);
  });

  it("genkender chunkede varianter (.0, .1, ...)", () => {
    expect(hasAdminAuthCookie([ADMIN_COOKIE_CHUNK_0])).toBe(true);
    expect(hasAdminAuthCookie([ADMIN_COOKIE_CHUNK_1])).toBe(true);
    expect(hasAdminAuthCookie(["trip_access_x", ADMIN_COOKIE_CHUNK_0])).toBe(true);
  });

  it("giver false hvis kun trip_access-cookien findes", () => {
    expect(hasAdminAuthCookie(["trip_access_ab12cd34ef56"])).toBe(false);
  });

  it("giver false ved tom liste", () => {
    expect(hasAdminAuthCookie([])).toBe(false);
  });

  it("kræver at navnet starter med sb- og ender på -auth-token (evt. chunket)", () => {
    expect(hasAdminAuthCookie(["sb-foo"])).toBe(false);
    expect(hasAdminAuthCookie(["not-sb-iunixfpthdftmkgpugex-auth-token"])).toBe(false);
  });
});

describe("isProductionHost", () => {
  it("accepterer det kanoniske produktionsdomæne", () => {
    expect(isProductionHost("rejseplaner.uniquetravel.dk")).toBe(true);
  });

  it("er case-insensitivt (host-headere er det per HTTP-spec)", () => {
    expect(isProductionHost("Rejseplaner.UniqueTravel.dk")).toBe(true);
  });

  it("afviser en portsuffiks-variant i stedet for at antage den er kanonisk", () => {
    expect(isProductionHost("rejseplaner.uniquetravel.dk:8080")).toBe(false);
  });

  it("afviser Vercels branch-alias, selvom VERCEL_ENV der ER \"production\"", () => {
    expect(isProductionHost("unique-travel-rejsepraesentation-git-main-unique-travel.vercel.app")).toBe(
      false,
    );
  });

  it("afviser localhost", () => {
    expect(isProductionHost("localhost:3000")).toBe(false);
  });

  it("afviser null/tom streng", () => {
    expect(isProductionHost(null)).toBe(false);
    expect(isProductionHost("")).toBe(false);
  });
});

describe("shouldRecordTripVisit — sandhedstabel", () => {
  it("tillader tracking når alle fire betingelser er opfyldt", () => {
    expect(shouldRecordTripVisit(validInput())).toBe(true);
  });

  it("preview => false", () => {
    expect(shouldRecordTripVisit(validInput({ vercelEnv: "preview" }))).toBe(false);
  });

  it("development => false", () => {
    expect(shouldRecordTripVisit(validInput({ vercelEnv: "development" }))).toBe(false);
  });

  it("manglende VERCEL_ENV (lokal `next dev`) => false", () => {
    expect(shouldRecordTripVisit(validInput({ vercelEnv: undefined }))).toBe(false);
  });

  it("uventet/malformed VERCEL_ENV-værdi => false (fail-safe, ikke gættet til production)", () => {
    expect(shouldRecordTripVisit(validInput({ vercelEnv: "Production" }))).toBe(false);
    expect(shouldRecordTripVisit(validInput({ vercelEnv: "prod" }))).toBe(false);
  });

  it("branch-/Vercel-alias host => false selvom VERCEL_ENV er \"production\"", () => {
    expect(
      shouldRecordTripVisit(
        validInput({ host: "unique-travel-rejsepraesentation-git-main-unique-travel.vercel.app" }),
      ),
    ).toBe(false);
  });

  it("localhost => false", () => {
    expect(shouldRecordTripVisit(validInput({ host: "localhost:3000" }))).toBe(false);
  });

  it("manglende host => false", () => {
    expect(shouldRecordTripVisit(validInput({ host: null }))).toBe(false);
  });

  it("admin-auth-cookie til stede => false", () => {
    expect(shouldRecordTripVisit(validInput({ cookieNames: [ADMIN_COOKIE] }))).toBe(false);
  });

  it("chunket admin-auth-cookie til stede => false", () => {
    expect(
      shouldRecordTripVisit(
        validInput({ cookieNames: ["trip_access_ab12cd34ef56", ADMIN_COOKIE_CHUNK_0] }),
      ),
    ).toBe(false);
  });

  it("bot-UA => false", () => {
    expect(
      shouldRecordTripVisit(
        validInput({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }),
      ),
    ).toBe(false);
  });

  it("tom UA => false (behandlet som bot)", () => {
    expect(shouldRecordTripVisit(validInput({ userAgent: "" }))).toBe(false);
    expect(shouldRecordTripVisit(validInput({ userAgent: null }))).toBe(false);
  });

  it("ægte Chrome/Safari/Edge tillader tracking uændret, når de øvrige betingelser er opfyldt", () => {
    expect(shouldRecordTripVisit(validInput({ userAgent: REAL_CHROME_WINDOWS }))).toBe(true);
    expect(shouldRecordTripVisit(validInput({ userAgent: REAL_SAFARI_IOS }))).toBe(true);
    expect(shouldRecordTripVisit(validInput({ userAgent: REAL_EDGE }))).toBe(true);
  });

  it("ingen cookies overhovedet (ingen access-cookie endnu) => stadig false pga. andre betingelser er uafhængigt af dette", () => {
    // shouldRecordTripVisit tjekker IKKE trip_access selv (det er allerede
    // sket autoritativt i page.tsx, jf. §8) — en tom cookie-liste blokerer
    // derfor ikke i sig selv, kun admin-auth-cookiens tilstedeværelse gør.
    expect(shouldRecordTripVisit(validInput({ cookieNames: [] }))).toBe(true);
  });

  it("flere fejlende betingelser samtidig giver stadig blot false, ikke en fejl", () => {
    expect(() =>
      shouldRecordTripVisit({
        vercelEnv: undefined,
        host: null,
        userAgent: null,
        cookieNames: [],
      }),
    ).not.toThrow();
    expect(
      shouldRecordTripVisit({ vercelEnv: undefined, host: null, userAgent: null, cookieNames: [] }),
    ).toBe(false);
  });
});

describe("konstanter", () => {
  it("VISIT_WINDOW_MINUTES er 30", () => {
    expect(VISIT_WINDOW_MINUTES).toBe(30);
  });

  // IKKE en påstand om at null er den ønskede endelige production-værdi.
  // DB-fundamentet er live (migration 010 kørt og verificeret i production,
  // 2026-09-18T11:31:14Z) — den resterende gate er release-cutover: koden er
  // endnu ikke merget/deployet, så TRACKING_SINCE forbliver midlertidigt
  // null indtil den sættes til det faktiske UTC-deploy-tidspunkt i en
  // separat, sidste commit umiddelbart før merge/deploy. Denne test skal
  // SELV opdateres (sammen med konstanten i trip-visit.ts) i samme commit.
  // Se release-cutover-tjeklisten i supabase/README.md ("Driftsnote:
  // trip_visits (Issue #65)") — PR'en må ikke få endelig merge-godkendelse
  // før dette er gjort.
  it("TRACKING_SINCE er (endnu) null — release-cutover-værdien sættes i en separat commit før merge", () => {
    expect(TRACKING_SINCE).toBeNull();
  });
});
