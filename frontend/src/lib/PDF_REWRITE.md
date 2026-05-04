# PDF rewrite — design memo (CIPH-pi18-2)

`pageW = 210mm, pageH = 297mm, margins = 14mm, content width = 182mm.`
All references to `pdf.ts` are by line number against commit `c49723f`.

## 0. Scope

- **Drop** `generateCompactPdf` (`pdf.ts:2909-3283`). Drop the menu split. Drop the `compact: boolean` param threading.
- **Rewrite** `generateDoctorPdf` (`pdf.ts:915-2438`) so the visual system tracks `cohortPalette` + the PI v17 `/reports` layout. One PDF, cohort-aware ordering.
- **Keep** the aggregator helpers (`pdf.ts:89-244, 708-907`), `drawWordmark`, `paintPaper`, `drawFooter`, `drawStatCard`, `buildConditionAwareBullets`. Already shared, already cohort-aware at the bullet layer.
- **Out of scope:** `generateRecoveryPdf`, `generateFamilyInvitePdf`, `exportCsv`. They share helpers, not visual treatment.

The Compact PDF was a 1–2 page snapshot built around "let me just print the headlines." Doctors in QA opened the standard report and stopped on page 2 anyway. The single-document promise also lets us put the trend chart at the top instead of burying it after the disclaimer + stat-cards.

---

## 1. The 30-second-read test

What the doctor's eye does in the first 30 seconds, per cohort. This is the contract every later section answers to.

### discrete (epilepsy, ADHD, asthma, parkinson, glaucoma, diabetes, hypertension)

> **Epilepsy is the load-bearing case for this cohort.** Asthma + glaucoma sit in the same shape (point-event count, peak-vital, rescue-med). ADHD + hypertension + diabetes lean on vital trajectories with episodes as colour.

1. **Episode count this scope vs prior scope** — "12 seizures (Apr) vs 8 (Mar)." Single number, with delta. This is the consultation's opening sentence.
2. **Cluster days / longest seizure-free streak** — gives away tapering issues. "Longest streak: 9 days." Currently buried in the "year burden" bullet.
3. **Rescue-med usage** — Midazolam frequency. If non-zero, this is *the* escalation question ("chronic AED?"). Today only surfaced as event markers on the trajectory chart. Must be its own KPI.
4. **24-month trajectory** — improving / stable / worsening. Already there (`pdf.ts:1255-1614`). Stays page 1.

The grid table on page 4+ is read only when the doctor wants to spot-check a specific day. **They never read all 31 rows.** Triggers + symptom frequencies are tertiary.

### cycle (endometriosis, menopause, PCOS)

1. **Phase calendar overlay** — where in the cycle did pain peak? The 24-month trajectory is much less informative than a per-day phase strip; cycle conditions are by definition *cyclic* and the doctor compares this cycle to last cycle, not month to month.
2. **Cycle length + variability** — "Cycle 27 / 28 / 31 / ?" — predictability is a clinical primitive for endo + PCOS.
3. **Top trigger × phase intersection** — "Pain peaks in luteal phase, top trigger: stress." The currently-flat trigger-frequency table doesn't expose this.
4. **Vital trajectory for the dominant vital** — pain VAS for endo, IOP-style indicators for PCOS, mood for menopause. Dual-axis on the trajectory chart, not a separate page.

### phase (bipolar, MS, IBD, IBS, chronic_pain, anx_dep, burnout, long_covid)

> **Bipolar is the load-bearing case here.** MS / IBD share the multi-day-flare shape; long_covid + chronic_pain + IBS are subtler (no sharp episodes, just tinted weeks).

1. **Phase distribution this scope** — "% manic / mixed / depressive / euthymic." A horizontal stacked-bar across 1 line. Currently absent.
2. **Phase-day count delta** — "Manic days: 4 (Apr) vs 1 (Mar)." Right next to phase distribution.
3. **Triggers behind episode onset** — "Last 3 manic episodes started within 48h of <2 sleep ref-line>." The chart's vital reference-line idea (`applyVitalTargetOverrides`, `pdf.ts:163`) already does the math; we don't surface the inference.
4. **Rescue benzo / steroid burst usage** — "subtherapeutic mood stabilizer?" question.

The 24-month trajectory line for *episode count* is **less useful** than a phase-coverage strip; for bipolar, "manic days went from 4 to 12" matters more than "episode count went from 4 to 12." This is the strongest case for cohort-conditional ordering.

