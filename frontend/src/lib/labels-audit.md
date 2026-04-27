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
- Stream filter tabs (`stream.all`, `stream.events`, etc.) — static UI
  config, not blueprint items.
- Vital units — `translateUnit(t, raw)` already falls back to the raw
  string on miss, which is correct for user-typed units like `0-10`.

What's NOT in scope for CIPH-882 (preserved for future work):
- Custom rescue medications. The existing rescue-med sites (881b) keep
  the literal `$t(m.label)` rendering since custom rescue meds aren't
  shipped yet. When they are, the branch must be added there too.

---

## Symptom item labels

- `lib/components/EntryPreview.svelte` — `symptomLabelFor(id)` (line ~34)
  iterates `bp.symptomGroups[].items` to find the matching item and
  returns its label.
- `lib/components/EntryComposer.svelte` — both the chip rendering loop
  (line ~493) and the incomplete-symptoms nudge derivation (line ~352).
- `lib/components/Companion.svelte` — top-symptoms label map (line ~425).
- `routes/reports/+page.svelte` — `itemLabel(id)` helper (line ~209)
  used by the monthly grid, plus the year-most-frequent symptom block
  (line ~340).
- `routes/setup/+page.svelte` — step-2 symptom-item preview (line ~414).
- `lib/pdf.ts` — every `labelOf(t, item)` call in `drawGridSection`,
  `generateDoctorPdf`, `generateCompactPdf`, `exportCsv`, frequency
  aggregations.

## Trigger labels

- `lib/components/EntryPreview.svelte` — `triggerLabelFor(id)` (line ~40).
- `lib/components/EntryComposer.svelte` — chip loop (line ~520) and the
  incomplete-triggers nudge (line ~356).
- `routes/setup/+page.svelte` — step-3 trigger preview (line ~448).
- `lib/pdf.ts` — frequency aggregations + CSV column headers.

## Vital labels

- `lib/components/EntryPreview.svelte` — paired vital titles (line ~377),
  lab pills (line ~392), multi-entry rows (line ~400).
- `lib/components/EntryComposer.svelte` — paired-vital section header
  (line ~681), single-vital headers (line ~718, 758).
- `routes/setup/+page.svelte` — step-3 vital preview (line ~464).
- `lib/pdf.ts` — `vitalLabelOf(t, v)` is used in chart titles (single
  + paired + AM/PM split), CSV column headers, year aggregations.

## Episode labels

- `lib/components/EntryPreview.svelte` — `epLabelFor(id)` (line ~44).
- `lib/components/EntryComposer.svelte` — episode counter rows
  (line ~593), and `aria-label`s on increment/decrement buttons (line
  ~609, ~617).
- `lib/components/Companion.svelte` — episode-type label list (line ~371).
- `lib/components/PhaseContextCard.svelte` — multiDay phase label
  (line ~54).
- `routes/calendar/+page.svelte` — episode-legend chip (line ~402),
  multiDay band tooltip (line ~475), day-tooltip phase pill (line ~610).
- `routes/+layout.svelte` — FAB episode chip (line ~931).
- `routes/reports/+page.svelte` — `itemLabel(id)` for episode columns
  (line ~212).
- `lib/pdf.ts` — episode-breakdown chart series labels, duration table
  rows, "for-doctor" multiDay bullets, CSV column headers.

## Vital unit labels (NO branch needed)

`translateUnit($t, v.unit)` is used everywhere a vital's unit is rendered.
The helper already falls back to the raw `v.unit` string when the i18n
lookup misses — which is exactly what a user-typed unit like `0-10`
needs. No discriminator branch.

Sites that consume `translateUnit`: `EntryPreview.svelte` (377/392/400),
`EntryComposer.svelte` (vital headers), `pdf.ts` (chart titles, CSV
headers, rescue-med columns).
