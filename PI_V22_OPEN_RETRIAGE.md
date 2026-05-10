# PI v22 open-lens retriage (2026-05-10)

User direction (repeated twice): persona dry-runs must answer "do they like what they see, or is the design a fail — and nobody was asking?" The earlier "feature compliance" scoring inflated PI v22's average. This memo re-runs every story under the open lens.

Anchor cohorts: **Anna** = bipolar I (phase cohort, primary surface = calendar). **Hans** = focal epilepsy (discrete cohort, primary surface = trend / doctor-PDF). Per `frontend/src/lib/blueprint/cohort.ts:67`.

## Already shipped (commits stand; honest scores recorded)

### L-1 — Landing audit memo (commit `7b71c23`, prior-rated 4.80)

**Open Anna:** 3.5/5. The audit found canonical link + JSON-LD + noscript. None of these change my experience as a user; they're SEO chrome and a paranoid-edge-case fallback. The audit is rigorous and worth doing for ciphra's growth, but calling it 4.8 *user-impact* is flattery. Real value: ~3.5.

**Open Hans:** 3.6/5. Same reasoning. The "my neurologist Googles ciphra" persona-impact framing was speculative — neurologists usually don't research diary apps; they ask the patient to show them. Audit is a useful *engineering* deliverable, low *user* deliverable.

**Honest avg: 3.55.** Below 4.75 floor.

**Why we kept it:** the memo is the load-bearing artifact for L-2/L-3/L-4 + future PI v23 backlog. Engineering value is real. The inflated 4.80 was the failure mode this retriage is correcting.

### C-1 — validateRecoveryCode vitest (commit `f5e8192`, prior-rated 4.825)

**Open Anna:** 4.0/5. The tests prevent a hypothetical future bug class (checksum drift on refactor). Real value to me as a user today: zero. As future-proofing for the recovery flow I'd actually use during a manic episode if my phone broke: real, but indirect.

**Open Hans:** 4.0/5. Same. Engineering hygiene story, not user-visible. The PI v21 carryover was overdue, but the open dry-run honestly scores 4.0.

**Honest avg: 4.0.** Below 4.75 floor.

**Why we kept it:** carryover-debt closure. Score honestly, ship anyway, don't pretend it was a 4.8 win.

### JC-1 — /journal touch-target floor (commit `9eea7dd`, prior-rated 4.825)

**Open Anna:** 4.3/5. The fix is real — 22px and 36px buttons annoy me on phone, post-manic-episode-tremor especially. Capped because /journal is my secondary surface (I primarily use calendar per phase-cohort default). If this had been a calendar fix, 4.7. Story did the right work in the wrong place for my cohort.

**Open Hans:** 4.2/5. Same logic. Discrete cohort default is trend, not journal. Touch-target fix is real, would have been more impactful on /reports or the calendar.

**Honest avg: 4.25.** Below 4.75 floor.

**Why we kept it:** the WCAG 2.5.5 violations are real bugs and the discipline mechanism (vitest pinning 44pt) prevents regression. **Real takeaway:** the J1 sweep should cover calendar + reports, not just /journal. **PI v23 carry: extend touch-target floor to /calendar + /reports + /dashboard.**

---

## Sprint 1 + JC-1 honest average: 3.93/5

PI v22 was running "4.82" under the inflated lens; the open lens gives **3.93**. Floor 4.75 missed by 0.82 — a structural break, not a rounding miss. This is what the user wanted us to see.

## Remaining PI v22 backlog — pre-flight open triage

