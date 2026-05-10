# Doctor-PDF dogfood walkthrough (PI v23 B2')

Dual-fixture walkthrough: Anna (bipolar I, phase cohort, `seed_anna_bipolar.py`) and Hans (focal epilepsy, discrete cohort, `seed_hans_epilepsy.py`). Each finding carries two lenses:

- **Patient-as-themselves** — what the persona thinks reading their own PDF before they hand it over
- **Patient-imagining-recipient** — what the persona thinks their psychiatrist (Anna) or neurologist (Hans) will see

Surgical fixes capped: ≤30 lines per fix, ≤2 fixes total inside this PI. Larger findings break into separate PI v24 stories with explicit severity tags.

---

## Anna's PDF — bipolar I, 2 years on lithium + lamotrigine

**Render path:** `pdf.ts` → `cohortSections.ts:sectionsForCohort('phase')` returns `[header, disclaimer, doctor-glance, trend, phase-distribution, day-coverage-strip, condition-aware-bullets, symptom-grid, footer]`. The PI v21 Track-B-4a `drawPhaseDistribution` chip applies. KPI tiles per cohort switch at `pdf.ts:1547` use the phase branch (manic/depressive/mixed counts + days-logged + trigger).

### F-A1 — Phase distribution shows current month only, not the 2-year arc

**Where:** `pdf.ts` phase-distribution call site at `pdf.ts:1583+` (post-PI-v21 Track-B-4a). Section renders bipolar's manic/depressive/mixed % for the **focus month**. Anna's actual story is the 2-year ARC (5 episodes year 1, 2 year 2 — the lithium-stabilization narrative is what her psychiatrist needs to see).

**Patient-as-self:** "The bar shows my current month, not the trend of how lithium has been working. That's what we discuss every appointment — am I more stable than 18 months ago?"

**Patient-imagining-psychiatrist:** "Dr. M opens this and sees 'Apr 2026: 12% depressive.' She doesn't see that I went from 5 episodes/year to 1 hypomanic + 1 short depressive. The PDF surfaces the snapshot, not the arc."

**Severity:** `pi24-important`. Architectural change — drawPhaseDistribution is single-month by design. A 2-year version belongs in the 24-month trajectory section, not the cohort-conditional middle. **Out of scope for B2' surgical-fix cap.** Story candidate for PI v24: extend `drawPhaseDistribution` with a `--scope` mode that bins percentages per quarter or per year for the long-arc view.

### F-A2 — KPI tile "Most frequent symptom" is information-poor for bipolar

**Where:** `pdf.ts:1547-1561` — the KPI cohort switch picks `tileTopSymptom` for the phase cohort.

**Patient-as-self:** "It says 'Reizbarkeit (8)' — irritable 8 times. That's not what's interesting about my bipolar. What's interesting is whether I had any manic days this month."

**Patient-imagining-psychiatrist:** "If Dr. M sees 'Most frequent symptom: irritable' she'll skip past that tile. She wants 'Manic days: 0,' 'Depressive days: 6,' 'Stable days: 24.'"

**Severity:** `pi23-ship-candidate`. The PDF_REWRITE.md §6 already drafted `tilePhasePct(ctx, 'manic')` and `tilePhasePct(ctx, 'depressive')` as the right tiles for phase cohort but PI v21 didn't ship those — kept the generic `tileTopSymptom` instead.

**Surgical fix shape:** swap the phase-cohort case at `pdf.ts:1553-1554` from `[tileEpisodes(), tileTopSymptom(), tileTopTrigger(), tileRescueMed()]` to `[tileEpisodes(), tilePhasePctManic(), tilePhasePctDepressive(), tileTopTrigger()]`. New helpers `tilePhasePctManic()` and `tilePhasePctDepressive()` aggregate days-with-`episodes.manic > 0` / days-in-month from the focus-month docs. **Estimated diff: ~25 lines (within cap).** **Ship candidate B2-fix-1.**

### F-A3 — No medication-side-effect surfacing

**Where:** Anna's blueprint has 4 vitals but no explicit "side effects" tracking. Lithium tremor / weight gain / thyroid effects are clinically central; `weight` vital is in the blueprint but the PDF's vital-trajectory section doesn't flag it as side-effect-relevant.

**Patient-as-self:** "I'm gaining weight — 4kg over 18 months. That's lithium. Should be on the front page; instead it's somewhere down in the vital trajectories."

**Patient-imagining-psychiatrist:** "Lithium dose adjustment is the conversation. Without weight change being highlighted, Dr. M might miss it on a quick read."

**Severity:** `pi24-important`. Requires a "clinically relevant side-effect" annotation on vitals — a blueprint-level metadata change. Out of scope for B2' surgical-fix cap. PI v24 candidate: add `clinicalSignificance` field on `VitalField` type + render flagged vitals at top of vital trajectories.

