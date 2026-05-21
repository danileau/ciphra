# CLINICAL_HANDOFF.md — ciphra clinical handoff artifact (binding spec)

**Status:** Binding. Supersedes `PDF_TEMPLATE.md` and `PDF_DESIGN_SPEC.md`.
**Provenance:** R1–R5 campfire + 7-split tribunal, 2026-05-21. Workflow archived under `memory/`.
**Mode:** Single A4 PDF, rendered client-side in the patient's browser. Zero-knowledge: the patient's vault is decrypted in-memory; the artifact never leaves the device unless the patient shares it.

The artifact's job is to be the **clinical handoff** at the doctor visit. It is read by four audiences, in this priority order:
1. **Specialist clinician** — 5–15 min slot, forensic reader, wants patterns not stories
2. **Triage nurse / new clinician** — orientation, briefs the on-call in 90 seconds
3. **Patient themselves** — reads it before the visit, wants to grok what they're handing over
4. **Partner / family member** — non-medical, sees it in the family folder, must not be harmed or confused

Every design decision below has been weighed against all four audiences.

---

## 1. Hard constraints (non-negotiable)

1.1. **Single A4 PDF.** Hard one page. No bundle, no required HTML appendix, no second page. Overflow is handled by truncation with a neutral suffix line (`+18 not printed on this page`), never by pagination. Clinical seats voted 3-0 against multi-artifact bundles; tribunal voted 2-1 against soft pagination.

1.2. **Zero-knowledge.** Rendered in the patient's browser via jsPDF. No server-side template, no live API. Argon2id WASM crypto must run on a Web Worker, completing before PDF generation begins, to prevent main-thread blocking on low-end Android.

1.3. **MDR-safe.** The artifact displays only patient-authored entries and raw values. No algorithmic derivation, no clinical framing, no cross-cohort correlation that implies interpretation. The disclaimer at the bottom does **not** override functional intent — behavior determines classification, not the scope statement.

1.4. **Banned wording (hard list, all locales).** These words never appear in labels, headers, axis titles, or generated copy:

> trend · improvement · improving · worsening · abnormal · elevated · response · recommendation · significant · stable · delta (as a labeled frame) · trajectory · control (as in "good control") · suboptimal · adherence (as judgment) · poor · optimal · concerning · notable · spike · cluster · pattern

Patient-authored free text is exempt — if the patient writes "I feel worse," it prints verbatim.

1.5. **No color encodes value.** Color may encode event category at most, never severity, intensity, or quality. The artifact must survive 1-bit dithered B&W photocopy at 150dpi without semantic loss — meaning categorical distinction must be carried by **shape + label + contrast**, with color as redundant decoration only. The current cohort palette retires from the artifact.

1.6. **"Patient-reported" as a label is banned.** No data-quality tiering on individual data sections. Provenance lives in one scope statement at the bottom, not as a recurring label decorating sections.

1.7. **Embedded Noto Sans subset** for DE/EN/FR/IT correctness. Deterministic text measurement and wrapping owned by us — `splitTextToSize` is not enough; pre-wrap all strings, truncate visibly.

1.8. **Locale: Swiss German uses `ss` not `ß`.** Pinned by existing `swiss-orthography.test.ts`. Applies to all generated copy.

---

## 2. Page anatomy (top to bottom)

The cohort shell is identical across all 5 cohort families. Only block 4 (primary data) swaps. Blocks 1, 2, 3, 5, 6, 7 are constants.

```
┌─ 1. Header (12mm) ──────────────────────────────────────┐
│ ciphra · Clinical Handoff · {export date}               │
├─ 2. Patient top line (18mm) ─────────────────────────────┤
│ {Name} wrote ({date}): "{free text, ≤180 chars}"        │
├─ 3. Identity + scope (10mm) ─────────────────────────────┤
│ Patient: {first name + last initial} · DOB: {yyyy}      │
│ Notebook: {cohort label} · Export period: {range}        │
│ Locale: {de|en|fr|it} · Timezone: Europe/Zurich         │
├─ 4. PRIMARY BLOCK (110mm, cohort-swappable) ─────────────┤
│ [varies by cohort — see §3]                              │
├─ 5. Patient notes (≤25mm, max 3 items, most recent) ────┤
│ {date} · "{patient-authored note, ≤120 chars}"          │
│ {date} · "..."                                          │
│ {date} · "..."                                          │
│ [+N not printed on this page]                            │
├─ 6. Unlabeled white space ──────────────────────────────┤
│ [naturally available room — no caption, no label]        │
├─ 7. Scope statement (≤15mm, bottom) ─────────────────────┤
│ This page displays patient-authored entries and raw     │
│ values for the selected period. It does not diagnose,   │
│ rank importance, or interpret change.                    │
│ Generated locally · ciphra version {x.y.z}              │
└──────────────────────────────────────────────────────────┘
```

