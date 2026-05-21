# PDF_TEMPLATE — ciphra doctor PDF spec

> **SUPERSEDED 2026-05-21** by `CLINICAL_HANDOFF.md` after the 5-round
> "design from scratch" campfire + tribunal. The new spec replaces
> both this file and `PDF_DESIGN_SPEC.md`. This file is kept only as
> historical reference for the current `pdf.ts` implementation while
> the rewrite is in progress. Do not extend this spec; extend
> `CLINICAL_HANDOFF.md` instead.

Status: **superseded**. This document was the contract for what the
doctor PDF renders for any cohort. Cohort developers, future P-PDF-X
commits, and downstream tribunal reviewers read this file to know
what each section is allowed to do.

This spec was forged through a 5-round campfire (Codex + Claude) and
revised after a red-team tribunal that found 72 places the original
draft crossed the medical-device boundary. The revised spec below
applies all 72 fixes. The campfire history is preserved in
`memory/feedback_pdf_clinician_lens.md`.

---

## Philosophy

ciphra is a **data-gathering tool, not a medical analysis tool — not
even implicitly**. The doctor PDF is **a summary of the patient's
own logged entries** — a printable / shareable export of the record
the user has been keeping. It organizes those entries, formats
them for fast scanning, and presents source metadata. The user
decides who to share it with; ciphra does not pre-declare the
audience.

**ciphra does not diagnose, interpret, classify risk, evaluate
treatment response, score symptoms, label values normal or abnormal,
or recommend action.** The PDF holds the data in cohort-conditional
layout shells; the clinician brings the interpretation.

The template is **one universal data-organization scaffold with
cohort layout modules selected by declared blueprint capability and
data presence**. What stays identical across cohorts: document
structure, attribution rules, provenance language, empty-state
behavior, page grammar. What varies per cohort: which entered-data
categories appear in summary position, which context dimensions
matter for display grouping, whether dedicated log sections render
when entries exist for them.

### Global invariants (Non-negotiable)

These apply to every section, every cohort, every mode:

1. **No derived risk.** ciphra does not compute, infer, or display
   risk classification, escalation status, "acute" labels, "red
   flags," or triage signals. There is no `hasAcuteEscalationRisk`
   predicate, no "Standalone Safety" section, no Page 1 alerting
   behavior, no "no risk detected" copy (negative safety status is
   still safety status).

2. **No treatment-response evaluation.** ciphra does not assess
   whether medication use, dose changes, or interventions caused or
   correlated with changes in symptoms, vitals, or any other field.
   It may show medication-entry timestamps on the same timeline as
   other entries; it does not state or imply causation, response,
   effectiveness, adherence quality, or treatment burden.

3. **No abnormality computation.** Reference ranges may be displayed
   when imported from a laboratory source or entered by a clinician
   as source metadata, with attribution. ciphra never computes
   abnormal / high / low / safe / unsafe / improved / worsened
   labels for any value.

4. **No narrative-to-claim inference.** Diary text and free-text
   notes are displayed as user-entered content, optionally grouped
   by date, author role, or user-applied tags. ciphra does not
   extract themes, sentiments, trends, or clinical claims from
   narrative content.

5. **Blueprints define DISPLAY, not INFERENCE.** Cohort blueprints
   may declare fields, labels, units, ordering, grouping, static
   display sections, source-attributed metadata, and context
   dimensions. **Blueprints may not define diagnostic, prognostic,
   risk, triage, treatment-response, abnormality, recovery,
   worsening, improvement, stability, or escalation rules** — moving
   clinical-inference logic into configuration does not avoid MDR
   exposure, configurable clinical decision logic is still clinical
   decision logic.

6. **Page 1 contains only neutral summaries.** Identity, report
   window, provenance, populated summary counts/values, source
   coverage. No derived clinical states, no priority signaling
   surfaced for clinician attention. Page 1 is orientation, not
   triage.

