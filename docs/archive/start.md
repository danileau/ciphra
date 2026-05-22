# ciphra

**Encrypted by design.**

`ciphra.ch` · `ciphra.app`

---

## What ciphra Is

A privacy-first personal health companion with end-to-end encryption. The server mathematically cannot read user data. Originally born from [epilepc](https://epilepc.ch), a 7-year-old Symfony epilepsy tracker (diploma thesis), ciphra opens the concept to any health condition — epilepsy, migraine, diabetes, chronic pain, or anything a patient or caregiver needs to document daily.

### Core Promise

- **3 minutes per evening** to log your day (symptoms, seizures, meds, triggers, notes)
- **Your data, your key** — E2E encrypted, zero-knowledge server
- **Show your doctor a grid** — monthly report they can scan in seconds
- **Works offline** — PWA, encrypted local cache, syncs when online
- **Not a wellness app** — a serious, functional tool for people managing real conditions

---

## Origin: What We Learned from epilepc

### The App (Symfony 5.4, PHP)
- 6 entities: User, Seizure, Medication, Diaryentry, Event, Seizuretype
- Server-side encryption (Defuse via DoctrineEncryptBundle — server holds the key)
- Bootstrap 4 / SB Admin 2 / jQuery / DataTables / Chart.js
- Multi-language: DE, EN, IT, FR
- 11 controllers, 4 security voters, Doctrine ORM + MariaDB

### Why It Failed for Real Users

**Alexandra's feedback** (caregiver for a person with therapy-resistant epilepsy + migraine):

> *"Für meine Bedürfnisse hat es sich als nur bedingt brauchbar und umständlich herausgestellt und ich habe mir ein einfaches Excel Sheet gebastelt."*

She abandoned epilepc for an Excel sheet because:

| What she needs | What epilepc offers | The gap |
|---|---|---|
| Tick 20 symptom checkboxes per day | Create individual "diary entry" records with titles + descriptions | Way too slow |
| Count seizures (just a number) | Navigate → "New Seizure" → fill form → save | Cumbersome for daily use |
| Check off which meds were given today | Separate medication CRUD pages | Wrong mental model |
| Track triggers (weather, stress, menstruation) | Doesn't exist | Missing feature |
| Track vitals (BP, O2, pulse, weight) | Doesn't exist | Missing feature |
| Monthly grid with sums + percentages for doctor | Only charts, no grid view | Doctor can't use it |
| Custom symptom columns per patient | Hardcoded entity schema | Inflexible |
| 3 minutes per evening | 15+ minutes navigating forms | Deal-breaker |

**Her Excel**: rows = days, columns = ~40 symptom/med/trigger checkboxes. She ticks them each evening and shows the monthly grid to doctors. Reference: `/home/danileau/Downloads/Beispiel Dokumentation Anfälle.pdf`

### Architectural Dead Ends in epilepc

- Server-side encryption: server holds the Defuse key → not zero-knowledge
- Rigid Doctrine entities: can't add custom columns per patient without schema changes
- PHP/Twig server-rendering: no offline support, no mobile, no client-side crypto
- SB Admin 2 template: generic admin UI, no health-specific UX
- No API: mobile clients can't connect

---

## The E2E Encryption PoC (epi-2)

A working proof-of-concept at `/home/danileau/work/epi-2/` demonstrates the zero-knowledge architecture.

### Tech Stack
- Python 3.11 / Flask 3.0 / PostgreSQL 15
- Docker + Nginx
- AES-256-GCM + Argon2id key derivation

### Key Hierarchy

```
User Password ──┬── Argon2id(+":AUTH")  → auth_hash (server stores for login verification)
                └── Argon2id(+":VAULT") → vault_key (encrypts master key)

Master Key (random 256-bit, generated once at registration, NEVER leaves client)
  └── AES-256-GCM → encrypts ALL health data

Recovery Code (12-word BIP39-style mnemonic)
  └── Argon2id(+":RECOVERY") → recovery_key (backup encryption of master key)
```

### Security Properties
- Master key never reaches the server
- Server stores only: auth_hash, encrypted_master, encrypted records
- Argon2id: 64MB memory, 3 iterations, GPU-resistant
- AES-256-GCM: authenticated encryption (detects tampering)
- Account lockout after 5 failed attempts (15 min)
- Recovery without compromise: 12-word code recovers master key, re-encrypts with new password
- Audit logging of all actions

### What's Missing (from PoC → Production)
- Frontend encryption is placeholder (base64, not WebCrypto)
- `record_type` field is plaintext in DB → metadata leak
- No 2FA
- No HTTPS enforcement
- No offline/PWA support
- No real frontend (just a demo HTML page)

---

## Metadata Sensitivity: The Deeper Problem

Even with E2E encrypted values, the **shape of the data** leaks information:

| Visible metadata | What it reveals |
|---|---|
| Account exists on ciphra | Person has a health condition |
| 47 records of type "seizure" | Has epilepsy, severity |
| Records cluster in March | Bad month |
| 3 records on March 7th | Rough day |
| `record_type = "seizure"` | Nature of condition |

### Solution: Opaque Document Store

One generic table, everything inside the encrypted blob:

```sql
CREATE TABLE encrypted_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    encrypted_data TEXT NOT NULL,     -- E2E encrypted: type, date, ALL content inside
    created_at TIMESTAMP             -- upload timestamp only, not event time
);
```

Server sees: "User 42 uploaded N blobs." No types, no event dates, no patterns.

Tradeoff: all filtering, aggregation, and search happens client-side after decryption. Acceptable for personal health data (hundreds of records, not millions).

---

## UI Concepts (Designed & Prototyped)

Static test pages in `/home/danileau/work/epilepc/ui-test/` demonstrate every concept.

### Design System
- **Font**: Inter (Google Fonts)
- **CSS**: Tailwind CSS
- **Icons**: Lucide (SVG, no emoji)
- **Palette**: Warm stone neutrals + indigo primary
- **Data type colors**: Seizure=#DC2626, Event=#0D9488, Diary=#6366F1, Medication=#D97706
- **Dark mode**: Full support, localStorage toggle, system preference detection
- **Epilepsy-safe**: ZERO flashing/strobing. `prefers-reduced-motion` respected. Chart.js animations disabled.
- **Accessibility**: WCAG AAA contrast, 44px+ touch targets, semantic HTML, ARIA, skip links, focus traps

### Four View Concepts

Each serves a different moment in the user's day:

#### A: Companion ("Heute") — Morning check-in
`concept-companion.html`
- Greeting + date
- Seizure-free streak counter (days since last, personal best)
- Medication checklist (interactive, tick off as taken)
- Quick action cards (log seizure, write diary, record event, generate report)
- Today's entries
- Pattern insights ("Seizures more common on Monday and Friday")
- Weekly mini-visualization (7-day colored block grid)
- Upcoming appointments

#### B: Tagesprotokoll ("Protokoll") — Evening 3-min log
`concept-tagesprotokoll.html`
- Toggle chips for symptoms grouped by category (Behavior, Physical, Sleep)
- Seizure counters with +/- steppers and time chips
- Trigger toggles (weather, other)
- Medication checklist (standard daily + as-needed)
- Vitals section (BP, pulse, O2, weight, temp, neurofeedback)
- Notes textarea
- **Monthly grid view**: HTML table mirroring Alexandra's Excel — rows=days, columns=symptoms/meds/triggers, sums + percentages at bottom
- PDF export button

#### C: Calendar ("Kalender") — Pattern recognition
`concept-calendar.html`
- Month grid with color-coded dots per day
- Medication bands as Gantt bars below calendar
- Day detail panel (click day → see entries)
- Week view toggle
- Monthly summary stats
- Two-panel layout (calendar left, detail right) on desktop
- Bottom sheet on mobile

#### D: Stream ("Stream") — History browsing
`concept-stream.html`
- Unified chronological feed of all entry types
- Filter tabs (All / Seizures / Medication / Diary / Events)
- Date navigation strip (last 14 days)
- Floating action button (FAB) for quick-add
- Inline quick-add card
- Stats peek overlay
- Search with live filtering

### Classic Admin View (kept as fallback)
Full reskin of the existing epilepc layout: dashboard with KPI cards + Chart.js, table-based list views, form-based CRUD, admin panel. For users who prefer the traditional approach.

### Proposed Navigation

```
Bottom Nav:

  Heute          Protokoll        Kalender        Stream          Mehr
(Companion)   (Tagesprotokoll)   (Calendar)      (Stream)    (Classic, Account,
                                                              Reports, Settings)
```

Users choose their default view in preferences. All views available, switchable anytime.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (PWA — installable, works offline)            │
│  SvelteKit + TypeScript + Tailwind CSS                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │ WebCrypto│  │IndexedDB │  │ Views                 │ │
│  │ Argon2   │→ │(encrypted│→ │ Companion (home)      │ │
│  │ AES-GCM  │  │ local    │  │ Tagesprotokoll (log)  │ │
│  │          │  │ cache)   │  │ Calendar (patterns)   │ │
│  └──────────┘  └──────────┘  │ Stream (history)      │ │
│                               │ Classic (fallback)    │ │
│                               └───────────────────────┘ │
│                                                          │
│  Charts: Chart.js (client-side, no animation)           │
│  PDF: Browser-side generation                            │
│  Landing page: Static/SSG (public, SEO)                  │
└──────────────────┬──────────────────────────────────────┘
                   │ encrypted blobs only
                   ↓
┌──────────────────────────────────────────────────────────┐
│  API (thin encrypted blob store)                         │
│  ~5 endpoints: register, login, store, fetch, delete     │
│  Auth: Argon2id + JWT (24h)                              │
│  Database: PostgreSQL                                    │
│  Audit logging                                           │
│  Rate limiting + account lockout                         │
└──────────────────────────────────────────────────────────┘
```

### Why SvelteKit
- Lighter than Next.js, ideal for PWAs
- File-based routing, SSG for landing page, SPA for app
- First-class TypeScript
- Built-in service worker support (offline)
- The ui-test HTML concepts translate almost 1:1 to Svelte components

### Data Model

**Server sees only encrypted blobs:**

```
encrypted_documents:
  id            SERIAL PRIMARY KEY
  user_id       FK → users
  encrypted_data TEXT (E2E encrypted)    ← everything inside:
  created_at    TIMESTAMP                  {
                                             "type": "daily_log",
                                             "date": "2026-04-03",
                                             "symptoms": {"müde": true, ...},
                                             "seizures": {"focal": 0, "gm": 1, ...},
                                             "triggers": {"weather": ["Sonne"], ...},
                                             "medications": {"standard": {...}, "asNeeded": {...}},
                                             "vitals": {"bp": "120/80", ...},
                                             "notes": "..."
                                           }
```

**User preferences (also encrypted):**

```json
{
  "defaultView": "companion",
  "symptomColumns": ["müde", "aggressiv", "unruhig", "übelkeit", ...],
  "triggerOptions": ["Wind", "Sonne", "Regen", "Schlafmangel", ...],
  "standardMedications": [{"name": "Levetiracetam", "dose": "750mg", "times": ["morgens", "abends"]}],
  "asNeededMedications": ["Midazolam nasal 5mg", "Temesta 1mg"],
  "locale": "de"
}
```

Custom symptoms per patient = different JSON keys. No schema changes. No migrations.

### Client-Side Processing

All computation happens in the browser after decryption:
- Monthly grid: load 31 blobs → decrypt → aggregate in JS
- Charts: computed from decrypted data → Chart.js
- PDF export: generated in browser (already solved in epilepc)
- Search: decrypt all → filter in memory
- Streak counter: iterate decrypted records → find last seizure date

Performance: 365 records/year × microseconds per AES-256-GCM decrypt = negligible.

### Offline Support

IndexedDB stores encrypted blobs locally. The app works without internet:
1. User logs data → encrypted in browser → stored in IndexedDB
2. When online → sync encrypted blobs to server
3. Conflict resolution: last-write-wins per document (daily logs are one-per-day)

---

## Migration Path from epilepc

Existing epilepc users migrate with a one-time import:

1. User logs into OLD epilepc (Symfony)
2. Server decrypts their data (Defuse key, server-side)
3. Export as JSON: seizures[], medications[], diaryentries[], events[]
4. User logs into ciphra (new app)
5. Client encrypts each record with their NEW E2E master key
6. Upload encrypted blobs to ciphra backend
7. Done — old data now E2E encrypted in new system

epilepc keeps running for users who don't migrate. No forced cutover.

---

## Implementation Phases

### Phase 1 — Core App
- SvelteKit project scaffold + Tailwind + TypeScript
- WebCrypto E2E encryption (port epi-2's crypto to JS)
- Auth flow: register (with recovery code), login, password recovery
- API: 5 endpoints (Python/Flask from epi-2, or rewrite)
- Companion view (daily home)
- Tagesprotokoll view (evening log + monthly grid)
- Encrypted IndexedDB local cache

### Phase 2 — Complete Views
- Calendar view
- Stream view
- Classic/admin view (fallback)
- PDF export (browser-side)
- Monthly grid report (Alexandra's use case)

### Phase 3 — Platform
- PWA install (home screen, offline sync)
- Migration tool (import from epilepc v1)
- Caregiver accounts (one user logging for another)
- Multi-language (DE/EN/IT/FR — port existing translations)
- 2FA

### Phase 4 — Open Health Platform
- Configurable condition templates (epilepsy, migraine, diabetes...)
- Shareable read-only encrypted reports (time-limited link for doctors)
- Native mobile wrappers (Capacitor) if PWA isn't enough

---

## Reference Files

| What | Where |
|---|---|
| epilepc source (current app) | `/home/danileau/work/epilepc/` |
| UI test pages (all concepts) | `/home/danileau/work/epilepc/ui-test/` |
| Concept: Companion | `ui-test/concept-companion.html` |
| Concept: Tagesprotokoll | `ui-test/concept-tagesprotokoll.html` |
| Concept: Calendar | `ui-test/concept-calendar.html` |
| Concept: Stream | `ui-test/concept-stream.html` |
| Classic reskin (14 pages) | `ui-test/dashboard.html`, `seizures.html`, etc. |
| Logo concepts | `ui-test/logos/` |
| E2E encryption PoC | `/home/danileau/work/epi-2/` |
| Alexandra's Excel (PDF) | `/home/danileau/Downloads/Beispiel Dokumentation Anfälle.pdf` |
| ciphra project root | `/home/danileau/work/ciphra/` |

---

## Domains

| Domain | Status |
|---|---|
| **ciphra.ch** | Available (verified RDAP, likely — no DNS, invented word) |
| **ciphra.app** | Available (verified WHOIS) |

---

*ciphra — encrypted by design.*
