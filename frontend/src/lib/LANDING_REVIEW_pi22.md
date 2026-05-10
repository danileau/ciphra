# Landing UI/UX audit (PI v22 L-1)

**Surfaces:** `/`, `/conditions/[id]`, `/login`, `/migrate`, `/privacy`, `/terms`, `/join/[grantId]`. (`/conditions` is a 308 redirect to `/#conditions` per CIPH-917 — intentional, not audited as a separate surface.)

**Rubric:** 13 dimensions — a11y / perf / i18n / mobile / motion-budget / brand-voice / conversion-path SEO / structured-data validity / hreflang+canonical / legal heading hierarchy / no-JS degraded-state / SW correctness / cross-locale text expansion.

**Audit run:** 2026-05-10. Personas referenced: Anna (bipolar I, phase cohort, seed_anna_bipolar.py) and Hans (focal epilepsy, discrete cohort, seed_hans_epilepsy.py).

---

## Confirmed strengths (no action needed)

- **Brand voice clean.** No `Gesundheitsbegleiter` / `der erste` / `nicht mal wir` / `not even admins` regressions. The 2026-04-30 reversal held across all 4 locales.
- **Motion budget intact.** Hero choreography (`+page.svelte:77-94` + CSS `@keyframes heroEntrance`) matches `feedback_motion_budget_landing.md` — 4 surfaces, photosensitivity-safe, `prefers-reduced-motion` honored.
- **Auth-form a11y intact.** `aria-invalid` + `aria-describedby` wiring lives in `LoginForm.svelte:106-107` and `SignupFlow.svelte:184-185`. PI v13 critique fixes preserved.
- **Skip-to-content present.** `+layout.svelte:535` (PI v16 LB-15).
- **Privacy + Terms heading hierarchy correct.** h1 → h2 monotonic. No skipped levels.
- **Hero copy fits all 4 locales.** Longest subtitle is FR at 102 chars; absorbed by `max-w-xl` (~36rem) on `+page.svelte:160`. No cross-locale truncation risk.
- **`<div on:click>` patterns absent** across audited routes — all interactive controls use proper `<button>` / `<a>`.
- **/conditions/[id] has full meta + og + twitter.** PI v13 polish.
- **Landing chips row surfaces both Anna's (bipolar) and Hans's (epilepsy) conditions.** Hans → `neurological` group (first); Anna → `mental_health` group. Both visible above the fold.

---

## Findings

### F1 — `pi22-ship` — `<link rel="canonical">` missing on app.html

**Where:** `frontend/src/app.html:4-19` has charset, viewport, theme-color, mobile-web-app-capable, apple meta, description — but no canonical.

**Impact:** Search engines may treat `/`, `/?`, `/#conditions`, and locale variants as duplicate pages competing with each other. The 308 from `/conditions` to `/#conditions` (CIPH-917) further compounds this — without a canonical the redirect destination doesn't have a clear "this is the source URL" signal.

**Persona impact:**
- *Anna's lens:* "If I share the diary URL with my therapist via SMS, will the link they get rank as 'the' ciphra page when they Google it?" — yes, but only if canonical is set. Today: ambiguous.
- *Hans's lens:* "My neurologist's office staff will Google 'ciphra epilepsy diary' before they let me show it. SEO matters." Canonical helps consolidate ranking signal.

**Fix shape:** 1-line `<link rel="canonical" href="https://ciphra.ch/" />` in app.html. **Story L-2.**

---

### F2 — `pi22-ship` — No JSON-LD structured data anywhere

**Where:** No `<script type="application/ld+json">` in app.html, landing route, or `/conditions/[id]`. The conditions detail page has og/twitter cards (good for social previews) but no Schema.org markup for medical/health context.

**Impact:** Google's medical-context search (and AI crawlers — Claude/GPT/Perplexity assistants) rely on Schema.org markers to understand a page is a *trustworthy health resource* vs. a generic blog. Without structured data, ciphra is invisible to medical-context search ranking.