A4 = 210mm × 297mm. Margins 15mm all sides → 180mm × 267mm content area. Total block heights above sum to ~190mm, leaving block 6 (white space) absorbing the remainder.

---

## 3. The primary block (cohort-aware)

The primary block (110mm tall, content-area width) swaps per cohort family. All variants obey the same drawing rules: B&W safe, raw values only, no derivation.

### 3.1 Vital cohorts (Hashimoto, Hypertension, Diabetes T1, Parkinson, Cardiovascular, Bipolar polarity)

Primary signal: **lab/vital values over time, with patient-logged treatment changes shown nearby (but not overlaid).**

```
TSH (mIU/L)
  25 Sep 2025  Last: 4.2  ·  This: 3.8
  14 Nov 2025  Last: 3.8  ·  This: 3.1
  09 Jan 2026  Last: 3.1  ·  This: 2.9
  06 Mar 2026  Last: 2.9  ·  This: 2.7
  12 May 2026  Last: 2.7  ·  This: 2.5
  ┌─ Sparkline (40mm × 12mm, dots only, no connecting lines) ─┐
  │  ●        ●      ●     ●    ●                            │
  │  25 Sep  14 Nov  9 Jan 6 Mar 12 May                       │
  └──────────────────────────────────────────────────────────┘

Free T4 (pmol/L)  [same structure, ≤2 metrics per page]

────── DOSE CHANGES ────── (separate strip, vertically aligned by date)
  25 Sep  ○ 100→75 mcg
  14 Nov  ○ 75→88 mcg
  06 Mar  ○ 88→100 mcg
```

**Rules for vital cohorts:**
- **Side-by-side raw values** (`Last: X · This: Y`) — never compute a delta. The patient observes the difference; the software does not.
- **Dots-only sparkline.** No connecting line (a line implies trajectory, which is a banned interpretation). Each dot is a measured draw. No interpolation.
- **X-axis = per-draw absolute dates.** Not relative weeks (implies "since-the-event"). Not calendar months (loses precision).
- **No reference range bounds.** No dashed clinical-range lines. Visual position relative to "normal" IS clinical framing.
- **Dose-change strip is BELOW the data, on a separate axis.** Vertically aligned by date for visual coincidence — never overlaid. Treats the relationship as temporal, not causal.
- Maximum 2 vital metrics per page 1. Additional metrics overflow with a `+N more values not printed on this page` suffix.

### 3.2 Episode cohorts (Epilepsy, Migraine, ADHD, RA, IBD, Asthma)

Primary signal: **dated events with category, drawn as a B&W calendar grid.**

```
EPISODES — last 90 days

         Mo  Tu  We  Th  Fr  Sa  Su
Feb 03   .   .   .  SZ   .   .   .
Feb 10   .   .   .   .  AU   .   .
Feb 17   .   .   .   .   .   .   .
Feb 24   .   .   .   .   .   .   .
Mar 03   .  SZ   .   .   .   .   .
Mar 10  SZ   .   .   .   .   .   .
...

Empty cells = calm days (thin black border, white fill).
SZ = seizure, AU = aura, MG = migraine (2-letter codes per cohort).
Multi-event same day → "SZ x3" or "SZ, AU" or "SZ +2" for >2 types.

Episodes recorded:  Previous period: 8  ·  This period: 11
Days with events:   Previous period: 6  ·  This period: 9
```