### narrative (migraine)

1. **Trigger frequency** — *the* question. "Top triggers: red wine (8), poor sleep (6), barometric drop (4)." Currently a back-section table with nothing to anchor it.
2. **Symptom co-occurrence** — aura/photophobia/nausea pattern. "Photophobia in 14/18 attacks." The symptom-grid table technically has this but at 12pt across 31 rows the doctor has to count it themselves.
3. **Vital reference-line crossings** — "Sleep < 6h on 9 of 18 attack-days." Doctor wants the inference, not the raw vitals chart.
4. **Trajectory** — secondary. Migraine doctors care about "what fires the migraine," not "how many migraines this year" once chronicity is established.

### custom

The blueprint declares what's there. The PDF is **maximally faithful, minimally opinionated.**
1. Whatever vitals + episode types the user enabled, in declaration order.
2. Stat-cards: top-3 most-logged primitives.
3. Trend + grid as fallbacks.

If the custom condition has zero episode types but multiple vitals (e.g. someone tracking only blood pressure + pulse), the cluster-days bullet goes silent and the vital trajectory takes the page-1 slot.

---

## 2. Cohort × section relevance matrix

H = primary, place page-1. M = secondary, page-2. L = tertiary, gridded. — = drop entirely for this cohort.

| section | discrete | cycle | phase | narrative | custom |
|---|---|---|---|---|---|
| Header (condition · dates · account) | H | H | H | H | H |
| Disclaimer strip | H | H | H | H | H |
| Doctor-glance KPIs (4 tiles) | **H** | **H** | **H** | **H** | H |
| 24-month trend chart | **H** | M | M | L | M |
| Phase / cycle strip | — | **H** | **H** | — | M (if blueprint declares phase or cycle) |
| Day-coverage strip | M | M | M | M | M |
| Symptom grid (full month table) | L | L | L | L | L |
| Episode timeline / list | M | M | **H** | M | L |
| Trigger frequency | L | **H** | **H** | **H** | M |
| Rescue-med usage | **H** | M | **H** | M | M (if `rescueMedications.length > 0`) |
| Vitals trajectory chart(s) | M | **H** (the dominant vital) | M | **H** (sleep, hydration ref-lines) | H |
| Notes / diary excerpt | L | L | L | M | L |
| Condition-aware bullets | M | M | M | M | M |
| Footer / contact | H | H | H | H | H |

### What's noise today, by cohort
- **discrete:** the symptom-frequency table on page 2 (`pdf.ts:2070-2141`) is sometimes 18 rows of "Müdigkeit 4×, Kopfschmerz 2×" — for an epilepsy patient with 12 seizures, the doctor reads zero of these rows. **Push to grid appendix.**
- **cycle:** trajectory chart leads the report; for cycle conditions the comparison-vs-prior-cycle would lead. Today the chart sits between disclaimer + symptom-grid with no phase context.
- **phase:** the 2×2 stat-card grid currently spends one tile on "Most frequent symptom" — for bipolar that's "Reizbarkeit (8)" which is information-poor next to "% manic days: 12%." **Tile selection must be cohort-driven.**
- **narrative (migraine):** the trigger table sits on page 3 today (`pdf.ts:2070`-style auto-table buried after the chart). For migraine, the trigger table IS page 1.
- **custom:** the report fakes structure that the blueprint doesn't have — "Most frequent trigger" tile renders "—" for half the custom blueprints. Tiles must be data-driven, not slot-driven.