| Story | Description | Open-Anna | Open-Hans | Pre-flight verdict |
|---|---|---|---|---|
| **JC-2** | lg+ rail on /journal | 3.8 | 3.9 | **DROP or RESHAPE** — both personas barely use desktop /journal. Already pre-flighted in prior turn. |
| **JC-3** | Drop calendar KPI 2-card at lg+ | 4.5 | 3.5 | **PARTIAL** — calendar IS Anna's primary surface (4.5+); Hans rarely uses calendar (3.5). Net ~4.0. Reshape: also extend to /reports for Hans. |
| **JC-4** | Filter-aware empty state on /journal | 4.0 | 3.8 | **PARTIAL** — improvement on a non-primary route for both. The 4-locale i18n discipline is real, the user impact thin. Reshape: extend the pattern to /calendar empty state. |
| **JC-5** | Search result count using plural() | 3.5 | 3.5 | **DROP or DEFER** — minor polish on a route neither persona primarily uses. Real value: micro. The plural() helper is already in the codebase, so even the discipline mechanism is a re-use, not a new ship. |
| **JC-6** | Sticky filter row on /journal | 3.3 | 3.3 | **DROP** — desktop-shaped polish on a route neither persona primarily uses, on a viewport neither primarily uses. Triple-non-primary. |
| **L-2** | Canonical link in app.html | 3.5 | 3.5 | **SHIP for SEO not UX** — invisible to users. Real growth value, score honestly. Acceptance: SEO-ship, not user-ship. |
| **L-3** | JSON-LD structured data | 3.6 | 3.7 | **SHIP for SEO not UX** — same. Hans's regulatory deduct (MedicalWebPage vs MDR) still applies; verify before shipping. |
| **L-4** | `<noscript>` fallback | 3.8 | 3.9 | **SHIP for paranoid edge** — invisible to most users; matters for the brand-aligned ~1% of privacy-paranoid users who disable JS. Honest score, real ship. |

## What this re-triage tells us

1. **PI v22 was building too much for non-primary surfaces.** /journal got 4 stories (J1+J3+J4+J5+J6 in the original plan, plus JC-2 rail) — but it's the primary surface only for the narrative cohort (migraine), neither of our anchor personas. PI v22 should have weighted toward calendar + trend.

2. **Carryover/SEO/hygiene stories rate 3.5-4.0 honestly.** That's fine to ship — they have engineering or growth value. But pretending they're 4.8 wins is the dishonesty the user is calling out.

3. **The 4.75 floor under the open lens functionally requires user-primary-surface stories.** A story polishing a primary surface for at least one anchor persona rates 4.5+ naturally; off-surface polish caps at 4.0-4.3.

## Proposed PI v22 reshape

**Drop:** JC-5, JC-6 (low-resonance off-primary polish).

**Reshape:**
- JC-2 → "lg+ rail on /calendar enhancements" (Anna's primary surface). Extend MonthMiniSummary with phase-cycle-aware deltas.
- JC-3 → keep but pair with "/reports KPI cleanup at lg+" so Hans gets matching value.
- JC-4 → "filter-aware empty state on /journal AND /calendar" — covers both personas' surface preferences.

**Ship as-is (honest 3.5-4.0):** L-2, L-3, L-4 — for growth + edge users, not for primary-persona resonance.

**Net PI v22 size:** 5 ships shipped + 6 remaining (3 honest-3.x SEO/edge + 3 reshaped-4.5+) = 11 stories. Closer to the original PI v22 framing but with honest scoring.

## What carries to PI v23

- Touch-target sweep extension: /calendar + /reports + /dashboard (PI v22 J1 honest takeaway).
- Hreflang + locale-routing decision (deferred from L-1 audit).
- Hero chips condition-name surfacing (Anna's "I had to scroll to find bipolar" — a real concept-level concern).
- /journal lg+ work IF and only if dogfood signals real desktop usage on that route.

---

## How dry-runs run from now on

Per `feedback_open_persona_dryrun.md`:

1. **Pre-flight before coding.** If pre-flight scores <4.5 average, reshape or drop. Don't burn effort.
2. **Post-flight after coding.** If real-world score lower than pre-flight, document why.
3. **Score honestly.** Off-primary-surface caps. Engineering/SEO/hygiene rates 3.5-4.0. No flattery.
4. **Cohort-aware.** Anna→calendar, Hans→trend. Stories serving non-primary surfaces cap their scores for that persona.
