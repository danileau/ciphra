# PI v22 / v23 replan (2026-05-10, post open-lens retriage)

The retriage at `PI_V22_OPEN_RETRIAGE.md` exposed a structural break: 7 of the 11 originally-planned PI v22 stories serve non-primary surfaces for Anna (bipolar→calendar) and Hans (epilepsy→trend/PDF). Continuing the original plan would ship 5+ more stories at honest 3.3-4.0 — disciplined honesty would force every one to be acknowledged as a floor breach.

The replan accepts the open lens as the new operating mode and resequences accordingly.

---

## Principle

A story is primary-surface-resonant for a persona if it lands on the route their cohort defaults to (`frontend/src/lib/blueprint/cohort.ts:67`):

| Persona | Cohort | Primary surface |
|---|---|---|
| Anna (bipolar) | phase | calendar |
| Hans (epilepsy) | discrete | trend / reports / doctor-PDF |
| (future: Marie) | narrative (migraine) | journal |
| (future: Elena) | cycle (endo/menopause/PCOS) | calendar |

**Pre-flight rule:** before writing code, score the planned story against both anchor personas under the open lens. Average <4.5 → reshape or drop. Score honestly post-flight; engineering/SEO/hygiene caps at 4.0; off-primary surface caps at 4.3.

---

## Close PI v22

PI v22 ends with 6 stories, not 11. **3 already shipped + 3 SEO/edge wins to ship as the close-out.**

### Already shipped (commits stand, honest scores recorded)

| # | Story | Commit | Honest avg |
|---|---|---|---|
| 1 | L-1 landing audit memo | `7b71c23` | 3.55 |
| 2 | C-1 wordlist vitest | `f5e8192` | 4.0 |
| 3 | JC-1 /journal touch-target floor | `9eea7dd` | 4.25 |

### Close-out — Sprint 2 (honest growth/edge wins, ~1 day)