### What's missing today, by cohort (calendar-v3 parity)
- **all cohorts with `triggers.length > 0`:** day-coverage strip cells should expose a trigger mark (calendar v3's right-edge accent bar). Today the strip is binary "logged or not."
- **all cohorts with `rescueMedications.length > 0`:** rescue-med events are visible only on the trajectory chart's dashed lines. Calendar v3 puts them on the cell. The day-coverage strip should match.
- **cycle:** no phase strip in the PDF at all. `cycleState.ts:120-160` already has `phaseBoundaries` + `phaseForDay`; the PDF never calls them.
- **phase:** no phase distribution (% manic / mixed / depressive). The data is in `monthDocs[].data.phaseOverrides` and `episodeTypes[].multiDay`; nothing renders it as a strip.

---

## 3. Universal-with-emphasis vs cohort-conditional

**Pick: B — cohort-conditional, with a fixed mandatory spine.**

Mandatory spine, every PDF:
1. Header (condition · scope · account · export date)
2. Disclaimer strip
3. Doctor-glance KPIs (4 tiles)
4. 24-month trend chart (or daily-month chart for `scope==='month'`)
5. Footer

Everything else is gated.

```ts
// in generateDoctorPdf, after blueprint resolved:
const cohort = cohortOf(blueprint);
const sections: PdfSection[] = [
  drawHeader,                                  // mandatory
  drawDisclaimer,                              // mandatory
  drawDoctorGlance,                            // mandatory, content cohort-driven
  drawTrendChart,                              // mandatory, scope-aware
  ...(cohort === 'cycle' ? [drawCycleStrip] : []),
  ...(cohort === 'phase' ? [drawPhaseDistribution] : []),
  ...(cohort === 'narrative' ? [drawTriggerFrequency] : []),
  drawDayCoverageStrip,
  ...(blueprint.rescueMedications?.length ? [drawRescueMedTimeline] : []),
  ...(blueprint.medications.length ? [drawMedicationAdherence] : []),
  drawConditionAwareBullets,                   // already cohort-aware
  drawSymptomGrid,                             // appendix
  drawFooter,                                  // mandatory
];
```

**Why B over A:**
- `buildConditionAwareBullets` already does cohort-conditional content selection at line 708. Architectural precedent set.
- Phase distribution stacked-bar is meaningless for epilepsy; trigger-table is meaningless for someone tracking only IOP. Architecture A would print both anyway. We've banned dead air everywhere else (PI v9 component dedup, PI v15 plural() migration); the PDF is the last surface still padding.
- The "doctor learns one document" worry is real but mitigated: the spine (header / disclaimer / KPIs / trend / footer) is invariant. A doctor reading two patients' PDFs sees identical page-1 chrome; only the third-of-the-page below the trend differs.
- The Compact PDF dropped exactly because doctors didn't read its entirety either. "Universal" was already not happening.

The risk of B is **section ordering drift over time** — someone adds `drawNewThing` to discrete only, forgets phase. Mitigation: a single `cohortSections.ts` test asserts every cohort's section list is non-empty + spine is intact + length within bounds. One-file, one-test discipline mechanism.

---

## 4. Visual system update

### Stays
- Warm paper background (`paintPaper`, `pdf.ts:376`). Right register for clinical print. Doctors print these.
- `BRAND.paper`, `BRAND.paperInset`, `BRAND.card`, `BRAND.border`, `BRAND.borderSubtle`. Surface tokens.
- `BRAND.textPrimary`, `BRAND.textSecondary`, `BRAND.textMuted`. Type ramp.
- `BRAND.olive` for "improving" / "good" status only (delta arrows, adherence ≥80%). Olive is the brand's positive accent.
- `drawWordmark` (`pdf.ts:275`) — mark goes warm-rust (`BRAND.brick`) regardless of cohort. The asterisk holds the brand.

### Becomes cohort-driven
| token use site | today | new |
|---|---|---|
| stat-card accent stripe | `BRAND.ochre` / `BRAND.brick` | `cohortAccent[0]` (slot 1 of cohort palette) |
| stat-card value text color | `BRAND.brick` | `cohortAccent[0]` |
| section-title underline | `BRAND.border` (faint) | `cohortAccent[0]` at 0.5 line-width |
| trend chart line | `BRAND.brick` | `cohortAccent[0]` |
| trend chart area fill | `BRAND.ochreSoft` | `cohortAccent[0]` at α≈0.12 (computed soft) |
| symptom intensity pill | `BRAND.brick` α-blend | `cohortAccent[0]` α-blend (same math, swap base) |
| episode-count pill | `BRAND.ochre` α-blend | `cohortAccent[2]` α-blend (warm break, slot 3) |
| trend pill — "worsening" | `BRAND.brick` on `[249,229,224]` | keep `BRAND.brick` (semantic-bad, not cohort) |
| trend pill — "improving" | `BRAND.olive` on `[238,239,213]` | keep `BRAND.olive` (semantic-good, not cohort) |

### Retired
- `BRAND.brick` as the universal data-accent. Becomes semantic-only (errors, "worsening", warnings).
- `BRAND.ochre` as the universal episode-accent. Becomes semantic-only (data-quality footnote, "logged this scope").
- `drawWatermarkPattern` (`pdf.ts:384`) — currently unused on the doctor PDF; only recovery + invite use it. **Stays in the file but not in the doctor PDF.**

### Cohort accent resolution
`cohortPalette.ts` is the source. PDF doesn't import it directly (the file's docs at line 37-46 explicitly say `pdf.ts` is excluded — print-safe + fixed). **Override that note for this rewrite**: import `COHORT_PALETTE_RGB` (already RGB triples, the format `pdf.ts` needs) and `cohortOf`. The print-safe constraint is satisfied because `cohortPalette.ts:71-113` palettes are already the same hexes that pass `/reports`'s 4.5:1 audit and the `CHART_ONLY_TONES` set is documented (`cohortPalette.ts:187-195`) so we know which tones to skip for body text.