### F-A4 — Day-coverage strip phase tinting reads anonymously

**Where:** `pdf.ts:drawDayCoverageStrip` (PI v19 Track A Story 1 + Story 2). Each cell tinted by symptom-load × cohort accent. For Anna's phase cohort, accent is purple (#A855F7 from blueprint).

**Patient-as-self:** "All my high-symptom days look the same shade of purple. There's no visual difference between a manic day and a depressive day in the strip — but those are clinically opposite."

**Patient-imagining-psychiatrist:** "She'd want to see 'this stretch was the depressive episode' as a visually distinct color from the manic day pattern. Otherwise she has to read each day's chips."

**Severity:** `pi24-important`. Requires phase-aware tinting on the day-coverage strip — extension of the strip's render path. Story candidate: cell tint = phase-color (manic red, depressive blue, mixed purple) when an episode is active, else the cohort accent. **Out of scope for B2' surgical-fix cap.**

---

## Hans's PDF — focal epilepsy, 2 years on lamotrigine + levetiracetam

**Render path:** `pdf.ts` → `cohortSections.ts:sectionsForCohort('discrete')` returns `[header, disclaimer, doctor-glance, trend, day-coverage-strip, condition-aware-bullets, symptom-grid, footer]`. **No phase-distribution, no cycle-strip, no trigger-frequency.** KPI tiles per cohort switch at `pdf.ts:1549-1550` use the discrete branch (`[tileEpisodes(), tileRescueMed(), tileTopSymptom(), tileTopTrigger()]`).

### F-H1 — Medication adherence section may not show the 2-AED transition narrative

**Where:** `pdf.ts:2880+` — `t('pdf.medication_adherence')` table renders `[medication, schedule, taken, adherence]` per drug. Hans went from lamotrigine-only (year 1) to lamotrigine + levetiracetam (year 2 onwards). The table shows current state but not the transition.

**Patient-as-self:** "My neurologist's main interest is whether the AED change worked — focal-monthly went from 4 to 1. The medication table shows '2 medications' but not 'levetiracetam was added 12 months ago and that's when seizures dropped.'"

**Patient-imagining-neurologist:** "Dr. K wants to confirm the levetiracetam was the right call. The PDF shows current adherence but doesn't anchor the trajectory to the medication change."

**Severity:** `pi24-important`. Requires "medication timeline" vs "medication adherence table" — a new section with start-date + change-date events overlaid on the seizure trend. **Out of scope for B2' surgical-fix cap.** PI v24 candidate.

### F-H2 — Episode duration + time-of-day fields aren't surfaced in summary

**Where:** Hans's blueprint sets `trackDuration: True, trackTimeOfDay: True` on every episodeType. `pdf.ts:2684+` and `pdf.ts:3526+` handle these fields when rendering individual episodes, but the doctor-glance section doesn't aggregate them.

**Patient-as-self:** "Most of my focals are <1min. The few that go >5min are the ones that worry me. The PDF doesn't surface that distribution — Dr. K has to read individual log entries."

**Patient-imagining-neurologist:** "Status epilepticus risk hinges on duration distribution. A KPI tile 'Mean duration: 87s, longest 4m12s' would change how she thinks about treatment."

**Severity:** `pi23-ship-candidate`. Adding a duration-distribution summary to the discrete-cohort KPI tiles (replacing one of the existing tiles, not adding chrome) is bounded.

**Surgical fix shape:** add `tileEpisodeDurationP90()` helper that computes the 90th-percentile duration from focus-month episode log entries (where `episodeTypes[].trackDuration: true`). Swap the discrete-cohort case at `pdf.ts:1549-1550` from `[tileEpisodes(), tileRescueMed(), tileTopSymptom(), tileTopTrigger()]` to `[tileEpisodes(), tileEpisodeDurationP90(), tileRescueMed(), tileTopTrigger()]`. The dropped `tileTopSymptom` in the discrete branch is information-poor for epilepsy too — paired drop justified. **Estimated diff: ~30 lines (at cap).** **Ship candidate B2-fix-2.**

### F-H3 — Side-effect notes (Keppra mood) have no dedicated render

**Where:** Hans's seed comment notes "side-effect notes about mood changes from Keppra" (year 2). The blueprint has `behavior` symptom group with `aggressive`, `irritable`, etc. — these capture the mood change. But the PDF doesn't link symptom incidence to medication change date.

**Patient-as-self:** "I started getting irritable about a week after Keppra was added. The diary captured it. The PDF shows my symptoms but doesn't say 'this trend started when Keppra was added.'"

**Patient-imagining-neurologist:** "She knows Keppra causes mood effects in ~15% of patients. A causal-link chart 'irritable-frequency before/after the dose change' would directly inform whether to switch to a different AED."