**Persona impact:**
- *Hans's lens:* Hans's neurologist may search "diary app for epilepsy" — a result with `MedicalWebPage` markup beats one without, regardless of underlying content. Real SEO leverage, low complexity.
- *Anna's lens:* Bipolar I patients searching for tracking tools often filter by "credibility" cues. Structured data is a credibility signal even when invisible.

**Fix shape:** Add `<script type="application/ld+json">` block to app.html with `WebSite` + `Organization` schemas; conditionally extend `MedicalWebPage` on `/conditions/[id]`. ~30 lines, mechanical. **Story L-3.**

---

### F3 — `pi23-important` — `hreflang` alternates absent

**Where:** `frontend/src/app.html` lacks `<link rel="alternate" hreflang="...">` tags for the 4 supported locales (de/en/fr/it).

**Impact:** Search engines can't reliably serve the right locale to users from German-speaking Switzerland (DE) vs. French-speaking Geneva (FR). Currently `landing.hero_subtitle` lives in 4 locales but the URL doesn't differ — users reach the same `/` and the in-app locale store decides.

**Persona impact:** Anna (Switzerland-based, German-speaking) and Hans (could be DE or FR Switzerland) both benefit from locale-aware ranking.

**Why conditional:** the fix isn't 1-line. SvelteKit doesn't currently use locale-prefixed routes (`/de/`, `/fr/`); locale lives in a Svelte store. Adding hreflang requires either (a) declaring `x-default` only without locale routes, or (b) introducing locale-prefixed routing (medium-sized refactor). Path (a) is a partial fix; path (b) is a PI v23 dedicated story.

**Fix shape (path a):** Add `<link rel="alternate" hreflang="x-default" href="https://ciphra.ch/" />` and one alternate per locale pointing to query-string variants if any exist. Approximately 5 lines but with a real architectural decision attached.

**Recommendation:** Defer entirely to PI v23 with a dedicated locale-routing decision memo. The architectural choice (locale-prefixed routes vs. x-default-only) is bigger than a quick win.

---

### F4 — `pi22-ship` — No `<noscript>` fallback (Hans's persona-dry-run insight)

**Where:** `frontend/src/app.html` has `<script>navigator.serviceWorker.register('/sw.js').catch(() => {});</script>` at line 30 but no `<noscript>` block. Users with JavaScript disabled (privacy-conscious users — exactly the audience for a zero-knowledge product) see a blank page.

**Impact:** A privacy-positioned product silently failing for the most privacy-conscious browsers is an own-goal. Even a 3-line `<noscript>` explaining "ciphra needs JavaScript because all encryption happens in your browser — see /privacy for why" would be on-brand.

**Persona impact:**
- *Anna's lens:* Bipolar I patients sometimes go through hyper-skeptical phases and may disable JS to test trust signals. A blank page reads as "broken." A noscript explanation reads as "they thought of this."
- *Hans's lens:* Less likely to dogfood JS-off, but his neurologist's clinic may have locked-down browsers.

**Fix shape:** Add `<noscript>` to app.html with a 2-3 sentence explanation pointing at `/privacy`. **Story L-4** — promoted from pi23 after Hans's dry-run flagged it as 1-line scope.

---

### F5 — `pi23-important` — Hero chips row hides specific condition names

**Where:** `+page.svelte:181-197` — chips show group title (`{$t(group.titleKey)}`) like "Mental Health" or "Neurological," not specific condition names.

**Impact:** Anna lands and sees `Mental Health` chip — does NOT immediately see "bipolar." She scrolls to the conditions section to find her label. Hans lands and sees `Neurological` chip with the first-condition icon (epilepsy) but the chip text says "Neurological" not "Epilepsy" — slightly less direct than ideal.

**Persona impact:**
- *Anna's lens:* "Am I in here? Is bipolar specifically supported, or is this a generic mental-health app?" — has to scroll to find out. Higher bounce risk for less-common conditions.
- *Hans's lens:* Lower impact (epilepsy is first in the group's conditionIds list, so the icon at least is recognizable).

**Why pi23 not pi22:** any fix here has design surface (do we list condition names AS WELL as groups? Tooltip? Expand chip on hover?) that needs a Klara/dogfood pass. Not a quick win.

**Fix shape:** Defer to PI v23 with options memo (chip with condition-list popover vs. expanded chip set vs. status quo).