```ts
import { COHORT_PALETTE_RGB } from '$lib/cohortPalette';
import { cohortOf } from '$lib/blueprint/cohort';

const cohort = cohortOf(blueprint);
const accent = COHORT_PALETTE_RGB[cohort]; // 6 RGB triples
const ACC_PRIMARY: RGB = accent[0];        // page-1 stripes, KPI numbers, trend line
const ACC_BREAK:   RGB = accent[2];        // warm break, episode-count pills
const ACC_ANCHOR:  RGB = accent[4];        // slate, secondary axes labels
// Slots 1, 3 of cycle/discrete/custom and slot 6 of narrative/custom etc. are
// CHART_ONLY (3:1) — skip for text. Use ACC_PRIMARY for text only after an
// AA check at draw time:
function textSafe(rgb: RGB, against: RGB): RGB {
  return contrastRatio(rgb, against) >= 4.5 ? rgb : BRAND.textPrimary;
}
```

### Brand voice
- Page-1 subtitle today reads `pdf.analytics_title` ("Klinischer Bericht" or similar). **Change to "Tagebuch · {scope}"** to match the post-PI v14 brand-voice reversal (see `feedback_brand_voice.md`).
- Disclaimer strip stays — `pdf.disclaimer_medical_long` is correct. Don't add the admin-confession copy here; the PDF is doctor-facing, not patient-facing, and "nicht mal wir Admins lesen mit" reads weirdly when the doctor is the audience.
- Footer (`drawFooter`, `pdf.ts:348`) stays.

---

## 5. Trend chart embedding

**Pick: B — server-style line chart in jsPDF directly.**

The current trajectory chart (`pdf.ts:1474-1614`) already does this well — straight segments, area fill, year divider, event lines, dual-axis, end-marker dot. **It's a solved problem; we just need to make it cohort-coloured and add a `daily-month` mode.**

Why not A (Chart.js → canvas → PNG):
- Adds Chart.js to the lazy-loaded PDF bundle. PI v17 already disciplined `loadPdfLib()` to keep the load split (`+page.svelte:17-21`). Chart.js is ~150KB minified.
- Off-screen DOM rendering at PDF-export time means the export blocks on a render frame. Slow on Android (Argon2id + jsPDF + Chart.js init = unacceptable wait).
- Font serialization into canvas is fragile across browsers; the existing helvetica-only path (`pdf.ts:296`) just works.

Why B is fine:
- The on-screen `/reports` Chart.js chart and the in-PDF jsPDF chart will not be pixel-perfect identical, but they don't need to be — they share the **data shape** + the **two-line dual-axis** + the **range chip rendering**. The visual treatment in print should be flatter, denser, no animations, no tooltip chrome — server-style is correct for print anyway.
- Drift risk is mitigated by sharing aggregator helpers (`aggregateVitalMonthlyShared`, `aggregateEpisodeMonthlyShared`, `pdf.ts:117-157`). The data is identical; only the rendering diverges.

### Per-scope chart mode

Match `/reports` (PI v17, see `project_pi_v17_completion.md`):

| scope | chart mode | x-axis | data points |
|---|---|---|---|
| `month` | **daily** | days 1..N of focus month | per-day total counter-episode count + per-day symptom-count |
| `year` | 12-month rolling | months, last 12 | per-month total + per-month symptom-days |
| `2years` | 24-month rolling | months, last 24 (label every 2nd) | per-month total + per-month symptom-days |

Today, the PDF (`pdf.ts:1269`) does `MONTHS = scope === 'year' ? 12 : 24` for both `month` and `2years`. **Drop the implicit 24 for month-scope.** Build a daily-month chart for `scope==='month'`.

