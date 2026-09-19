# Features

What ciphra does today. For how it's built see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Onboarding — blueprints

A new account picks a **blueprint** in the setup wizard: one of 25 condition
presets (epilepsy, migraine, diabetes, bipolar, hypertension, PCOS, Hashimoto,
MS, IBD, asthma, endometriosis, long-COVID, and more) or a `custom`
build-your-own. The blueprint defines what that user tracks — symptom groups,
episode types, triggers, vitals, medications — and can be customized after
setup. It is stored encrypted; the server never sees which condition a user
tracks.

## Daily logging

The core daily interaction is the entry form at `/log/[date]`:

- **Symptoms** — tap-to-toggle chips, grouped by category.
- **Episodes** — `+`/`−` counters per episode type.
- **Triggers** — toggle chips (sleep, stress, weather, …).
- **Vitals** — typed values (blood pressure, sleep hours, weight, mood, …).
- **Medications** — taken / not-taken toggles.
- **Notes** — free text.

For capture-as-it-happens rather than an evening review, **quick-add** records
a single episode or a rescue-medication as a timestamped event.

## Medications and dose history

Medications are configured in Settings. A scheduled medication is assumed
taken on each logged day and the daily log records only missed doses; an
as-needed medication is ticked when taken, or logged as a timestamped intake.
History filled in afterwards is the exception: a dose period the person
entered from memory shows what applied, but no day inside it was ever logged,
so it never counts towards adherence and never produces a missed dose.

A medication's **dose changes over time without rewriting the past.** Each
medication keeps one identity and a dated history of dose periods, stored
inside the encrypted blueprint. *Change* asks what is changing — the dose or
schedule, stopping it, or switching to a different medication — and from which
date (tomorrow by default), and shows how it will be recorded before saving:
days before the change keep the dose that applied then. A typo fix is a
separate, explicitly retroactive correction. A stopped medication moves to its
own list and stays in history; deleting one that has logged days first offers
to stop it instead and says how many days would lose its name.

Every surface reads the dose of the day: the daily log, the as-needed picker,
the calendar (a mark on change days, and the day detail), `/reports` (a
medication timeline for the visible window, with the change named in the trend
chart's tooltip), and the doctor PDF (adherence per dose period, and the
changes in the export window). The history is descriptive only: ciphra marks
when a dose changed and never compares symptoms before and after it.

History also runs **backwards**. *Add an earlier dose* records what applied
before ciphra knew the medication — days already recorded are untouched — and
*Add a medication from the past* records one that was tried and stopped, with
its period and, from a fixed translated list, why it ended. Those dates are
entered as months, and "I don't remember" leaves the start open rather than
inventing a day. The reason a person types in their own words is never
printed; only the fixed-list reason reaches the treatment-history export.

## Cohort-aware surfaces

ciphra adapts to how a condition actually behaves. Each condition belongs to a
cohort — discrete, cycle, phase, narrative, or custom — and that drives:

- **Dashboard** — a cohort-pinned primary card (vital trend, gap-trend, phase
  rollup, …) plus a today-status recap.
- **Calendar** — a month grid, with cycle and phase overlay modes for the
  cohorts that need them, and a day-detail panel.
- **Journal** — a reverse-chronological timeline with search and type filters.
- **Reports** — the layout and primary chart match the cohort.

## Reports and the doctor PDF

`/reports` is the "show your doctor" surface. An export picker offers three
period scopes — last month, 12 months, 2 years — each shown as a card
explaining when to use it. The export produces a multi-page A4 PDF, rendered
in the browser:

- a KPI glance and a cohort-aware trend chart,
- symptom / trigger frequency and medication tables,
- a landscape day-by-day protocol grid.

A fourth card exports the **treatment history**: every medication ever
recorded, oldest first, with its dose periods and how each one ended, across
the whole span rather than one window. It is built from the medication list
alone — no symptom or episode data reaches it — and answers the question a
first consultation opens with.

Saving any of these writes plaintext to disk, and the export UI says so
plainly. A CSV export is also available, and Settings can export the raw
encrypted documents.

## Family sharing

A patient can grant a caregiver access with a **family code** — a short phrase
that re-wraps the patient's key. The caregiver claims the grant from their own
account and can then read and add entries on the patient's behalf. Grants are
revocable (though revocation cannot retract data already downloaded). See
[SECURITY_MODEL.md](SECURITY_MODEL.md) for the cryptographic detail.

**Each invitation has a scope, chosen when it is created:** everything except
the diary and locked entries (the default), or everything including them. Some
people want a relative to see the whole picture; others keep the diary to
themselves. The scope is enforced on the server — an out-of-scope document is
never sent to the caregiver at all, rather than being filtered in their browser
— and it can be changed afterwards. Narrowing a scope stops further access; it
cannot retract what was already downloaded.

## Account and recovery

- **Recovery code** — a 12-word code shown once at signup. It is the only way
  back into an account if the password is lost; ciphra cannot reset it.
- **Change password** — re-wraps the vault without re-encrypting documents.
- **Delete account** — GDPR self-service erasure, password-confirmed.
- **Settings** — language, profile, family sharing, local-cache controls.

## Languages

Full UI in **German, English, French, Italian**. German copy follows Swiss
orthography (`ss`, never `ß`).

## Privacy by construction

- Zero-knowledge: the server stores only opaque encrypted blobs (see
  [SECURITY_MODEL.md](SECURITY_MODEL.md)).
- No email address is collected — accounts are a username and password only.
- A decrypted-document cache in IndexedDB makes revisits fast; logout wipes it.
- Public condition pages (`/conditions/[id]`) explain what each condition
  tracks, for people deciding whether ciphra fits.

## Migration from epilepc

Users of the original epilepc tracker can import their history at `/migrate`:
the old records are re-encrypted in the browser with the user's new ciphra key
and uploaded as encrypted documents.

epilepc is on a phased decommission. New account registration on epilepc closes
the moment the `announce` phase starts (2026-07-01); existing accounts keep
reading and writing through `warn`, become read-only on 2026-10-01, and are fully
decommissioned on 2026-10-31. Each user can either migrate via `/migrate` or
download their data as a JSON bundle (byte-identical to the migration bundle, so
it stays re-importable) or as a PDF.

Once a user has completed migration, ciphra signals epilepc and that one account
is read+export-only from that point on, regardless of the global phase — to
prevent the two systems from diverging.

## Operator tooling

`/admin` is a metadata-only operator dashboard — user counts, account
lock/unlock, an audit log of authentication events. It cannot show health
content; there is none to show in plaintext.