**Rules for episode cohorts:**
- **Calm days = empty white cells with thin black border.** No light tints (vanish in B&W photocopy).
- **Event days = black geometric marker + 2-letter abbreviation.** Shape + label, never color-only.
- **Same-day collision = in-cell count compression.** `SZ x3` for repeated events; `SZ +2` for additional event types. Calendar never overflows; detail truncated, not paginated.
- **Side-by-side counts below**, never a labeled delta.

### 3.3 Cycle cohorts (Menstrual conditions, Endometriosis, PCOS)

Primary signal: **cycle days plotted on a temporal strip.**

```
CYCLE — last 90 days

Mar:  [  ]●●●●[             ]●     [             ]
Apr:  [●●●●  ]●     [             ●][            ]
May:  [●●●●●●●     [             ●][         ]

● = bleeding day (patient-marked)
[ ] = no-bleed day (calm)
Markers above the strip = patient-logged symptoms (S = symptom, P = pain).

Cycles in period:    Previous: 2  ·  This: 3
Bleeding-day count:  Previous: 11 ·  This: 14
```

- No "normal cycle length" annotation. No "irregular" wording (banned).
- Symptom markers above the strip, aligned by date.

### 3.4 Phase cohorts (Bipolar phase, MS, RA flare states, Parkinson on/off)

Primary signal: **phase bands across time + symptom marker density.**

```
PHASE OVERLAY — last 90 days

Mar:  ████████░░░░░░░░░░    ░░░░░░    ▓▓▓▓
Apr:  ▓▓▓▓░░░░░░░░    ████████    ░░░░░░░░
May:  ░░░░░░░░    ████████░░░░    

████ = patient-marked "active" / flare
▓▓▓▓ = patient-marked "transition"
░░░░ = patient-marked "baseline"
(Bands use stripe patterns, not color shading — B&W safe.)

Patient-marked phases this period:
  Active:      Previous: 12 days  ·  This: 18 days
  Transition:  Previous: 8 days   ·  This: 6 days
  Baseline:    Previous: 70 days  ·  This: 66 days
```

- Phase classification is **patient-authored** (the patient logs the phase each day). Software does not derive phase from symptoms.
- Bands use stripe pattern, not color shading.

### 3.5 Narrative cohorts (Long-COVID, IBS, Burnout, Autism, Cancer treatment)

Primary signal: **dated patient-authored entries.**

```
DIARY ENTRIES — last 90 days  (5 most recent shown)

15 May 2026
  "Tired again this morning. Walked to the post office;
   half-way I had to sit down. Felt better by lunch."

08 May 2026
  "Forgot dose yesterday — woke up confused this morning.
   Now back on schedule."

02 May 2026
  "Headache started around 14:00. Lasted ~3 hours. Took
   paracetamol. Notes for doctor: 4th headache this month."

24 Apr 2026
  "..."

17 Apr 2026
  "..."

[+12 entries not printed on this page]
```

- No "frequent symptom" / "top trigger" derivation. Software does not rank or curate.
- Entries shown in reverse-chronological order, top 5 by recency.
- Entries truncated to 120 chars per entry on page 1.

### 3.6 Custom cohorts

Patient-built blueprints with no preset shape. Primary block degrades to:
- An **inventory table** (`Type · Entries · Date span`)
- A **dated list** of the 5 most recent patient-authored entries

No chart, no aggregate beyond raw counts. Custom is the always-safe fallback when a cohort's primary signal is unknown.

---

## 4. The patient top line

Mandatory across all cohorts. Format:

```
{Name} wrote ({date}): "{free text}"
```

- **Pure free text.** No pick list, no structured sub-fields, no optional structured prompt alongside. Tribunal ruling 3-0.
- **180-character cap** with a visible counter at export time.
- **One structured prompt** at export time (cohort-agnostic):

  > *"What do you most want the clinician to notice on this page?"*

  The prompt is the same for every cohort. Locale-translated.