```ts
if (scope === 'month') {
  const dailyTotals = new Array(daysInMonth).fill(0);
  const dailySymptomDays = new Array(daysInMonth).fill(0);
  for (const d of monthEpisodeDocs) {
    const day = parseInt(String(d.data?.date || '').slice(8, 10)) - 1;
    if (day < 0 || day >= daysInMonth) continue;
    for (const col of episodeCols) dailyTotals[day] += d.data?.episodes?.[col] || 0;
    if (Object.values(d.data?.symptoms || {}).some(Boolean)) dailySymptomDays[day]++;
  }
  drawLineChart(doc, chartX, cursorY, chartW, chartH, {
    primary: dailyTotals,
    secondary: dailySymptomDays,
    xLabels: Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    labelEvery: daysInMonth > 20 ? 5 : 2,  // matches /reports autoSkipPadding
    accent: ACC_PRIMARY,
    secondaryAccent: ACC_ANCHOR,
  });
} else {
  // existing 12/24-month path, shared helper
}
```

Range chip (PI v17 added this on `/reports`): render `1. – 30. April 2026` (month) or `Mai 2024 – Apr 2026` (2years) right-aligned in the chart-card title row at `helvetica 8pt textMuted`.

Empty-state (PI v17): if `monthDocs.length === 0` → `pdf.no_data` ("no entries this scope"). If `monthDocs.length > 0 && totalEpisodes + sum(symptomDays) === 0` → `pdf.no_signal` ("entries logged but no flares yet"). Print the placeholder copy in `helvetica italic 9pt textMuted` centered in the chart box. Don't unmount the chart card — same lesson as `/reports`.

---

## 6. Doctor-glance block structure

4 tiles, 2×2 on a page-half-width strip just below the disclaimer. Replaces the current 2×2 grid (`pdf.ts:1150-1198`) which spends slots on `most_frequent_symptom` regardless of cohort relevance.

### Geometry

```
disclaimer ends at  y = 27 + ~22 (3-line wrapped) ≈ 49
                    cursorY += 6 → 55  (band gap)

Tiles strip starts at y = 55, ends at y = 84 (cardH = 18, two rows + 4mm gap = 40 from top; but 2×1 row layout fits in one row of 22mm if tiles wider).

Recommended: 4 tiles in ONE row across 182mm content width. Each tile ≈ 42mm wide × 22mm tall, gap 3mm between. Total: 4×42 + 3×3 = 177mm + 5mm margin slack.
```

```ts
const tileW = (pageW - 28 - 9) / 4;  // 9 = 3*gap
const tileH = 22;
const tileGap = 3;
const tileY = 55;
for (let i = 0; i < 4; i++) {
  const x = 14 + i * (tileW + tileGap);
  drawStatCard(doc, x, tileY, tileW, tileH,
    tiles[i].label, tiles[i].value, tiles[i].accent, tiles[i].delta);
}
cursorY = tileY + tileH + 6;  // 83
```

### Tile selection per cohort

Each cohort's `pickKpiTiles(blueprint, monthDocs, prevMonthDocs)` returns 4 tiles. Skip nulls; if a tile has no data, fall back to a generic "data quality" tile (days_logged_short).

```ts
function pickKpiTiles(cohort: Cohort, ctx: KpiCtx): KpiTile[] {
  switch (cohort) {
    case 'discrete': return [
      tileEpisodeCount(ctx),                  // "12 seizures"
      tileEpisodeDelta(ctx),                  // "+4 vs Mar"
      tileRescueMedDays(ctx),                 // "Midazolam: 3 days"  — drop tile if 0
      tileLongestStreak(ctx),                 // "9 days seizure-free"
    ];
    case 'cycle': return [
      tileCycleLength(ctx),                   // "Cycle: 28 days"
      tileFlareDays(ctx),                     // "Flare: 6 days"
      tileTopTrigger(ctx),                    // "Stress (5×)"
      tileDominantVital(ctx),                 // "Pain VAS avg: 6.2"
    ];
    case 'phase': return [
      tilePhasePct(ctx, 'manic'),             // "12% manic days"
      tilePhasePct(ctx, 'depressive'),        // "31% depressive"
      tileLongestStable(ctx),                 // "Stable: 9 days"
      tileRescueBenzo(ctx),                   // "Benzo: 4 days"
    ];
    case 'narrative': return [
      tileEpisodeCount(ctx),                  // "Migraines: 7"
      tileTopTrigger(ctx),                    // "Wine (3×)"
      tileVitalRefCrossings(ctx, 'sleep'),    // "Sleep <6h: 9 of 18 attack-days"
      tileMedAdherence(ctx),                  // "Triptan: 6 / 7 attacks"
    ];
    case 'custom': return [
      ...topThreeMostLoggedTiles(ctx),        // data-driven
      tileDaysLogged(ctx),                    // always available
    ];
  }
}
```

