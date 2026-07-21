# ACCESS_MATRIX — adgang og data

Hvad agenter må læse/skrive, og hvad der kræver Rickos godkendelse.
"Skriv m. OK" = handlingen må forberedes, men udføres først efter Rickos eksplicitte OK.

## Systemer

| System | Ressource | Agent læse | Agent skrive | Noter |
|---|---|---|---|---|
| **GitHub** | `ricko-spec/unique-travel-rejsepraesentation` (PUBLIC) | Ja | Feature-branches: ja · **main: kun m. OK** (= production-deploy) · branch-/stash-sletning: kun m. OK | Repoet er offentligt — aldrig secrets/kundedata i commits |
| **Vercel** | Projekt `unique-travel-rejsepraesentation` (team `unique-travel`) | Ja (deploys, logs, status) | Preview via branch-push: ja · production: kun via merge til main (m. OK) · domæner/env-vars/køb: **kun Ricko** | Preview bag Vercel Auth |
| **Supabase** | Projekt `iunixfpthdftmkgpugex` (Postgres, Auth, Storage) | Ja (skema, config, data i opgavens omfang) | DDL via nummereret migration + baseline-opdatering: ja · datamutation i produktion: **kun m. OK** (undtagen hvad app-flows selv gør) · destruktivt (DROP/DELETE/TRUNCATE), bucket-config, auth-brugere: **kun m. OK** | Indeholder kundedata — se nedenfor. Preview OG production peger her |
| **Anthropic/Claude API** | `ANTHROPIC_API_KEY` (parse-flowet) | — | App'en kalder selv; agenter ændrer model/prompt kun som normal kode-ændring (branch + OK) | Nøglen må aldrig logges/citeres |
| **TravelWire-PDF'er** | Input fra sælgere | Kun i opgave-kontekst (fx QA-siden) | Nej — aldrig i repo/chat/logs | Indeholder kundenavne og rejsedetaljer |

## Data i projektets database

| Data | Klassifikation | Agent-regel |
|---|---|---|
| `trips.data` (rejsende-navne, rejseplaner, priser), `raw_pdf_text`, `customer_name` | **Unique Travel-kundedata (PII)** | Læs kun hvad opgaven kræver. Aldrig i repo, commits, docs eller unødvendigt chat-output. Aggregater/counts er OK |
| `profiles` (sælger-navne, email, telefon) | Intern PII | Samme regel |
| `audit_log`, `rate_limits`, `parse_failures` | Drifts-metadata (designet PII-frit) | Fri læsning; skriv kun via app-kode |
| `destinations` + Storage-billeder | Offentligt indhold | Fri læsning; skriv via app-flows/migrationer |
| Secrets (service-role, anon, API-nøgler, adgangskoder) | **Hemmelige** | Må ALDRIG logges, printes, committes eller citeres — heller ikke delvist |

## Forbudt — ingen undtagelser

- **THF/Unique Travels interne systemer: SharePoint, VPN, mail, fællesdrev.** Agenter hverken
  læser eller skriver dér. Skal der bruges materiale derfra, leverer Ricko det.
- Supabase-projekter der ikke er `iunixfpthdftmkgpugex` (Allotment-projektet `ocxrvkrggzppyhgyambj`
  m.fl. tilhører andre systemer). `sujimigwcjkzpekkdpzf`: status UKENDT — rør ikke.
- Eksterne publiceringer (nye domæner, tredjeparts-services, mails til kunder/sælgere) uden Rickos OK.

## Kræver altid Rickos godkendelse (opsummeret)

**Merge til main / production-deploy kræver altid Rickos OK** — ingen undtagelser, heller ikke
"ufarlige" docs-ændringer (push til main ER et production-deploy). Derudover: destruktive DB/Storage-handlinger ·
bucket-/projekt-config · sletning af branches, stash eller data · nye adgange/integrationer ·
alt markeret KRÆVER RICKO i `docs/ROADMAP.md`/`docs/DECISIONS.md`.