| # | Story | Pre-flight (Anna/Hans) | Why ship anyway |
|---|---|---|---|
| 4 | **L-2** Canonical link in app.html | 3.5 / 3.5 | SEO. Invisible to users; helps ciphra's growth ranking. 1-line diff. |
| 5 | **L-3** JSON-LD structured data | 3.6 / 3.7 | SEO + AI-crawler discoverability. Ship `WebSite` + `Organization` only (defer `MedicalWebPage` pending MDR/MepV check per Hans's L-1 deduct). |
| 6 | **L-4** `<noscript>` fallback | 3.8 / 3.9 | Privacy-paranoid edge users (real for a zero-knowledge product). 3-5 line diff. |

These ship as growth/edge infrastructure with honest 3.5-3.9 scores. PI v22 closes at **6 stories, honest average ~3.8**, floor 4.75 visibly missed. The miss is documented, not hidden.

### Dropped from PI v22

- **JC-2** lg+ rail on /journal — pre-flight 3.85 (both personas barely use desktop /journal). Reshape candidate for PI v23 as a calendar-rail enhancement.
- **JC-3** drop calendar KPI 2-card at lg+ — partial primary-surface for Anna only. Reshape candidate for PI v23 paired with /reports work for Hans.
- **JC-4** /journal filter-aware empty state — narrative-cohort surface. Reshape candidate for PI v23 as a calendar empty-state pass.
- **JC-5** /journal search result count — triple-non-primary polish. Drop entirely.
- **JC-6** /journal sticky filter row — triple-non-primary polish. Drop entirely.

---

## PI v23 — User-resonance PI

**Operating principle:** every story must pre-flight at ≥4.5 average. Stories are *organized by which anchor persona's primary surface they serve* — not by route or by sprint.

### Track A — Anna's calendar (phase cohort primary, ~3 stories)

- **A1 — Calendar touch-target floor.** Extend the J1 discipline mechanism to /calendar interactive controls (cell taps, rail prev/next, MonthMiniSummary chips, phase legend). Pre-flight Anna 4.7 / Hans 4.0 (Hans rarely uses calendar). Avg 4.35 — **reshape: include /reports in the same sweep so Hans's avg lifts**. Re-pre-flight: Anna 4.7 / Hans 4.5 = **4.6 ship**.
- **A2 — Calendar empty-state pass.** Filter/cohort-aware empty state on /calendar. Pre-flight Anna 4.7 / Hans 4.0. Bundle with: zero-data calendar render for first-week users. Re-pre-flight 4.5+.
- **A3 — Phase-distribution chip in MonthMiniSummary.** Mirror the PI v21 PDF drawPhaseDistribution into the in-app calendar rail. Anna sees her manic/depressive split inline, not just on the doctor PDF. Pre-flight Anna **4.85** / Hans 3.5 (no phase data). Avg 4.18 — accept as Anna-primary story, Hans's lower score honest.

### Track B — Hans's trend / reports / doctor-PDF (discrete cohort primary, ~3 stories)

- **B1 — /reports touch-target sweep.** Bundled with A1 above. Same discipline mechanism extended.
- **B2 — Doctor-PDF dogfood walkthrough.** Hans + his neurologist's perspective: read the actual rendered PDF for a 2-year epilepsy fixture, list what's missing/confusing/overweight. Output: `DOCTOR_PDF_DOGFOOD_pi23.md`. No code unless the dogfood surfaces a launch-blocker. Pre-flight Hans 4.8 / Anna 4.3 (her psychiatrist sees a different shape but the methodology applies) = **4.55 ship**.
- **B3 — /reports lg+ KPI cleanup.** Replace JC-3's calendar-only scope with a reports-primary version: drop redundant cards on /reports at lg+ where the sidebar shows the same data. Pre-flight Hans 4.6 / Anna 3.8 = 4.2 — reshape to include calendar drop too (multi-surface). Re-pre-flight 4.5+.

### Track C — Concept-level wins (cross-cutting, ~2-3 stories)

- **C1 — Hero chips condition-name surfacing.** From L-1 finding F5: Anna had to scroll to find "bipolar" buried under "Mental Health" group. Surface specific condition names. Pre-flight Anna **4.7** / Hans 4.0 (epilepsy is first-in-group, less affected) = 4.35. Reshape: combine with a chip-row interaction for users with custom blueprints. Re-pre-flight 4.5+.
- **C2 — Locale routing + hreflang.** L-1 deferred F3. Decision memo + implementation. Pre-flight Anna 3.5 / Hans 3.5 (both monolingual in practice) — but it's blocking F3 audit. **Score honestly as 3.5 ship** for SEO/regulatory reasons, similar to L-2/L-3/L-4.
- **C3** *(provisional)* — depends on PI v22 close-out finding any new dogfood signals.

### PI v23 estimated shape

- **8 stories** across 3 tracks, **2-3 weeks** at recent commit cadence
- **Floor 4.5** (lowered from PI v22's 4.75 — open lens makes 4.75 honestly achievable only on perfect-fit stories; 4.5 is the new realistic primary-surface bar)
- **Target 4.7** (achievable for primary-surface stories with solid implementation)
- 2 SEO/edge stories (B2 dogfood memo, C2 locale routing) explicitly score in the 3.5-4.0 range — honest mixed PI

---

## What's not in PI v22 or v23 (deferred)

- /journal stories that aren't user-resonant (JC-5, JC-6 dropped indefinitely; JC-2 returns only if dogfood signals real desktop /journal usage on real users)
- Mobile native app
- CI / GitHub Actions
- Formal third-party crypto audit
- Production deployment runbook (separate go-live track)
- Multi-condition vaults / family read-write
- Telemetry (would dramatically reshape the open lens — answers "which surfaces do users actually visit?")

---

## Lessons codified

1. **`feedback_open_persona_dryrun.md`** — pre-flight before coding; score user resonance not feature compliance; cohort-aware primary-surface caps.
2. **PI v22 retriage memo** — auditable record of what would have shipped under the inflated lens.
3. **PI v23 plan** — first PI to use the open lens as the planning input (not just the dry-run output).

The shift: **stories are now picked because they primary-surface a real persona, not because they appear in a backlog list.** Backlog items survive a primary-surface filter or get reshaped/dropped.