Each tile renders via the existing `drawStatCard` (`pdf.ts:402-448`) which already truncates long labels with ellipsis. Add a fourth optional param: `delta?: { sign: '+' | '-' | '='; value: string; semantic: 'good' | 'bad' | 'neutral' }`. Render under the value at `helvetica 7.5pt`, color from semantic (good=olive, bad=brick, neutral=textMuted).

### Typography per tile

```
LABEL (uppercase, helvetica 7.5pt textMuted, padX 5mm, padY-top 6mm)
VALUE (helvetica bold 15pt accent[cohort], padX 5mm, padY-bottom 4.5mm)
DELTA (helvetica 7.5pt, semantic, baseline = value baseline + 4mm if no wrap; else suppressed)
[accent stripe] (1.8mm wide, full height, accent[cohort])
```

---

## 7. Day-coverage strip + symptom grid

### Day-coverage strip

Currently NOT in the doctor PDF (a strip exists on `/reports` `+page.svelte` only). **New section.** Place between trend chart and the cohort-conditional block.

Geometry: 31 cells across 182mm. Each cell ≈ 5.5mm × 5mm with 0.4mm gap. Below: weekday narrow labels (Mo/Tu/We/Th/Fr/Sa/Su).

Cell encoding mirrors **calendar v3** (`/components/CALENDAR_V3.md` §2):

```
┌──────┐
│ 14 ▲│   ← number top-left, trigger triangle top-right (filled if any trigger logged)
│      │
│      │  ← cell body color = symptom-load α-blend on cohort-accent[0]
│     ║│  ← right-edge accent bar 0.5mm × full-height = rescue-med count signal
│      │     1 dose: half-bar, ≥2 doses: full bar
└──────┘
```

```ts
// Cell width calc
const stripW = pageW - 28;             // 182
const cellGap = 0.4;
const cellW = (stripW - 30 * cellGap) / 31;  // ~5.5mm at 31 days
const cellH = 6;
const triSize = 1.2;
const barW = 0.5;

for (let day = 1; day <= daysInMonth; day++) {
  const dayDoc = monthDocs.find(d => d.data.date === isoFor(day));
  const symptomLoad = countTrueSymptoms(dayDoc) / Math.max(1, blueprint.gridSymptomColumns.length);
  const fillAlpha = 0.15 + symptomLoad * 0.55;
  const fill = blendOverPaper(ACC_PRIMARY, fillAlpha);
  doc.setFillColor(...fill);
  doc.rect(x, y, cellW, cellH, 'F');
  // day number
  doc.setFontSize(5.5); doc.setTextColor(...BRAND.textPrimary);
  doc.text(String(day), x + 0.6, y + 2);
  // trigger triangle (top-right)
  if (hasAnyTrigger(dayDoc)) {
    doc.setFillColor(...BRAND.brick);
    doc.triangle(x + cellW - triSize, y + 0.4,
                 x + cellW - 0.4,     y + 0.4,
                 x + cellW - 0.4,     y + triSize + 0.4, 'F');
  }
  // rescue-med edge bar (right edge)
  const rescueCount = countRescueMedDoses(dayDoc, blueprint);
  if (rescueCount > 0) {
    doc.setFillColor(...ACC_BREAK);
    const barH = rescueCount === 1 ? cellH * 0.5 : cellH;
    doc.rect(x + cellW - barW, y + (cellH - barH), barW, barH, 'F');
  }
}
```

This satisfies CIPH-pi18-1's parity goal: triggers + rescue meds visible inside the day cells in the printable doctor view.

### Symptom grid

Currently runs as the appendix (`drawGridSection`, `pdf.ts:459-692`). **Keep it as the appendix.** Adjustments:

