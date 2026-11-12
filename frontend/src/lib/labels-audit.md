# Labels audit — CIPH-882

This document is the **single source of truth** for every site in the
codebase that translates a blueprint item id (symptom / trigger / vital /
episode / rescue medication) into a user-facing label.

CIPH-882 introduces user-added **custom items**. Their `label` field is a
literal string the user typed in their own language (NOT an i18n key).
Preset items keep their i18n keys. Every site listed below MUST branch:

```ts
isCustomItem(item.id) ? item.label : $t(item.label)
```

For the PDF / CSV pipeline that branch is centralized as `labelOf(t, item)`
and `vitalLabelOf(t, v)` near the top of `lib/pdf.ts`.

The `customItems-render.test.ts` source-parse guard walks this file's
file-path bullets and asserts each contains `isCustomItem(` (or
`labelOf(` / `vitalLabelOf(` for pdf.ts). **Adding a new label-rendering
site means adding it here AND adding the discriminator branch in the same
commit.** Otherwise the next PI will leak a raw `custom_*` id into a PDF
or chip row.

What's NOT covered (stays a plain `$t(...)`):
- Group labels (`symptom_group.physical`, etc.) — both preset and the
  synthetic `symptom_group.custom` group are i18n keys.
- Static UI copy that names a document kind (`stream.events` = "Notiz"
  on the journal moment view and calendar notes) — not blueprint items.
  The old `/stream` filter tabs are gone; `/stream` now redirects to
  `/journal`.
- Vital units — `translateUnit(t, raw)` already falls back to the raw
  string on miss, which is correct for user-typed units like `0-10`.

What's NOT in scope for CIPH-882 (preserved for future work):
- Custom rescue medications. The existing rescue-med sites (881b) keep
  the literal `$t(m.label)` rendering since custom rescue meds aren't
  shipped yet. When they are, the branch must be added there too.

Line references below were dropped on 2026-11-12: they had drifted by
hundreds of lines. Find a site by the helper or block it names.

**Branching sites outside the guard.** These also render blueprint labels
and do branch on `isCustomItem(`, but are not in the test's
`RENDER_SITES` list, so they are named here in prose rather than as
file-path bullets (a bullet without a matching `RENDER_SITES` entry fails
`customItems-render.test.ts`): `lib/components/DayDetail.svelte`
(calendar day panel), `lib/components/LastEntriesStrip.svelte`,
`lib/components/TopTriggersCard.svelte`,
`lib/components/WithinPhaseRollupCard.svelte`,
`lib/components/MonthMiniSummary.svelte`. Promote each to a bullet when
it is added to `RENDER_SITES`.

---

## Symptom item labels

- `lib/components/EntryPreview.svelte` — `symptomLabelFor(id)`
  iterates `bp.symptomGroups[].items` to find the matching item and
  returns its label.
- `lib/components/EntryComposer.svelte` — both the chip rendering loop
  and the incomplete-symptoms nudge derivation.
- `routes/reports/+page.svelte` — `itemLabel(id, bp, t)` helper used by
  the monthly grid, plus the `labelMap` builds for the frequency blocks.
- `routes/setup/+page.svelte` — step-2 symptom-item preview.
- `lib/pdf.ts` — every `labelOf(t, item)` call in `drawGridSection`,
  `generateDoctorPdf`, `exportCsv`, frequency
  aggregations.

## Trigger labels

- `lib/components/EntryPreview.svelte` — `triggerLabelFor(id)`.
- `lib/components/EntryComposer.svelte` — chip loop and the
  incomplete-triggers nudge.
- `routes/setup/+page.svelte` — step-3 trigger preview.
- `lib/pdf.ts` — frequency aggregations + CSV column headers.

## Vital labels

- `lib/components/EntryPreview.svelte` — paired vital titles, lab pills,
  multi-entry rows.
- `lib/components/EntryComposer.svelte` — paired-vital section header,
  single-vital headers, the incomplete-vitals nudge.
- `routes/setup/+page.svelte` — step-3 vital preview.
- `lib/pdf.ts` — `vitalLabelOf(t, v)` is used in chart titles (single
  + paired + AM/PM split), CSV column headers, year aggregations.

## Episode labels

- `lib/components/EntryPreview.svelte` — `epLabelFor(id)`.
- `lib/components/EntryComposer.svelte` — episode counter rows (`epLabel`,
  also used in the increment/decrement `aria-label`s).
- `lib/components/PhaseContextCard.svelte` — multiDay phase label.
- `routes/calendar/+page.svelte` — episode-legend chip, multiDay band
  tooltip, day-tooltip phase pill.
- `routes/+layout.svelte` — quick-add episode chip.
- `routes/reports/+page.svelte` — `itemLabel(id, bp, t)` for episode
  columns.
- `lib/pdf.ts` — episode-breakdown chart series labels, duration table
  rows, "for-doctor" multiDay bullets, CSV column headers.

## Vital unit labels (NO branch needed)

`translateUnit($t, v.unit)` is used everywhere a vital's unit is rendered.
The helper already falls back to the raw `v.unit` string when the i18n
lookup misses — which is exactly what a user-typed unit like `0-10`
needs. No discriminator branch.

Sites that consume `translateUnit`: `EntryPreview.svelte` (vital pills),
`EntryComposer.svelte` (vital headers), `pdf.ts` (chart titles, CSV
headers, rescue-med columns).
