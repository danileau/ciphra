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
scopes — last month, 12 months, 2 years — each shown as a card explaining when
to use it. The export produces a multi-page A4 PDF, rendered in the browser:

- a KPI glance and a cohort-aware trend chart,
- symptom / trigger frequency and medication tables,
- a landscape day-by-day protocol grid.

The PDF is the one moment data leaves the device — once saved it is plaintext,
and the export UI says so plainly. A CSV export is also available.

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