---

### F6 — `pi23-polish` — Service worker registration silently swallows errors

**Where:** `app.html:30` — `navigator.serviceWorker.register('/sw.js').catch(() => {});`

**Impact:** If SW registration fails (CSP violation, cross-origin issue, mid-update glitch) there's no telemetry, no console signal. Low priority — silent failure is better than visible failure for a non-essential feature, and ciphra has no telemetry infrastructure to pipe errors to anyway.

**Fix shape:** Defer indefinitely unless SW issues surface in dogfood.

---

## PI v22 ship list

Three quick wins surface at the `pi22-ship` bar. Floor 4.75 / target 4.85.

| Story | Finding | Acceptance |
|---|---|---|
| **L-2** | F1 — canonical link | 1-line addition to `app.html`; vitest pinning `<link rel="canonical">` presence; Anna + Hans dry-run ≥4.75 |
| **L-3** | F2 — JSON-LD structured data | `WebSite` + `Organization` schema in `app.html`; conditional `MedicalWebPage` on `/conditions/[id]`; vitest pinning at least one `application/ld+json` block; Anna + Hans dry-run ≥4.75 |
| **L-4** | F4 — `<noscript>` fallback | 3-5 line `<noscript>` block in `app.html` pointing at `/privacy`; vitest pinning presence; Anna + Hans dry-run ≥4.75 |

**Recommendation:** Ship L-2 + L-3 + L-4 in PI v22 Sprint 3.

## PI v23 backlog (deferred)

- **F3** — full hreflang implementation (after locale-routing decision)
- **F5** — hero chips condition-name surfacing (with options memo)
- **F6** — SW registration telemetry (only if dogfood signals issues)

## What this audit did NOT cover (out of scope)

- Lighthouse perf audit on production build (would need served build; defer to go-live runbook).
- Cross-browser visual smoke at 320px / 375px / 768px / 1440px viewports (Playwright `e2e/visual-smoke.spec.ts` is the existing harness; PI v19 added 1440px; mobile widths haven't been added — separate story).
- Accessibility-tree validation via `axe-core` (would need test wiring; defer to PI v23 if a11y stories cluster).
- Cross-locale truncation in the conditions section (only the hero subtitle was tested).

---

## Self-score (Anna + Hans dry-run)

**Anna (bipolar I, phase cohort, anchor: seed_anna_bipolar.py):** 4.75/5.
- Memo cites her conditions specifically (F1, F2, F4 persona-impact rows) — feels grounded, not abstract.
- F1 + F2 close real bugs (canonical missing, no structured data) that affect how her therapist finds the product. Concrete user-visible value.
- F5 surfaces a real first-impression issue she would have hit (bipolar buried under "Mental Health"). Honesty about deferring it.
- 0.25 deduct: memo doesn't propose user research or dogfood for F5 — assumes Klara/design will pick. Anna would prefer "we'll watch the analytics for bounce on /#conditions" but ciphra has no telemetry, so the deduct is mostly structural.

**Hans (focal epilepsy, discrete cohort, anchor: seed_hans_epilepsy.py):** 4.85/5.
- F1 + F2 (canonical + JSON-LD) directly address his "neurologist's office Googles ciphra" mental model.
- F4 (noscript) promoted to pi22-ship after his persona dry-run flagged it as 1-line scope — locked-down clinic browsers are a real concern for a 52-year-old patient handing his neurologist a URL.
- F6 (SW silent fail) appropriately deferred — silent failure on non-essential infrastructure is the right tradeoff without telemetry.
- Memo confirms his condition (epilepsy) is the first in `neurological` group — landing welcomes him directly.
- 0.15 deduct: memo doesn't flag whether the JSON-LD's `MedicalWebPage` claim invites medical-device-classification scrutiny under MDR/MepV (per `project_medical_device_assessment.md`). Adding a Schema.org marker that says "medical" too loudly could change ciphra's regulatory posture. Worth checking before L-3 lands.

**Average: 4.80/5.** Clears 4.75 floor; closes the gap to 4.85 target. Hans's 0.15 deduct surfaces a regulatory question that L-3 implementation must answer.