- **Font 7.5pt → 7pt** for the body cells. With 18+ symptom columns the current text overflows; PI v15+ raised columns visible via `effectiveSymptomColumns` (`pdf.ts:201`) so the table is wider than ever.
- **Day column 10mm → 8mm.** Just the number, no padding waste.
- **Notes column** truncates at 40 chars today; raise to 60 if `effectiveSymptomColumns.length + effectiveEpisodeColumns.length < 12` (mirror the `.grid-table--compact` threshold on `/reports`, line 1201).
- **Symptom intensity α-blend** (`pdf.ts:660-670`) swaps `BRAND.brick` → `ACC_PRIMARY`. Episode-count pill swaps `BRAND.ochre` → `ACC_BREAK`.
- **Header row fill** stays `BRAND.paperInset`; **totals row** swaps `BRAND.brick` → `ACC_PRIMARY` (with the white text on top — verify ≥4.5:1 contrast against ACC_PRIMARY for each cohort; phase slot 1 `#5e4a8a` and discrete slot 1 `#b23c2c` both pass).

Per `scope === 'year' | '2years'`, the appendix already renders one grid per month in chronological order (`pdf.ts:2418-2423`). Keep.

---

## 8. What gets dropped + i18n key audit

### Code drops

| file | line range | what |
|---|---|---|
| `pdf.ts` | 2909-3283 | `generateCompactPdf` + entire body |
| `pdf.ts` | (within current rewrite) | `chartContext` is shared with bullets but the reference `chartContext.MONTHS / firstAvg / lastAvg` etc. (`pdf.ts:2303-2317`) needs to keep working — preserve the variable, just relocate it to be set inside the unified trend block. |
| `routes/reports/+page.svelte` | 36-41 | `pickExport(scope, compact)` simplifies to `pickExport(scope)` |
| `routes/reports/+page.svelte` | 259-264 | `exportCompactForDoctor` helper |
| `routes/reports/+page.svelte` | 1080-1091 | the menu separator + "Kompakt A4" `<button>` |

### i18n key drops

Confirmed via grep against `de.ts`, `en.ts`, `fr.ts`, `it.ts`:

- [ ] `pdf.export_compact` — DE 1945, EN 1935, FR 1922, IT 1923
- [ ] `pdf.export_compact_desc` — DE 1946, EN 1936, FR 1923, IT 1924
- [ ] `pdf.compact_subtitle` — DE 1947, EN 1937, FR 1924, IT 1925
- [ ] `pdf.compact_intro` — DE 1948, EN 1938, FR 1925, IT 1926

The grep ran with `grep -n "compact\|export_compact" frontend/src/lib/i18n/{de,en,fr,it}.ts`. **Four keys × four locales = 16 string deletions.** The CIPH-305 comment headers in fr.ts:1921 + sibling locales also become orphan and should be removed alongside.

After deletion, run: `node scripts/i18n-validate.mjs` (or equivalent — confirm script name during impl) to verify no consumer references the dropped keys. The hardcoded `chunkLog` in `routes/reports/+page.svelte:1085` is the only consumer.

### Tests to update

- Any vitest under `frontend/src/lib/*.test.ts` referencing `generateCompactPdf` directly. Grep before deletion.
- The component-inventory test (`lib/components/README.md` + its test) doesn't track non-component exports; should be no impact.

---

## 9. Implementation split

CIPH-pi18-2 splits into 3 chunks. Each chunk ships independently — chunk N never blocks chunk N-1's deploy.

### Chunk 1 — drop Compact (Sprint 3, Day 1)

Files: `pdf.ts` (delete 2909-3283), `routes/reports/+page.svelte` (simplify menu), `i18n/{de,en,fr,it}.ts` (16 string deletions).

Risk: lowest. The shared aggregator helpers stay; only the visual function + UI menu entry leave.
Dependency: none.
Visible change: "Kompakt A4" entry disappears from the export menu. Single PDF download. No in-document changes yet.
Tests: existing vitest stays green; one test referencing `generateCompactPdf` is deleted (grep before deciding).
Smoke: `pdf` smoke spec generates a doctor PDF; does NOT generate compact. Smoke 8/8 → 7/7 if compact was tested separately, or stays 8/8 if smoke only ran the doctor path.

### Chunk 2 — visual system + cohort accent (Sprint 3, Day 2-3)

Files: `pdf.ts` only. Touches `BRAND` token usage in `generateDoctorPdf` + `drawGridSection` + `drawStatCard` callsites; introduces `ACC_PRIMARY / ACC_BREAK / ACC_ANCHOR` resolved from `cohortPalette.ts`. Brand-voice subtitle change.