7. **Provenance and disclaimer attach to every report.** Every PDF
   carries the line "Patient-entered data summary. ciphra organizes
   the user's recorded entries into a printable summary. ciphra
   does not diagnose, interpret, classify risk, evaluate treatment
   response, or recommend action." Sharing the export with anyone
   — including a clinician — is the user's choice; ciphra does not
   pre-declare the audience.

---

## Predicate glossary

### Data-capability predicates (declared in blueprint)

- `supportsSymptomRating` — blueprint declares a numeric
  patient-entered symptom rating field. (NOT "severity intensity
  signal" — keep this as user-entered, not clinical severity.)
- `supportsEventCount` — blueprint declares countable discrete-event
  fields.
- `supportsEpisodeDuration` — blueprint declares duration fields
  attached to events.
- `supportsPhaseLabels` — blueprint declares user-entered phase
  labels with start/end dates (cycle phase, multiDay flare period).
- `supportsVitals` — blueprint declares vital-sign measurement
  fields included in the cohort display template.
- `supportsLabs` — blueprint declares laboratory-result fields
  included in the cohort display template.
- `supportsGrowthFields` — blueprint declares pediatric growth
  measurements (height, weight-for-age) with optional source-imported
  reference curves.
- `supportsNarrative` — blueprint declares free-text diary or note
  fields.
- `supportsMedicationLogging` — blueprint declares medication-use
  entry fields (scheduled doses, rescue doses, taken/skipped flags).
- `supportsContextDimensions` — blueprint declares display-grouping
  context fields (e.g. `school_day`, `weekend`, `home`, `clinic`,
  `caregiver`, `teacher`).
- `supportsWatchlistFields` — blueprint declares fields that a user
  or clinician may flag as worth highlighting in the appendix
  watchlist table. **Note**: watchlist is display-only — entries
  match a literal field criterion (e.g. "show entries where
  bp_systolic was entered as a value > 180"). It is not risk
  classification, not alerting, not triage, and never renders on
  Page 1.
- `hasCohortAppendix` — blueprint declares cohort-specific
  reference material for the appendix.

### Data-presence predicates (data exists in scope window)

- `hasAnySummaryData` — at least one entry, event, vital, lab,
  medication, or narrative record exists in the report window.
- `hasSymptomRatingData` — at least one symptom rating entry exists.
- `hasEventData` — at least one event entry exists.
- `hasDurationData` — at least one duration-tagged event entry exists.
- `hasPhaseLabelData` — at least one user-entered phase label exists.
- `hasVitalData` — at least one vital entry exists.
- `hasLabData` — at least one lab record exists.
- `hasNarrativeData` — at least one diary/note entry exists.
- `hasMedicationLogData` — at least one medication-use entry exists.
- `hasContextData` — at least one entry has a cohort-declared context
  dimension assigned.
- `hasConfiguredWatchlistMatch` — at least one entry matches a
  literal display criterion declared by the blueprint's watchlist
  fields. **Display only.**
- `hasMultipleObserverRoles` — entries in the window were authored
  by more than one role.

### Derived (display-routing) predicates

- `primaryDisplayMode` — the layout mode selected by the cohort
  template and available entered data; one of `symptom_ratings`,
  `event_series`, `vital_series`, `narrative_log`, `mixed`. Renamed
  from `primaryTrackingMode` because "tracking" implied analytic
  framing. **Not "dominant evidence mode."**
- `trajectoryDisplayType` — the display format for values-over-time
  rendering; one of `numeric_values_over_time`, `event_counts_over_time`,
  `duration_over_time`, `no_trajectory`. **No clinical framing**
  (no `recovery`, `stability`, `comfort`, `flare-control`,
  `function`).
- `observerRole` — the role that observed the entry directly.
- `authorRole` — the role that entered the entry into ciphra.
- `showsMedicationLogSection` — the selected template includes a
  medication-log summary when medication entries exist. (Renamed
  from `requiresMedicationUseSection`. No "treatment burden,"
  no "primary clinical question.")
- `showsWatchlistSection` — the selected template includes an
  appendix table listing watchlist matches. Off by default; opt-in
  per blueprint.
- `isCustomCohort` — report from user-built blueprint.

### Report-eligibility predicates (PDF-level gating)

- `hasMinimumReportData` — the report has enough entries to render
  the normal summary view rather than the onboarding mode.
- `isOnboardingMode` — report is in day-1 mode because
  `hasMinimumReportData` is false. Suppresses longitudinal display
  and any cross-time summaries.
- `canRenderPdf` — identity, cohort selection, report window, and
  either normal data or onboarding eligibility are present.

---

## Section spec

The PDF has two modes. **Normal mode** renders when
`hasMinimumReportData` is true. **Onboarding mode** renders when
`isOnboardingMode` is true; it keeps the same shell + identity but
suppresses every longitudinal display (no values-over-time, no
event-count summaries, no comparisons).

**Medication-log content** is normally an overlay (medication
timestamps shown alongside other entries on the timeline). It is
promoted to a dedicated section (Section 9) only when
`showsMedicationLogSection` is true AND `hasMedicationLogData` is
true. The section displays log entries as data, **never as response
evaluation**.

**Watchlist content** is opt-in via `supportsWatchlistFields` +
`showsWatchlistSection`. When rendered, it lives in the appendix
(Section 15) as a flat table of matching entries with their literal
matching criterion. No Page 1 surfacing, no markers on charts, no
"triggered" language.

**Values-over-time content** renders only when there are entries
across the comparison window and the cohort blueprint declares which
fields support the display. Format is selected by
`trajectoryDisplayType`. **Never improving / worsening / stable /
recovering / flaring — those are clinical interpretations.** The
section reports direction + amount of change in neutral terms ("TSH
values increased over the report window from 1.9 mU/L mean to 3.4
mU/L mean") or omits when data is insufficient.

### 1. Report identity

**Gate:** `report-eligibility` (`canRenderPdf`)
**Renders:** Patient name or initials, cohort name, report window,
generation date, a "patient-entered data summary" label, and a
compact data-coverage line. In onboarding mode the coverage line
states this is a baseline setup view rather than a longitudinal
data summary. The section never renders inferred diagnoses, status
labels, or condition assessments. It identifies
the report, the cohort, and the entry window only.
**Modes:** all
**Page:** 1
**Notes:** Provenance disclaimer attached.

### 2. Onboarding baseline

**Gate:** `report-eligibility` (`isOnboardingMode`)
**Renders:** A day-1 view of the cohort's declared tracking
template, the data categories the PDF will summarize once enough
entries exist, and any already-entered baseline facts (medications
configured at setup, declared cohort). It does not render empty
metric rows, does not imply stability / improvement / worsening /
response / risk, and does not promise any clinical claim once
data accumulates — only that more entries will allow more
displays.
**Modes:** all
**Page:** 1
**Notes:** Replaces longitudinal display content in normal-mode
section 4+. Coexists with identity and provenance.

### 3. Summary data row

**Gate:** `data-presence` (`hasAnySummaryData`)
**Renders:** A responsive row of summary tiles for the data
categories that have entries in the report window. Each tile shows
a count, a total, a most-recent value, or a per-window metric —
all with units and denominators where applicable. The row collapses
to the number of populated tiles. The tiles selected for display
are pre-declared per cohort in a static priority order; ciphra
does not compute priority dynamically based on clinical relevance.
**Modes:** all
**Page:** 1
**Notes:** Renamed from "KPI evidence row" because KPI vocabulary
implied performance indicators. No empty placeholders. Missing
categories are omitted from this section; appendix may carry
exhaustive lists.

### 4. Values over time

**Gate:** `derived` (`trajectoryDisplayType !== 'no_trajectory'` and
data exists for the selected display type)
**Renders:** A neutral display of numeric or count values across
the report window for the cohort's primary display category.
Format is selected by `trajectoryDisplayType`:
`numeric_values_over_time` shows a line of recorded values with
units and timestamps; `event_counts_over_time` shows a bar of event
counts per time bucket; `duration_over_time` shows a band of
recorded episode durations. The section reports **direction and
amount of change in neutral language** ("TSH values rose by X mU/L
between the first half and the second half of the window") **or
omits** when the data is insufficient. **Never** "improving,"
"worsening," "stable," "recovering," "flaring," "comfort," or
"function."
**Modes:** point-event / duration-phase / lab-vital
**Page:** 1 or 2-N
**Notes:** Replaces the old "Trajectory Summary" section. No
clinical framing.

### 5. Primary display section

**Gate:** `derived` (`primaryDisplayMode`)
**Renders:** The main body content for the cohort's selected
display mode. `symptom_ratings` renders distribution and recent
values of patient-entered ratings. `event_series` renders event
counts by day/week and gaps between events. `vital_series` renders
recorded values with units, timestamps, source, and any
**imported** reference ranges or clinician-entered metadata
displayed verbatim with attribution. `narrative_log` renders
user-entered narrative entries grouped by date and author role,
with excerpts. `mixed` renders the cohort-declared combination of
populated categories ordered by template-defined display order.
**Modes:** all
**Page:** 1 or 2-N
**Notes:** ciphra does not classify vital values as normal,
abnormal, high, low, safe, unsafe, improved, or worsened. Custom
cohorts must select a `primaryDisplayMode` value.

### 6. Timeline

**Gate:** `data-presence` (`hasAnySummaryData`)
**Renders:** A chronological view of logged observations inside the
report window, including events, phase labels (when user-entered),
medication entries, vitals, labs, and narrative entries. The
timeline shows sequence and timestamps. **It does not imply
causation, response, clinical significance, or proximity-based
interpretation.**
**Modes:** all
**Page:** 2-N
**Notes:** Medication entries appear inline as timestamped points,
not as response-overlay annotations.

### 7. Context comparison

**Gate:** `data-capability` + `data-presence`
(`supportsContextDimensions`, `hasContextData`, with enough
entries per context to display denominators)
**Renders:** Per-context counts or per-context value displays for
the declared context dimensions (school_day vs weekend, home vs
clinic, caregiver-logged vs teacher-logged, etc.). Reports counts
or means with denominators. **Does not state whether differences
are clinically meaningful.**
**Modes:** point-event / duration-phase / narrative
**Page:** 2-N
**Notes:** Generalizes beyond AM/PM splits. Context labels come
from blueprint or from logged role tags.

### 8. Medication timing overlay

**Gate:** `data-capability` + `data-presence`
(`supportsMedicationLogging`, `hasMedicationLogData`,
not `showsMedicationLogSection`)
**Renders:** Medication-entry timestamps displayed on the same
timeline as other entries in sections 4, 5, and 6, so the reader
can see the time of administration alongside other logged data. The
PDF **does not** evaluate whether medication use changed anything,
state response, calculate effectiveness, or imply causation.
**Modes:** all
**Page:** 1 or 2-N
**Notes:** Renamed from "Treatment Response Overlay." Cross-cut on
sections 4, 5, 6.

### 9. Medication log summary

**Gate:** `derived` + `data-presence`
(`showsMedicationLogSection`, `hasMedicationLogData`)
**Renders:** A dedicated medication-log table showing recorded
doses, rescue doses, user-entered taken/skipped/changed flags,
dose dates, and any user-entered notes attached. Displays log
entries as data only.
**Modes:** point-event / narrative
**Page:** 2-N
**Notes:** Renamed from "Medication Use and Burden." No "treatment
burden," no "adherence-relevant" labeling, no "primary clinical
signal" framing. The user may have logged "missed" or "skipped"
flags themselves — those render as the user entered them, not as
ciphra-derived adherence assessment.

### 10. Vital, lab, and growth display

**Gate:** `data-presence` (`hasVitalData` or `hasLabData` or
(`supportsGrowthFields` and growth measurements exist))
**Renders:** Vital signs, lab values, and pediatric growth fields
with cohort-appropriate labels, units, timestamps, and source
attribution. **Imported reference ranges** from laboratory sources
or clinician-entered metadata display verbatim with source
attribution. ciphra does not compute, calculate, or assign
abnormality labels. Growth content renders only when
`supportsGrowthFields` is declared and the relevant pediatric
measurements exist; generic vitals alone do not create a growth
section.
**Modes:** lab-vital
**Page:** 2-N or appendix
**Notes:** No "normal/abnormal" / "high/low" / "concerning" /
"target met" computation. If an imported lab metadata field carries
"high" or "low" verbatim, that imported label may display with
clear attribution to the source.

### 11. Duration and phase display

**Gate:** `data-capability` + `data-presence`
(`supportsEpisodeDuration` or `supportsPhaseLabels`, with matching
data)
**Renders:** User-entered episode durations and user-entered phase
labels with their start dates and end dates. Lists current
user-entered phase label (if any) and timestamp. Displays per-phase
totals (count of entries, sum of durations) without computing
phase-control / control-quality labels.
**Modes:** duration-phase
**Page:** 2-N
**Notes:** Phase labels render as user-entered. ciphra does not
assign "recovery," "flare," "remission," or "treatment-phase" status.

### 12. Narrative entries

**Gate:** `data-capability` + `data-presence`
(`supportsNarrative`, `hasNarrativeData`)
**Renders:** Narrative entries selected by date range, user-applied
tags, author role, or template display rules. Excerpts are preferred
over generated summaries. If a summary is rendered, it is clearly
marked non-clinical and remains a faithful condensation of
user-entered text without diagnosis, risk, response, or trend
inference.
**Modes:** narrative
**Page:** 2-N or appendix
**Notes:** Narrative content is **never** converted into trend,
risk, diagnosis, triage, or treatment-response claims. Blueprints
may not define narrative derivation rules.

### 13. Observer and author attribution

**Gate:** `data-presence` (`hasMultipleObserverRoles`)
**Renders:** Per-entry attribution distinguishing `observerRole`
(who observed) from `authorRole` (who entered the data into ciphra)
when multiple roles appear in the report window. Caregiver-entered
teacher observations, clinic-entered caregiver reports, and proxy
logging are all distinguishable in the display.
**Modes:** all
**Page:** 1, 2-N, or appendix
**Notes:** Cross-cut overlay on sections 5, 6, 7, 9, and 12.
Single-role reports may render compact attribution in the footer or
appendix rather than repeated inline labels.

### 14. Cohort-specific appendix

**Gate:** `data-capability` (`hasCohortAppendix`)
**Renders:** Cohort-defined supplemental display: raw event tables,
full medication logs, full narrative entries, raw lab tables,
growth measurements, user-entered scale definitions, source-
attributed reference materials. Appendix content follows the same
predicate, attribution, and non-inference rules as the main report.
**Modes:** all
**Page:** Appendix
**Notes:** Display-criteria descriptions only. No risk-rule or
escalation-rule explanations. ciphra does not compute clinical
scores; if a user-entered scale value exists, it displays the
recorded value with the user-entered scale definition.

### 15. Watchlist matches table

**Gate:** `data-capability` + `derived`
(`supportsWatchlistFields`, `showsWatchlistSection`,
`hasConfiguredWatchlistMatch`)
**Renders:** A flat table in the appendix listing entries that
matched the literal display criterion declared by the blueprint's
watchlist fields. Each row shows the matching entry's date, value,
and the literal criterion the entry matched ("bp_systolic > 180,"
"entries tagged #worrying," etc.). **Never on Page 1, never
labeled risk / acute / escalation / triggered / red flag / safety,
never used as alerting.**
**Modes:** all
**Page:** Appendix only
**Notes:** Opt-in per cohort. If no entries match in the window,
the section is omitted (no negative status statement).

### 16. Footer and provenance

**Gate:** `report-eligibility` (`canRenderPdf`)
**Renders:** Page number, patient/report identifier, report window,
generation timestamp, and the controlling provenance statement:
**"Patient-entered data summary. ciphra organizes the user's
recorded entries and proxy-author entries into a printable summary.
ciphra does not diagnose, interpret, classify risk, evaluate
treatment response, or recommend action. Sharing this export
with anyone — including a clinician — is the user's choice."**
**Modes:** all
**Page:** Every page
**Notes:** This is the load-bearing line. Promote it to Section 1
identity copy as well. The audience is deliberately left to the
user — naming the clinician as the intended reader would bake
"intended for clinical decision-making" into ciphra's documented
purpose, which is exactly the MDR Rule 11 trap.

---

## What this spec rules out

For clarity, the spec EXPLICITLY rejects:

- Computed risk classification or escalation status
- Computed treatment-response evaluation
- Computed abnormality labels for vitals or labs
- Computed narrative summaries, themes, or sentiment extraction
- Trajectory framings that imply clinical state ("recovery,"
  "stability," "comfort," "flare-control," "function")
- Page 1 alerting or priority-signaling behavior
- "No risk detected" or "no acute escalation triggered" negative
  status statements
- Blueprint-defined diagnostic, prognostic, risk, triage,
  treatment-response, abnormality, recovery, worsening,
  improvement, stability, or escalation rules
- Q&A clinician-facing sections that imply the PDF answers
  clinical questions
- Curated "most important facts" / "top N highlights" /
  "key takeaways" sections that select WHICH counts to surface
  for an external reader's attention. Selecting which 6 of 50
  populated metrics to highlight is editorial curation of clinical
  relevance, even when each surfaced fact is itself neutral. The
  layout is allowed to pre-declare WHICH SLOTS exist (per static
  blueprint template); it is not allowed to rank populated data
  by importance at render time.
- Pre-declared "intended audience" labels that bake a clinical
  use case into ciphra's documented purpose (e.g. "for clinician
  review," "for doctor visits," "doctor handover artifact"). The
  user decides who reads the export; the artifact itself is just
  a data summary.

## What this spec accepts

The PDF DOES:

- Identify the patient, cohort, and report window
- Summarize counts, totals, and most-recent values of categories
  that have entries
- Display values-over-time in neutral direction-and-amount language
- Display imported reference ranges with source attribution
- Display user-entered phase labels, taken/skipped flags, scale
  values, and tags as the user entered them
- Group narrative entries by date, author role, and user tags
- Show medication-entry timestamps alongside other entries on the
  timeline
- Provide a configured-watchlist matches table in the appendix when
  opted in, with criteria shown verbatim
- Carry provenance on every page

---

## How to use this spec

When adding a new section, predicate, or cohort module:

1. State which **predicate(s)** gate the addition.
2. Confirm the addition is **display, not inference** — re-read the
   global invariants and the "what this spec rules out" list.
3. If the addition involves computing a label, classification, or
   priority signal, **stop**. Move the computation out of ciphra or
   leave it to the clinician.
4. Add the section under the right page-placement rule. Page 1 is
   reserved for neutral identity + summary + provenance.
5. Add a test in `pdf.test.ts` or a sibling test file pinning the
   section's gate and content rule.
6. Update `memory/feedback_pdf_clinician_lens.md` if the addition
   reveals a new clinical-lens consideration. Update
   `memory/project_medical_device_assessment.md` if the addition
   touches the MDR boundary in any way.

## File anchors

- This spec lives at `frontend/src/lib/PDF_TEMPLATE.md`.
- `frontend/src/lib/cohortSections.ts` — the typed cohort × section
  gate for the SPINE.
- `frontend/src/lib/pdf.ts` — the renderer.
- `frontend/src/lib/pdfTrajectory.ts` — the neutralized trajectory
  pill resolver (P-PDF-2). Bipolar polarity gets cohort-aware
  framing without value-judgment labels.
- `frontend/src/lib/PDF_REWRITE.md` — PI v18/19 rewrite memo
  (predecessor of this spec).
- `memory/feedback_pdf_clinician_lens.md` — 5-doctor agents campfire
  findings (the framing for "doctor-facing" without crossing into
  device territory).
- `memory/project_medical_device_assessment.md` — MDR/MepV
  positioning. ciphra is not a device under current scope; the
  invariants above are how we keep it that way.