- **No sanitization** beyond character cap and Unicode normalization. If the patient writes nothing, the line reads: `{Name} ({date}): [no note provided]`.
- **Privacy disclosure at export time.** The export flow must tell the patient: *"This line will be visible on the printed page. Anyone who sees the page can read it."* Surfaced because R3 (Hans's wife seat) revealed family-folder privacy tension.

---

## 5. Scope statement (bottom of page)

Mandatory bottom-of-page block, ≤15mm tall, no banner styling:

```
This page displays patient-authored entries and raw values for the
selected period. It does not diagnose, rank importance, or interpret
change. Generated locally · ciphra {version} · {locale}.
```

Locale-translated. Plain text, no fill, no border. Black-on-white only.

---

## 6. Rendering contract

6.1. **jsPDF primitive only.** Every visual mark reproducible with `text()`, `line()`, `rect()`, `circle()`, `lines()` (paths), and `image()` (only for the wordmark). No screenshot-to-canvas, no SVG embed, no HTML-to-PDF.

6.2. **Embedded font: Noto Sans (Regular + Bold).** Subset to Latin Extended-A coverage (DE/FR/IT diacritics). Loaded once at module init, before any text rendering. Mandatory `addFileToVFS` + `addFont` pattern with explicit encoding map.

6.3. **Argon2 WASM in a Web Worker.** PDF generation does not begin until vault decryption completes. UI shows a determinate progress indicator during decryption (Argon2 takes ~1s on desktop, ~3-8s on low-end Android). Decryption is the only blocking step; PDF generation itself must finish within 2s on mid-range hardware.

6.4. **Type scale (codified, B&W-safe):**
- Compact / footnotes / continuation labels: 7pt
- Table text: 8pt
- Body text: 9pt
- Section heads: 11pt
- Top-line patient quote: 11pt (parity with section heads — anchors the page)
- Scope statement: 7pt
- Chart axis labels: 6pt

6.5. **Categorical color (where used at all): redundant only.** If we keep any color at all in the artifact, it must duplicate information that's already carried by shape and label. The 1-bit photocopy test is canonical: print the PDF, photocopy at 150dpi in B&W "save toner" mode, hand it back. If a doctor can't read it, the color was load-bearing and that's a bug.

6.6. **Line widths:**
- Data marker (filled): 0.55mm radius circle
- Calendar cell border: 0.2mm
- Axis line: 0.5mm
- Reading-space ruling (if drawn): NONE — keep as raw white space

6.7. **No autoTable for the primary block.** Primary block uses manual `rect()` + `text()` for full control over white space and B&W fidelity. autoTable is allowed for the side-by-side raw-value rows (vital cohorts) and for the patient-notes block, but with `theme: 'plain'`, no fill colors, hairline borders only.

---

## 7. The patient-authoring flow (out-of-scope-for-this-spec but mandatory)

Before generating the PDF, the export wizard must:

7.1. Show the **structured prompt**: *"What do you most want the clinician to notice on this page?"* with a 180-char free-text field.

7.2. Show the **privacy disclosure**: *"This line will be visible on the printed page. Anyone who sees the page can read it."*

7.3. Show the **scope confirmation**: a one-line summary of what's about to be exported (e.g., *"Last 90 days, 18 episodes, 5 lab draws"*) so the patient knows what's leaving the browser.

7.4. After generation, the PDF is offered for download. **It is not transmitted anywhere.** The patient is responsible for delivering it to the clinician (paper, AirDrop, email — their choice).

---

## 8. What is intentionally absent

The R1–R5 campfire surfaced many tempting additions. The binding spec rejects each:

- **No clinical summary paragraph.** No prose narrative of the data. Even count-based prose reads like interpretation through word choice.
- **No "top findings" section.** "Top" implies curation. Use sorted tables with the patient's own order, never software-ranked.
- **No trend arrows / up-down indicators.** Even neutral arrows imply directionality.
- **No completeness score.** "Entries on 41 of 81 dates" is fine in side-by-side raw form; "51% complete" or "good logging" is not.
- **No reference range bounds on charts.** Dashed clinical-range lines position values relative to "normal" — a derived clinical frame.
- **No connecting lines on sparklines.** A line between dots is interpolation. Dots are measured points.
- **No hero numerics.** Large numbers imply significance. All numerics use the codified type scale at 9pt body or smaller.
- **No streak counters.** "X days seizure-free" gamifies symptom-free days. Patient diary is not a fitness app. The calm-day calendar markers carry the same information without the resetting-counter shame.
- **No "patient-reported" labels** decorating data sections. The scope statement at the bottom names provenance once.
- **No "for the clinician" framing** of the artifact. No "key facts for your visit" bullets. No curated "top symptoms." No "summary box."
- **No defensive banner at top.** Scope statement lives at the bottom, plain.
- **No AI-generated medical language.** No NLP transformation of patient logs.
- **No reading-space label.** White space at bottom is available for clinician annotation but never invited or labeled — that would prescribe a workflow.

---

## 9. Cohort coverage matrix

| Cohort family | Primary block | Secondary | Page 1 example fits? |
|---|---|---|---|
| Vital — Hashimoto | TSH + free T4 rows + dots + dose strip | Patient notes (3) | Yes |
| Vital — Hypertension | SBP/DBP rows + dots + medication strip | Patient notes (3) | Yes |
| Vital — Diabetes T1 | Fingerstick rows + dots + insulin strip | Patient notes (3) | Tight (calendar omitted) |
| Vital — Bipolar polarity | Polarity rows + dots + medication strip | Patient notes (3) | Yes |
| Vital — Parkinson | UPDRS rows + dots + medication strip | Patient notes (3) | Yes |
| Episode — Epilepsy | Calendar grid + count comparison | Patient notes (3) | Yes (truncation possible at >40 events) |
| Episode — Migraine | Calendar grid + count comparison | Patient notes (3) | Yes |
| Episode — ADHD | Calendar grid + count comparison | Patient notes (3) | Yes |
| Episode — RA flares | Calendar grid + count comparison | Patient notes (3) | Yes |
| Episode — IBD | Calendar grid + count comparison | Patient notes (3) | Yes |
| Episode — Asthma | Calendar grid + count comparison | Patient notes (3) | Yes |
| Cycle — Menstrual | Cycle strip + bleeding-day count | Patient notes (3) | Yes |
| Cycle — Endometriosis | Cycle strip + pain count | Patient notes (3) | Yes |
| Cycle — PCOS | Cycle strip + symptom count | Patient notes (3) | Yes |
| Phase — Bipolar phase | Stripe-band timeline + day counts | Patient notes (3) | Yes |
| Phase — MS | Stripe-band timeline + flare counts | Patient notes (3) | Yes |
| Phase — Autism | Stripe-band timeline + day counts | Patient notes (3) | Yes |
| Narrative — Long-COVID | Diary entries (5 recent) | — (entries dominate) | Yes |
| Narrative — IBS | Diary entries (5 recent) | — | Yes |
| Narrative — Burnout | Diary entries (5 recent) | — | Yes |
| Narrative — Cancer treatment | Diary entries (5 recent) | — | Yes |
| Narrative — Dermatology | Diary entries (5 recent) | — | Yes |
| Custom | Inventory table + 5 recent entries | — | Yes |

23 cohorts × hard-1-page = all fit. Truncation triggered only on episode cohorts with >40 events in 90 days (rare).

---

## 10. Implementation deltas (from current `pdf.ts`)

The redesign requires substantial rewrite. The current `pdf.ts` (4110 lines) is keyed to a multi-page "comprehensive PDF" model. The new model is single-page with subtractive cohort variants.

**Stays:**
- jsPDF primitive setup, font loading, page initialization
- The `cohortOf(blueprint)` resolver (already cohort-aware)
- `paintPaper` (becomes a no-op or pure-white in new model)
- The seed personas (Hans/Helena/Anna/Klaus/Rita/etc.) for testing
- `pdfTrajectory.ts`, `pdfCycleStrip.ts`, `pdfPhaseDistribution.ts`, `pdfDailyMonthChart.ts` — the renderable primitives can be reused with rule changes

**Goes:**
- Multi-page page layout (vital-trends section, episode-duration table, symptom-frequency table, medication-adherence table as separate pages)
- KPI tiles (`tileVitalLastValue`, `tilePhaseTopN`, etc.) — all 14 tile factories
- The 24-month trajectory chart
- The trajectory pill (already neutralized in DSPEC-2, now removed)
- The disclaimer banner (already neutralized in DSPEC-1, now moved to scope-statement footer style)
- The "for-doctor" bullets page
- Monthly grid table (for episode cohorts; replaced by calendar primary block)
- Cohort accent color resolver (`resolveCohortAccents`) — colors retire from the artifact
- All `setFontSize` calls except those mapped to the new TYPE scale

**Adds:**
- `drawPatientTopLine(doc, name, date, freeText, x, y, w)`
- `drawVitalCohortPrimary(doc, blueprint, docs, x, y, w, h)`
- `drawEpisodeCohortPrimary(doc, blueprint, docs, x, y, w, h)`
- `drawCycleCohortPrimary(doc, blueprint, docs, x, y, w, h)`
- `drawPhaseCohortPrimary(doc, blueprint, docs, x, y, w, h)`
- `drawNarrativeCohortPrimary(doc, blueprint, docs, x, y, w, h)`
- `drawCustomCohortPrimary(doc, blueprint, docs, x, y, w, h)` (fallback)
- `drawDotsOnlySparkline(doc, values, dates, x, y, w, h)` (no connecting lines, no ref range)
- `drawCalmDayCalendar(doc, events, dateRange, x, y, w, h)` (B&W cells, in-cell collision compression)
- `drawDoseChangeStrip(doc, doseChanges, x, y, w, h)` (vertically aligned, separate axis)
- `drawScopeStatement(doc, locale, version, x, y, w)`

**Banned-word lint:** new vitest pinning that no string in `pdf.ts` or i18n files matches the banned-word regex (case-insensitive, word-boundary). Already partially exists for "Stimmungspolarität"; extend to the full banned list.

---

## 11. Test plan

11.1. **Vitest snapshot test per cohort.** Render `generateClinicalHandoff(blueprint, docs)` for each of the 23 cohorts using seed-persona fixtures. Snapshot the page-1 layout (text + element positions). Existing seed scripts (`seed_hans.py`, `seed_helena.py`, etc.) provide the fixture data.

11.2. **B&W photocopy fidelity test.** Manual: print the test corpus, photocopy at 150dpi in "save toner," scan back. Visual diff for legibility. Document any unreadable elements.

11.3. **Locale parity.** All 4 locales (DE/EN/FR/IT) render every layout block. Existing `i18n/parity.test.ts` covers key set; extend to check scope-statement, banned-word, and patient-prompt strings.

11.4. **Banned-word lint as a vitest.** Already noted in §10. Failing this test blocks merge.

11.5. **MDR auditor review.** Before launch, the rendered PDF for each cohort goes to a regulatory review. Question: "Does this artifact, as rendered, qualify as 'medical device software' under MDR Article 2(1) / MDCG 2019-11 §3.2?" If yes → revise. If no → ship.

---

## 12. Open follow-ups (not blocking ship)

12.1. **Companion HTML appendix** as optional second artifact for the patient's own browser-side drill-down. Codex's R1 idea, demoted to nice-to-have. Not a clinical handoff — a patient-side data browser.

12.2. **Multi-locale top-line examples.** Three localized concrete examples per cohort family, to seed the patient-prompt UI as placeholder text. Out of scope for the spec; in scope for the export-wizard implementation.

12.3. **The Settings entry point.** Where in the ciphra app does the patient access this export? Today it's `/reports → Export PDF`. Spec is silent on this — UI affordance lives outside the artifact contract.

12.4. **Treatment-change source-of-truth.** For vital cohorts, dose changes come from the patient's medication log. The current data model has medications as a daily log entry, not as discrete "dose change events." A future schema migration may introduce `treatment_change` documents with effective-date + old-value + new-value, eliminating today's "find the day the dose changed" reconstruction.

---

## 13. What this spec does NOT govern

- The ciphra app's calendar / journal / reports / dashboard UI. Those have their own design.
- Family-share PDFs (currently the family-grant invitation PDF — different artifact, different purpose).
- The recovery-code printout (different artifact).
- The companion HTML appendix (12.1).

This spec governs ONE artifact: the patient-generated clinical handoff PDF delivered at the doctor visit.

---

**Workflow archive:** R1–R5 campfire transcripts + tribunal rulings are referenced in conversation memory. The 7 tribunal splits, votes, and reasoning are pinned in the dev backlog; revisit if any binding decision is challenged in the future.