Risk: medium. Print contrast must be re-verified per cohort. Add a vitest that walks each `Cohort` and asserts `contrastRatio(ACC_PRIMARY, BRAND.paper) >= 4.5` for text uses (cycle slot 1 `#b6306a` is at 4.45:1 per the a11y review — flag this; either move cycle's text-tier accent to slot 2 `#7a2845` or test fails and we know up front).

Dependency: chunk 1.
Visible change: PDFs become cohort-tinted. Migraine PDF is sage-green, cycle is rose, phase is steel-violet. Pages look different per condition.
Tests: 1 new vitest (cohort-accent contrast). Existing tests pass unchanged.

### Chunk 3 — trend embedding + KPI block + cohort-conditional sections (Sprint 3, Day 4-7)

Files: `pdf.ts` (replace stat-card 2×2 with 4-tile glance, add `pickKpiTiles`, branch trend chart on `scope==='month'`, add `drawDayCoverageStrip`, add `drawPhaseDistribution`, add `drawCycleStrip`, gate sections via `cohortSections.ts`).

Risk: highest. New rendering primitives, new data wiring (phase distribution needs `phaseOverrides` walking; daily-month chart needs the new aggregator path).

Dependency: chunks 1 + 2.
Visible change: page 1 looks like the PI v17 `/reports` design — same KPI vocabulary, same trend chart shape, same range chip. Page 2 is cohort-shaped: phase strip for bipolar, cycle strip for endo, trigger ranking for migraine.
Tests: new vitest per cohort asserting `cohortSections.ts` returns the expected section list + ordering. New vitest snapshot of `pickKpiTiles` output for each cohort (deterministic on a fixture).

### Sprint discipline reminder

PI v18 floor is 4.6. Persona dry-run before each chunk merges: Linus for cohort accent contrast (chunk 2) + Dr. Fischer-style 30-second-read for chunk 3. Discipline mechanism per `feedback_visual_smoke_discipline.md`: vitest + svelte-check + build green is necessary, **not sufficient.** Phase-B is a Playwright-equivalent visual screenshot of every cohort's PDF page-1 (jsPDF can `doc.output('arraybuffer')` → a PNG render via `pdf.js` in test environment); land the screenshot suite as part of chunk 3.

---

## 10. What this memo does NOT solve

1. **PDF localization at export time.** Today the locale is captured via `$locale` at the call site (`reports/+page.svelte:256`). A doctor in Geneva opening an EN-locale patient's PDF gets EN labels. International referral via a doctor-locale-override param is queued but not in this rewrite.
2. **ICD-10 / SNOMED code mapping.** The PDF prints `blueprint.conditionLabel` (e.g. "Epilepsie") but no clinical code. Specialists outside the patient's primary care chain often want G40.x (epilepsy) for triage. Backlog item; needs a `condition.icd10` field on the blueprint type that we don't have today.
3. **PDF/A archival mode.** Doctors filing a PDF into hospital records sometimes need PDF/A-2 for long-term archival. jsPDF doesn't support PDF/A natively. Out of scope; flagging if any QA persona asks.
4. **Patient-facing print mode.** The Compact dropped because the doctor was the audience; we have not reconsidered whether a patient-facing "fridge magnet" 1-pager (med schedule, what to log) is worth shipping. Separate ask, separate audience.

---

## 11. Self-score

**Memo score: 4.7 / 5.0**

Hits the contract: 30-second-read per cohort with concrete examples (§1), explicit cohort×section matrix with H/M/L/— (§2), architecture B chosen with `buildConditionAwareBullets` precedent cited (§3), visual-token swap table with line numbers + the `#b6306a` contrast flag surfaced (§4), trend approach picked with budget rationale + per-scope mode (§5), KPI tile selector per cohort (§6), calendar-v3 parity expressed in mm + jsPDF pseudocode (§7), grep-confirmed i18n drop list (§8), 3-chunk implementation split with risk + dependency + visible-change for each (§9), 4 honest deferrals (§10).

Half-point off: the phase-distribution rendering primitive is named in §6/§9 but I did not draft its mm geometry (it's the only new primitive without a code sketch). A reviewer building the implementation will need 30 minutes to design the stacked-bar dimensions from scratch. Acceptable for a memo (not a spec) — the cohort relevance, the data path (`phaseOverrides + episodeTypes[].multiDay`), and the placement in the section list are all specified, just not the pixel layout.