**Severity:** `pi24-polish`. Causal-link rendering is a research-grade feature; surgical fix unavailable. Out of scope.

### F-H4 — No cohort-conditional section for epilepsy specifically

**Where:** `cohortSections.ts:sectionsForCohort('discrete')` returns spine+tail with NO middle. Phase cohort gets `phase-distribution`; cycle gets `cycle-strip`; narrative gets `trigger-frequency`. **Discrete (Hans's cohort) gets nothing.**

**Patient-as-self:** "My PDF feels thinner than what I'd see on `/conditions/epilepsy`. The in-app condition page is rich — the PDF version is generic."

**Patient-imagining-neurologist:** "She probably won't notice — she's reading for the trend chart and medication table. But over time the discrete-cohort PDF could surface a 'seizure-cluster heatmap' or 'duration distribution chart' — those have no in-app equivalent."

**Severity:** `pi24-important`. Adding a discrete-cohort section to `cohortSections.ts` would be the architectural extension. **Out of scope for B2'.** PI v24 candidate: design memo for `drawSeizureClusterChart` or `drawDurationDistribution`, then ship.

---

## Cross-cohort findings (apply to both PDFs)

### F-X1 — 24-month trajectory chart end-marker is just a dot

**Where:** `pdf.ts:2186+` (the trajectory). End-of-line dot marks the last data point but doesn't say "this month." Both Anna and Hans benefit from a clearer "you are here."

**Anna patient-as-self:** "Where am I on this curve? The dot is the most recent month but I'd want a label."

**Hans patient-as-self:** "Same. The trajectory line ends; I'd like 'Apr 2026: 1 focal' as a label."

**Severity:** `pi24-polish`. Cosmetic. Out of scope.

### F-X2 — Doctor-handover prep page

**Where:** Doesn't exist. Both Anna and Hans treat the PDF as something they print + bring. The PDF could include a "5-second summary" page-1 callout that the doctor reads in elevator before opening the file.

**Anna patient-as-self:** "Dr. M has 30 minutes. She reads page 1 in the first 60 seconds. What does she actually need?"

**Hans patient-as-self:** "Same with Dr. K. Page 1 is the whole game."

**Severity:** `pi24-blocker` (for the launch story). The doctor-glance KPI tiles ARE the page-1 summary, but they're cohort-tweaks of generic tiles, not a curated "what changed since last visit" callout. PI v24 candidate: design memo for a "since-last-visit" delta block.

---

## PI v23 ship candidates (within B2' surgical-fix cap)

| ID | Finding | Estimated diff | Anchor persona |
|---|---|---|---|
| **B2-fix-1** | F-A2: Anna's KPI tiles → tilePhasePctManic + tilePhasePctDepressive | ~25 lines | Anna (phase) |
| **B2-fix-2** | F-H2: Hans's KPI tile → tileEpisodeDurationP90 (drops tileTopSymptom) | ~30 lines | Hans (discrete) |

**Total: 2 fixes, ≤55 lines.** Within cap (≤2 fixes, ≤30 lines each).

Both fixes are KPI-tile-cohort-switch entries — same type of change as PI v21's KPI work. Low blast radius. Sprint 2 ships them as paired commits (Track A and Track B both serve respective anchor personas).

---

## Deferred to PI v24 (in priority order)

| Severity | ID | Cohort | Description |
|---|---|---|---|
| `pi24-blocker` | F-X2 | both | "Since-last-visit" delta block on PDF page 1 |
| `pi24-important` | F-A1 | phase | Phase distribution `--scope` mode (24-month arc) |
| `pi24-important` | F-A3 | phase | Vital `clinicalSignificance` annotation + side-effect surfacing |
| `pi24-important` | F-A4 | phase | Phase-aware day-coverage strip tinting |
| `pi24-important` | F-H1 | discrete | Medication-timeline section (transitions, not adherence-only) |
| `pi24-important` | F-H4 | discrete | Discrete-cohort cohortSections middle (heatmap or duration distribution) |
| `pi24-polish` | F-X1 | all | Trajectory end-marker label |
| `pi24-polish` | F-H3 | discrete | Causal-link rendering (symptom × medication change date) |

---

## Methodology note

Patient-imagining-recipient lens caught 4 findings the patient-as-self lens missed: F-A1 (arc not snapshot), F-A2 (info-poor tile), F-H2 (duration distribution missing), F-X2 (page-1 summary). The dual-lens structure is load-bearing — single-lens dogfood would have shipped a thinner memo.

For PI v24's B2-equivalent: keep the dual-lens. Add a third lens (recipient-as-self — Dr. M's actual workflow if accessible via dogfood with a real psychiatrist or neurologist contact). Without a real recipient, "patient-imagining" is the best approximation.
