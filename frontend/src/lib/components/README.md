# Ciphra design system

Single source of truth for the Ciphra webui. Read this before
adding a component, a route, a token, or an i18n string. Every
section is either enforced by a vitest test in `frontend/src/lib/`
or documented as the canonical pattern — drift is caught at CI,
not at review.

---

## Read this before adding any code

1. **Use design tokens.** Colors from `dataPalette.ts`, spacing
   from `spacingTokens.ts`, typography from `typographyTokens.ts`.
   Never hand-pick a pixel value, a hex literal, or a Tailwind
   arbitrary. See the Spacing / Typography / Color sections below.
2. **Check the component inventory before creating a new
   component.** There is probably already a primitive. Adding a
   new `.svelte` file requires an inventory entry in the same
   commit (`components-inventory.test.ts` will fail otherwise).
3. **Use the route-shell registry to add routes** (`routeShells.ts`).
   Do not add a new if/else branch to `+layout.svelte` — add a
   registry entry. `routeShells.test.ts` enforces structure.
4. **Use interaction primitives** — `ConfirmDelete`, `Modal`,
   `HelpHint`, `Toast`. Inline re-inventions are caught by
   `primitives.test.ts`. Opt out with a `<!-- primitive-exempt: … -->`
   comment + a reason.
5. **Add i18n keys to all 4 locales** (`de`, `en`, `fr`, `it`).
   Orphan keys are caught by `keys-used.test.ts`. Keys accessed
   at runtime (`$t(`prefix_${var}`)`) go in
   `lib/i18n/dynamic-keys.ts`.
6. **Run `npx vitest run` before declaring done** — failing
   tests block. Also run `npx svelte-check` — no new warnings.

Recommended local workflow before pushing:

```
npx vitest run && npx svelte-check
```

No pre-push hook is installed; the discipline is voluntary but
enforced at CI.

---

## Spacing

Source of truth: [`lib/spacingTokens.ts`](../spacingTokens.ts).
Enforced by: [`lib/spacingTokens.test.ts`](../spacingTokens.test.ts).

Allowed Tailwind spacing values (for `gap-*`, `p*-*`, `m*-*`,
`space-x-*`, `space-y-*`):

`0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48`

Plus `px`, `auto`. Also `rem`/`em`-unit bracket values are
permitted (e.g. `pb-[1.5rem]`).

Rhythm rationale:
- `0–6` covers the default 4px-step UI scale (gap inside a row,
  card padding, icon-to-label gap).
- `8, 10, 12` for card-to-card gaps and form padding.
- `16, 20, 24` for section gaps.
- `28, 32, 40, 48` for landing hero padding and bottom-nav
  scroll clearance.

**Disallowed**: half-steps beyond the tokenised ones (`2.5`,
`3.5`), odd integers (`7, 9, 11, 13, 14, 15, 17, 18, 19`), and
arbitrary bracket values except the list in
`ALLOWED_BRACKET_SPACING`. If you need a new value, amend
`spacingTokens.ts` with a comment explaining why.

Grandfathered bracket spacing:
- `calc(2rem+env(safe-area-inset-bottom,0px))` — iOS safe-area
  padding on scrollable modals.

Note: `min-h-[44px]`, `min-w-[40px]`, `min-h-[calc(100vh-3.5rem)]`,
`max-h-[70vh]`, etc. are outside the spacing-utility regex
scope — they use `min-h`/`max-h`/`h`/`w` prefixes and are allowed
as-is. iOS tap targets (`44px`/`48px`/`40px`) and full-height
main patterns remain unrestricted.

## Typography

Source of truth:
[`lib/typographyTokens.ts`](../typographyTokens.ts).
Enforced by:
[`lib/typographyTokens.test.ts`](../typographyTokens.test.ts).

Allowed `text-{size}` utilities:

`text-xs, text-sm, text-base, text-lg, text-xl, text-2xl,
text-3xl, text-4xl, text-5xl, text-6xl`

Semantic guidance — pick by role, not by px:
- `text-xs` — captions, helpers, dense metadata chips.
- `text-sm` — default body on information-dense pages (journal
  rows, admin tables, settings).
- `text-base` — default body on landing / marketing sections.
- `text-lg` — large body, card lead-in.
- `text-xl` — section h2.
- `text-2xl` — page h1.
- `text-3xl` — landing display (mobile).
- `text-4xl` — landing display (`sm:` breakpoint).
- `text-5xl` — landing display (`md:` breakpoint), hero only.
- `text-6xl` — landing display (`lg:` breakpoint), hero only.

Grandfathered micro sizes: `text-[11px]`, `text-[10px]` only.
Used for tiny badges and dense meta labels where `text-xs`
(12px) is still too large. Never invent new bracket sizes —
amend `typographyTokens.ts` if you genuinely need one.

Color tokens (`text-slate-500`, `text-brand`, `text-white`,
etc.) and alignment/decoration keywords (`text-center`,
`text-balance`, `text-transparent`) are outside this rule's
scope — see the Color palette section.

## Color palette

Source of truth: [`lib/dataPalette.ts`](../dataPalette.ts).
Enforced by: [`blueprint/presets-palette.test.ts`](../blueprint/presets-palette.test.ts).

Every preset `accentColor` and every `episodeTypes[].color`
must come from `DATA_PALETTE`. The palette was designed so
adjacent episode types never share a hue — the test enforces
adjacency uniqueness as well as palette membership.

Semantic CSS variables (`--brand`, `--ochre`, `--olive`,
`--text-primary`, `--text-muted`, `--surface`, etc.) live in
`app.css`. Prefer them over Tailwind color utilities when a
color has semantic meaning (brand = orange-red, olive =
success/completed, ochre = warning/empty). Tailwind color
utilities (`text-slate-500`, `bg-white`) are fine for generic
chrome.

## Accent architecture (CIPH-921c) — read this before touching any accent color

Color in the authed app comes from **four distinct layers**. Most "why is
this the wrong color?" bugs are using the wrong layer. Decide which one a
surface belongs to *before* picking a token.

| Layer | Token(s) | Driven by | Use for |
|---|---|---|---|
| **Brand identity** | `--brand` (+ `--on-brand`) | constant ciphra rust, never themed-per-user | the ciphra✱ logo / `Wordmark`, the load bar, the `EncryptionDemo` trust moment. Things that say "this is *ciphra*", not "this is *your* condition". |
| **Condition accent** | `--accent`, `--accent-hover`, `--accent-rgb` | the **condition** color (see below) | all functional chrome: buttons, links, rings, FAB, active nav, selected/focus states, the primary chart line. |
| **Cohort secondaries** | `--accent-info` / `--accent-calm` / `--accent-neutral` | per-cohort (`[data-cohort=X]` in `app.css`) | semantic seconds (info=ochre, calm=success-green, neutral=slate dividers). Intentionally *not* the condition color. |
| **Data encoding** | `--data-*`, episode `.color`, `--olive`/`--danger` glyphs | the DATA palette (`dataPalette.ts`) | chart series, episode-type markers, calendar day-marks, heatmap cells. Encodes *meaning*, not chrome. |

### Where `--accent` comes from

The accent is the **condition** color — the same hue `/conditions` and the
dashboard badge use — *not* the cohort accent. Resolution order
(`lib/conditionAccent.ts` → `conditionColorOf`): `conditionInfoMap[id].color`
→ blueprint `accentColor` → cohort slot-1 fallback.

- `conditionAccent(bp)` returns the `{hex, hover, rgb}` trio. `hover` =
  −8% lightness (matches the hand-tuned `app.css` cohort values exactly);
  `rgb` is the `"r, g, b"` triple for `rgba(var(--accent-rgb), α)`.
- It is injected as an **inline `style` on the authed shell wrapper** in
  `+layout.svelte` (`accentOverride`), which overrides the per-cohort
  `[data-cohort=X] { --accent: … }` defaults in `app.css`. The override
  sits on **both** the shell wrapper (so the header/nav inherit it) **and**
  `<main>` (whose own `data-cohort` rule would otherwise re-override the
  inherited value for page content). Public routes (no resolved blueprint)
  get no override and keep the `:root` brand-rust default.
- `chromeSafeAccent()` darkens only the tones that dip below AA as a
  white-text button (olive `#7f821b`, clay `#a87559`) — applied at the
  accent layer **only**, because olive doubles as `--olive`/`--success`, so
  retuning the raw DATA token would silently shift success states app-wide.
- JS that feeds Chart.js can't read the CSS var — pass `conditionColorOf(bp)`
  (or the `accentHex` the dashboard threads down) into the dataset.

### Picking a color for a new surface

1. Is it the ciphra logo / a brand moment? → `--brand`. Done.
2. Is it interactive chrome (button / link / focus / active / selected)?
   → `var(--accent)`. It defaults to brand-rust on public pages, so it's
   safe everywhere.
3. Is it encoding data (a chart line, a calendar mark, an episode dot)?
   → the DATA palette / the episode's own `.color`. Never `--accent`.
4. Is it a semantic state (success/warning/divider)? → the cohort
   secondary or the `--olive`/`--ochre`/`--danger` semantic var.

### Seed-data trap

Demo seeds (`api/seed_*.py`, gitignored) must use **DATA_PALETTE hexes** for
`episodeTypes[].color`, same as the real presets. They previously hardcoded
Tailwind hexes (`#DC2626`, `#1E40AF`, `#7C3AED`…) which clash hard with the
warm brand — invisible to tests, very visible on multi-phase cohorts
(bipolar showed blue + purple bands). `api/seed_reseed_all.py` re-applies.

### Open threads (future sessions)

- **Per-condition unique colors.** Today the 6 DATA tones are shared across
  ~23 conditions (epilepsy / chronic_pain / hypertension / RA all = rust).
  Goal is a *unique* hue per condition, possibly **auto-generated** — not the
  shared 6-tone set. When doing this, keep `chromeSafeAccent` + dark-mode
  legibility (accent-as-*text* on dark is the weak spot) in the loop.
- **Calendar data-glyphs → condition color.** `MonthMiniSummary`'s heat-cell
  bar (and the main calendar day-marks it mirrors) still use `--brand` rust;
  a test pins it. Not biting today, but should follow the condition color —
  needs main calendar + mini + the `rail.test.ts` contract changed together.

## Dark mode (design review 2026-06-11)

Source of truth: the `[data-theme='dark']` token block in `app.css` +
[`lib/stores/theme.ts`](../stores/theme.ts) (preference: light / dark /
system, default **system** — the app follows the OS unless overridden). `+layout.svelte` mirrors the resolved theme
onto `<html data-theme>`; `app.html` carries a pre-hydration inline
script so OS-dark users get no white flash (keep it in sync with the
store; CSP note inside).

Rules when adding UI:

1. **Never hardcode an opaque surface or text color** — use the
   semantic vars and both themes come free. Translucent `rgba(...)`
   tints over themed surfaces adapt automatically and are fine.
   - **Inline-style trap:** `style="background: white"` / `'#fff'` bypasses
     the warm-overrides block (rule 3 only remaps Tailwind *classes*), so it
     stays white in dark mode. This has bitten the nav, the quick-add mode
     toggle, and the landing EncryptionDemo badges. Inline → use
     `var(--surface-card)` (or the right semantic var), never a literal.
2. **Text on a `--brand` or `--danger` fill** uses `--on-brand` /
   `--on-danger` (white in light, warm-black in dark — the dark theme
   lifts those fills past white-text contrast).
3. Raw Tailwind palette utilities (`bg-white`, `bg-surface`,
   `text-brand`, `text-slate-*`) are remapped to vars in `app.css`'s
   warm-overrides block. If you introduce a new one, add it there.
4. The doctor PDF and `--data-*` / `--cohort-*` matrices are
   deliberately NOT themed (print stays light; chart mid-tones work on
   both surfaces).
5. Eyeball pass: `npx playwright test e2e/dark-smoke.spec.ts` emits
   PNGs to `e2e/_screenshots/dark/`.

## Asterisk loading vs empty (convention)

`<Asterisk mode="loading">` is for data actively being fetched or
decrypted; `<Asterisk muted>` (or `mode="empty"`) is for static
nothing-here states. Don't show a spinner for an empty state — it
promises progress that isn't coming.

## i18n

Locales: `de` (default + authoritative), `en`, `fr`, `it`. All
keys are flat-dot-path strings (`'nav.today'`, not nested
objects).

Source of truth: [`lib/i18n/de.ts`](../i18n/de.ts).

Enforced by:
- [`lib/i18n/keys-used.test.ts`](../i18n/keys-used.test.ts) —
  orphan detector. Every `de.ts` key must be referenced via
  `$t('foo.bar')` or covered by an entry in
  [`lib/i18n/dynamic-keys.ts`](../i18n/dynamic-keys.ts)
  (`DYNAMIC_KEY_PREFIXES` for prefix-matched families or
  `ORPHAN_AUDIT_BACKLOG` for individual still-unclaimed keys).
- The `ORPHAN_AUDIT_BACKLOG` is a visible TODO list: every entry
  should either be confirmed-dead (and deleted from all four
  locales + the backlog) or moved into a justified prefix in
  `DYNAMIC_KEY_PREFIXES`. Shrinking this list over time is the
  discipline.

## Component inventory (CIPH-832)

Enforced by: [`components-inventory.test.ts`](./components-inventory.test.ts).
Every `.svelte` file in this directory must appear below. The
test fails if a component is added without a README entry, or an
entry points at a file that no longer exists. **When adding a
component, add it here. When removing, remove it here.** Before
creating a new component, scan this list — there is probably
already a primitive that covers what you need.

### Layout shells

Shells own the reactive cascade (stores, derived `$:` state) and
hand pre-computed data to render-only children. One shell per
route kind.

- **Companion.svelte** [`Companion.svelte`] — 637 LOC, the
  dashboard shell rendered at `/`. Owns blueprint + docs +
  cycle + compliance + chart reactive state. Renders the
  full-width header, then delegates the 2/3 + 1/3 grid to
  `CompanionMain` + `CompanionRail`. Caregiver-empty and
  loading states live here.
- **CompanionMain.svelte** [`CompanionMain.svelte`] — 224 LOC,
  render-only main column of the dashboard. Takes ~30 props
  (pre-computed chart data, cycle state, callbacks). No store
  subscriptions, only 2 trivial `$:` helpers. Justified split
  (see "Companion split decision" below).
- **CompanionRail.svelte** [`CompanionRail.svelte`] — 188 LOC,
  render-only right rail of the dashboard (`lg:` and up).
  Shows compliance, doctor-export CTA, today's entries. Zero
  reactive declarations — pure render.
- **BottomNav.svelte** — mobile bottom tab bar (Dashboard /
  Journal / Kalender / Reports / Settings). Auth-aware via its
  own store subscription; renders nothing when signed out.
  Active-state pattern (CIPH-870): each tab uses a reactive
  declaration (`$: isXActive = …`) rather than a function called
  from the template. Svelte's template dependency tracking can't
  see through function bodies — inline a call like
  `class:active={isActive('/x')}` stops re-evaluating on
  navigation, so the first-rendered tab stays lit forever.
  12 regression tests in `BottomNav.test.ts` enforce this.
- **AuthedFooter.svelte** (CIPH-903) — minimal authed-shell
  footer rendered in `+layout.svelte` between `<main>` and
  `<BottomNav>`. Watermark Wordmark + Privacy / Terms /
  Security links + asterisk + `encryption.badge` trust line.
  Self-hides on focus surfaces (`/log/[date]`, `/setup`,
  `/login`, `/migrate`) so sticky save bars / wizard chrome
  own the bottom of the screen. The encryption.badge used to
  live as a dashboard-only block in `Companion.svelte`; it now
  renders on every authed surface that shows the footer.
- **PublicFooter.svelte** (CIPH-916) — full marketing footer
  for the public site. Mounted in `+layout.svelte` for the
  `landing` and `public-doc` shells (so /, /conditions,
  /privacy, /terms, /protocol all share it). Lifted from the
  inline `<footer>` that used to live in `routes/+page.svelte`.
  Auth-flow + family-claim shells skip it deliberately.

### Cards

- **EntryPreview.svelte** — 396 LOC, the canonical entry/event
  card. Used on dashboard, journal, calendar day-detail. Owns
  its own edit/delete affordances, symptom-chip rendering,
  condition-icon mapping, date chrome. This is the one card
  primitive for diary content.
- **DayDetail.svelte** (CIPH-910) — calendar-side-panel sectioned
  day view. Aggregates everything logged on a single date into
  labeled clinical sections (PHASE / EPISODEN / SYMPTOME /
  AUSLÖSER / VITALS / NOTIZEN / EREIGNISSE / TAGEBUCH) — text
  list per section, no chip-jumble. Render-only: edit/delete
  is the calendar's concern (panel-header link → `/log/{date}`
  for entries; events/diaries use the journal moment-modal).
  Used only by `routes/calendar/+page.svelte`.
- **LocaleSelect.svelte** (CIPH-pi24-5e) — custom listbox replacing
  the native `<select>` for the locale switcher on `/login` and
  `PublicFooter`. Native `<select>` can be styled at rest but the
  open option-panel is browser chrome the CSS cascade cannot reach;
  this component implements a `role="combobox"` button + `role=
  "listbox"` popover with keyboard nav (Up/Down/Home/End/Esc) and
  outside-click dismissal. Form-context selects (settings, EntryComposer)
  keep the native control on purpose.
- **ExportNoteReview.svelte** — pre-export opt-in for note markers.
  Freeform note markers are the only export content authored as prose,
  and people write prose: a real export carried a third party's name,
  a night-time detail and a second physician's opinion. Inclusion is
  therefore **opt-in, decided at report generation** rather than at the
  moment of writing — nothing is preselected, and the selection resets on
  every open (a decision about which sentences a doctor may read is not a
  preference to carry over). Skipped entirely when the window holds no
  note markers, so the ordinary export keeps its click count. Recorded
  data is never negotiable here: entries, episodes, vitals and rescue
  medication are the report. Options come from
  `lib/reports/noteMarkers.ts`, shared with `pdf.ts` so the set the user
  ticks is exactly the set printed.
- **ExportPeriodPopover.svelte** — period picker for the `/reports`
  doctor export. Renders the panel only; the trigger is the export
  card in `routes/reports/+page.svelte`, which owns `aria-haspopup` /
  `aria-expanded` and takes focus back on close (pass the card in as
  `anchor` so outside-click can tell "clicked the trigger again" from
  "clicked away"). Two presentations, one behaviour: an anchored
  `role="listbox"` with Up/Down/Home/End/Esc at ≥640px (same reasoning
  as `LocaleSelect.svelte`), a `BottomSheet` below that — touch has no
  hover and a panel under the third card in a 3-up grid clips at the
  viewport edge. Options come from `lib/reports/exportPeriods.ts`;
  every row states how much data the window holds, as a plain fact about
  the export. Low-coverage windows are offered like any other and are
  never labelled sparse/incomplete — a coverage figure describes the PDF,
  a judgment word describes the user and implies a logging target
  (`feedback_no_gaslight_good_days.md`; pinned by
  `lib/reports/no-coverage-judgment.test.ts`).
- **WelcomeCard.svelte** (post-pi24, go-live) — first-moment
  explainer that mounts at the top of the dashboard. Two variants
  branched on `auth.registrationSource`: `'web'` shows the new-user
  3-bullet intro (log daily / doctor PDF / save recovery code);
  `'migrate'` shows an import-count breakdown (entries / medications
  / notes from $documents), a one-sentence encryption note, and the
  epilepc readonly date with a verify-via-/journal link. Dismiss is
  one-shot per variant and ACCOUNT-DURABLE (2026-06-12): recorded on
  the encrypted blueprint (`dismissedWelcome`, helper
  `applyWelcomeDismissed`), with localStorage
  (`ciphra_welcome_web_seen` / `ciphra_welcome_migrate_seen`) as the
  instant-flip + caregiver fallback lane — localStorage-only dismissal
  kept resurfacing the card on fresh browser profiles. Renders nothing
  once dismissed.
  Used by `Companion.svelte` (mounted above the greeting hero).
- **GapTrendSpark.svelte** (CIPH-pi24-5c) — dashboard rail card
  showing the gap (days) between successive marker events as an
  inline-SVG sparkline. Last 5 historical gaps render as filled
  dots; the trailing in-progress current gap renders as a hollow
  dot. "Längster Abstand bisher" sits below as a reference line
  (no leaderboard reset). Only mounts when the active preset
  declares `markerEvent` AND ≥3 marker events exist — wraps the
  Klara objection at Companion.svelte:124 by showing trend, not a
  resetting counter. Used by `CompanionRail.svelte`.
- **LastEntriesStrip.svelte** (pi24 dashboard) — universal
  fallback for the dashboard primary slot. Renders up to 3 most-
  recent entry/event/diary docs as compact rows: date · type ·
  1-line summary. Mounts only when `docs.length > 0` — silent
  empty state per `feedback_no_gaslight_good_days.md`. Picked by
  `resolvePrimaryDashboardCard` when no cohort-specific card has
  signal (Helena pre-labs, day-1ish users, custom cohort, any
  blueprint where the pinned primitive can't fire yet). No
  coverage %, no streak counters, no "nothing recorded yet"
  copy — mirrors what's there, not gaps.
- **WithinPhaseRollupCard.svelte** (pi24 dashboard) — sits in
  the primary slot when `resolvePrimaryDashboardCard` returns
  `kind: 'active-phase'`. Co-renders with PhaseContextCard
  (anchor block above): anchor carries the phase identity
  ("you're in a flare, day N"), this card carries the within-
  episode data layer ("top symptoms inside this flare, episode
  count, rescue-med tally"). Date window = `activePhase.
  startedOn` to today. No pressure language; if everything is
  zero (a healthy day inside an ongoing flare), the card mounts
  with a single "{N} days logged" line via plural().
- **TopTriggersCard.svelte** (pi24 dashboard) — observational
  top-5 trigger list with horizontal bar weights + total-days
  footer. Used by migraine + dermatology when triggers have been
  recorded in the last 12 months. Title is "Top recorded
  triggers" / "Häufigste erfasste Auslöser" — observational
  ONLY, never "Your triggers" / "Causes" (Codex's caveat on
  the campfire). Counts blueprint-declared trigger ids across
  both data shapes (array + object-map), skipping the
  EntryComposer merge-shape false positives. Mounted by
  `CompanionMain` when `resolvePrimaryDashboardCard` returns
  `kind: 'top-triggers'`.
- **VitalTrendReportsCard.svelte** (pi24 reports) — the /reports
  counterpart to VitalTrendCard. Same monthly-mean aggregation but
  larger chart canvas, chip selector for 4+ vitals (chips not tabs —
  filter affordance within section), and a diverging-bar variant
  when the primary vital's range crosses zero (`min < 0`, e.g.
  bipolar mood_polarity). Per-bar color by sign in diverging mode
  so positive and negative halves read distinctly without a legend.
  Mounted by `routes/reports/+page.svelte` when
  `resolveReportsPrimaryCard` returns `kind: 'vital-trend'`.
- **VitalTrendCard.svelte** (pi24 dashboard) — 12-month monthly-
  mean line chart for a pinned primary vital (`primaryVitalId`).
  Used by hashimoto (TSH), hypertension (bp_systolic),
  cardiovascular (bp_systolic), diabetes (blood_sugar),
  parkinson (tremor_intensity), bipolar between flares
  (mood_polarity). Headline shows last value + delta from
  previous month. Sparse months render as gaps (`spanGaps: true`
  on the dataset) so a quarterly lab-cohort like Hashimoto stays
  readable. Pinned default vital — no chip selector on dashboard
  per campfire consensus. Multi-vital cohorts get a footer
  "{N} more values on /reports" link via plural() if
  secondaries have data. Mounted by `CompanionMain` when
  `resolvePrimaryDashboardCard` returns `kind: 'vital-trend'`.
- **InsightsSection.svelte** (CIPH-920) — dashboard "Muster"
  (patterns) section rendered below the primary card in
  `CompanionMain`. Capability-driven: computes cross-signal
  insight cards via `$lib/blueprint/insights.ts`
  (`computeInsights`) — sleep↔episodes, trigger lift, circadian
  daypart, episode-type mix, duration, and episode-free streak.
  Each card self-gates on blueprint capability + a minimum-data
  threshold, so the section enriches epilepsy/migraine/parkinson/
  etc. and renders nothing for cohorts/users without the data (no
  gaslighting empty state). Lightweight CSS/SVG viz, NOT Chart.js
  (CIPH-900 "insight over raw charts" lesson). Per-blueprint
  coverage is pinned by `insights.test.ts`.
- **MonthMiniSummary.svelte** (CIPH-pi19-B) — calendar right-rail
  tail. Shows trigger-day + rescue-med-day counts for the visible
  month, gated on `showTrigger` / `showRescue` props (which the
  parent derives from `bp.triggers.length` / `bp.rescueMedications
  .length`). Glyphs mirror the in-cell encoding (ochre triangle,
  brand vertical bar). Render-only — counts are pre-computed in
  the parent so we don't re-traverse `monthDocs`. Used only by
  `routes/calendar/+page.svelte`. PI v19 Story C will extend it
  with a 28-cell trigger-heatmap row above the count rows.

### Empty states (CIPH-893)

Per-surface empty primitives that read as the surface they replace
(stream card on journal, clinical table on reports) instead of a
uniform Asterisk hero. Composes with the cohort×route palette so
each surface is also visibly cohort-aware when empty.

- **JournalEmpty.svelte** — stream-card silhouette + hint copy.
  Variants: `'all'` / `'diary'`. `hideCta` suppresses the
  "log today" button when empty results come from a search filter.
  Used in `routes/journal/+page.svelte`.
- **ReportsEmpty.svelte** — clinical tabular silhouette with
  greyed-out cells + threshold-aware caption ("you logged X days,
  N more to unlock the report"). Used in `routes/reports/+page.svelte`.

### Forms

- **EntryComposer.svelte** (CIPH-850) — full-form entry surface
  for `/log/[date]`. Prop contract: `date`, `bp`, `existingDoc`,
  `previousDoc`, `isToday`, `recentDocs`, `onSave`, `onDelete`,
  `onDateChange`, `onJumpToToday`. Owns auto-save (3s debounce),
  section-jump nav, mobile IntersectionObserver, multi-entry
  vitals JSON round-trip, copy-previous-day, delete-confirm
  banner (primitive-exempt — see ConfirmDelete entry below),
  keyboard shortcuts (Ctrl+S, arrow keys for date nav), CIPH-302
  incomplete-CTA, CIPH-713 private toggle. Route wraps in
  `{#key date}` for fresh-instance-per-date semantics.
  `density='quick'` is reserved for PI v13 FAB consolidation.
  Contract enforced by `EntryComposer.test.ts`; route line-count
  guarded by `routes/log/[date]/line-count.test.ts`.
- **DatePicker.svelte** (PI v17) — brand-consistent wrapper around
  `<input type="date">`. Native chrome (sharp corners, browser-default
  layout) hidden via `opacity:0`; visible face shows dd.mm.yyyy via
  `formatDisplay`. Click triggers `inputEl.showPicker()` (Safari fallback:
  focus()+click()). Props: `value` (ISO YYYY-MM-DD), `id`, `format`
  (default `dd.mm.yyyy`, alts `dd/mm/yyyy`/`iso`/`us`), `ariaLabel`. Used
  in the diary quick-add modal in `+layout.svelte`. Settings toggle for
  display format queued for PI v18.
- **TimePicker.svelte** (PI v17) — same wrapper pattern as DatePicker
  for `<input type="time">`. Visible HH:MM, native picker on click.
  `compact` prop drops to 32px min-height for inline use beside +/-
  counters in EntryComposer episode rows. Used in diary quick-add and
  EntryComposer episode-time + multi-entry vitals time fields.
- **PasswordField.svelte** (CIPH-887) — wraps a native password
  input with an eye-icon toggle. Tap flips `type` between
  `password` and `text` for the current session only — visibility
  is never persisted to localStorage (security). Used wherever a
  passphrase is entered: `LoginForm`, `SignupFlow` (×2), the
  recovery flow on `/login`, and the generic `Input.svelte`
  delegates to it for `type="password"`. Audit guard in
  `PasswordField.test.ts` asserts no other `.svelte` renders a
  bare `<input type="password">`.
- **SignupFlow.svelte** — multi-step signup (username →
  passphrase → recovery code → condition presets). Used on
  `/login` and `/migrate`. Covered by `SignupFlow.test.ts`.
- **LoginForm.svelte** — passphrase login. Used on `/login`.
- **FamilySharing.svelte** — settings panel: generate family
  code, list linked accounts, revoke.
- **LinkedAccounts.svelte** — settings panel: accounts this
  user is linked to (caregiver side).

### Primitives (in use)

- **Asterisk.svelte** — the brand mark. Loading / saved / empty
  / static modes. Every route uses this.
- **Wordmark.svelte** (CIPH-896) — the canonical "ciphra*" brand
  mark with text + rotated asterisk in one SVG. Replaces 5+
  hand-rolled SVG wordmarks (landing nav/hero/footer, layout
  header, login + migrate auth headers). Single `size` prop scales
  the whole composition; `mark="brand" | "muted"` for watermark
  contexts. Asterisk geometry mirrors `Asterisk.svelte` exactly.
  Audit guard: `lib/wordmark-consolidation.test.ts` forbids any
  other `rotate(8)` SVG outside this primitive + Asterisk.
- **Toast.svelte** — top-of-viewport transient message. Used
  in `+layout.svelte` for sync indicator and in
  `conditions/*` for the preset-saved confirmation. Keyed
  re-render pattern documented at use sites.
- **ChartWrapper.svelte** — thin Chart.js wrapper with
  responsive sizing + reduced-motion handling. Used on
  dashboard (episode + symptom + how-are-you charts) and
  calendar (weekday distribution).
- **Sparkline.svelte** (pi24 admin) — stateless inline SVG
  sparkline: takes an array of numbers, renders a single
  polyline plus a trailing dot for the most recent value. No
  axes, no legend, no library — by design. Used by the admin
  dashboard's sparkline-first metric layout (migration counter,
  active users, document totals).
- **ConfirmDelete.svelte** (CIPH-834) — the red "Yes delete" +
  "Cancel" button pair shown next to a just-tapped delete icon
  on an entry card. Used on `routes/journal/+page.svelte` and
  `routes/calendar/+page.svelte`. Compact sibling variants
  (CompanionRail 40px pair, `EntryComposer` full-width banner)
  keep their inline markup and declare a
  `<!-- primitive-exempt: ConfirmDelete … -->` comment.
- **Modal.svelte** (CIPH-834) — centred dialog over a
  translucent backdrop. Esc + backdrop click close when
  `dismissable`. Used for the `/migrate` post-import tour.
  Settings + admin keep their bespoke danger-chrome dialogs
  inline with `<!-- primitive-exempt: Modal … -->` comments.
- **CustomItemModal.svelte** (CIPH-882) — kind-driven add/edit
  form for user-added blueprint items: symptom, trigger, vital,
  episode. Wraps `Modal.svelte`. Form fields branch on `kind`:
  symptom (label + optional group select), trigger (label),
  vital (label + unit + min + max), episode (label + 6-color
  palette from `dataPalette`). Validation routed through
  `validateCustomItem(kind, item)` so the modal and any future
  caller surface the same error keys. On save, dispatches the
  fully-typed item with a generated `custom_<slug>_<suffix>` id
  (or the existing id when editing); callers persist via
  `blueprint.save(next)` after appending to the right
  `customizations.custom*` array. Custom items render across
  every blueprint surface via the discriminator branch
  enumerated in [`labels-audit.md`](../labels-audit.md).
  Contract test: `CustomItemModal.test.ts`. Used in
  `routes/settings/+page.svelte` (tracking tab) and the
  `/setup` wizard.
- **HelpHint.svelte** (CIPH-834) — dismissable inline info
  banner (NOT modal). Visually distinct from Toast (Toast is
  transient + floating, HelpHint is persistent + inline).
  Stateless: callers own the "already seen?" persistence.
  Currently defined; not yet wired at any site — the first
  production use-case for this primitive is expected in PI v10
  (Tagebuch + cycle education hints).
- **Tabs.svelte** (CIPH-857) — ARIA tab pattern with roving
  tabindex + Left/Right/Home/End keyboard nav. Parent owns the
  URL (passes `current` + `onSelect`). Used on
  `routes/settings/+page.svelte` for the Account / Tracking /
  Sharing split.
- **PhaseContextCard.svelte** (CIPH-854; extended CIPH-855b) —
  home-dashboard card shown only for the phase-band cohort
  (bipolar / MS / long-covid / IBD / IBS / chronic_pain /
  anxiety_depression / burnout) when a multiDay episode is
  ongoing. Renders "Day N of <phase>, started <date>". Accepts an
  optional `activeCount` prop (added PI v11 / CIPH-855b): when > 1
  the card renders a neutral "N Phasen aktiv / N phases active"
  pill for bipolar mixed states, long-covid + PEM overlap, IBD
  with two simultaneous flare types. Used in `CompanionMain.svelte`.

### Feature-specific

- **EncryptionDemo.svelte** — landing-page animated demo of
  client-side encryption. Used on `/` (public landing) only.

### Primitives defined but not yet wired

These exist as scaffolding from earlier PIs but no route
currently imports them. Do not add new use sites without also
updating this README and migrating at least one call site as
part of the same change. A future PI will sweep or retire
each.

- **Badge.svelte** — would replace inline `.badge` + `.badge-*`
  usage. Currently every call site uses the CSS class directly.
- **Button.svelte** — would replace inline `btn-primary` /
  `btn-secondary` usage. Call sites use the CSS class directly.
- **Card.svelte** — would wrap `.card-*` variants. Call sites
  use the CSS classes directly (see "Card CSS variants" below).
- **Input.svelte** — would wrap labelled form inputs.
- **ChipGroup.svelte** — symptom / preset chip selector. Not
  currently used; chips are rendered inline in `/log/today`.
- **Counter.svelte** — stepper for episode counts. Not
  currently used; `/log/today` renders inline.
- **StatCard.svelte** — the "big number + label" stat tile.
  Reports page renders this pattern inline.
- **EmptyState.svelte** — "nothing here yet" panel with CTA.
  Used candidate for CIPH-834. Pages currently inline this.
- **SectionDivider.svelte** — asterisk-centred rule. Companion
  renders the pattern inline.
- **BottomSheet.svelte** — mobile modal sheet. Modal primitive
  candidate for CIPH-834.
- **Skeleton.svelte** — shimmer loading placeholder. Not used;
  loading states currently use the `Asterisk mode="loading"`
  pattern instead.

### Interaction primitives — CIPH-834 status

CIPH-834 extracted three primitives. The heuristic test
[`primitives.test.ts`](./primitives.test.ts) fails if a new
inline duplicate appears without either adopting the primitive
or declaring an exemption comment.

| Primitive | Canonical sites | Exempt sites (with reason) |
| --- | --- | --- |
| `ConfirmDelete` | `routes/journal/+page.svelte`, `routes/calendar/+page.svelte` | `CompanionRail.svelte` (40px compact variant), `routes/log/[date]/+page.svelte` (full-width banner variant) |
| `Modal` | `routes/migrate/+page.svelte` (post-import tour) | `routes/settings/+page.svelte` + `routes/admin/+page.svelte` (bespoke danger-chrome dialogs), `BottomSheet.svelte` (it **is** the other modal primitive — mobile bottom sheet) |
| `HelpHint` | *(none yet wired — first use expected in PI v10)* | *(n/a)* |

Opt-out: add `<!-- primitive-exempt: <Primitive> — <reason> -->`
to the top of the file. The heuristic is a soft fence: it
catches drift, it does not enforce style. `EmptyState.svelte`
remains un-swept; adoption is deferred to a future PI because
every "nothing here yet" site has bespoke iconography.

## Shared math / helper modules

Modules that are not components but have the same "single source of
truth" status. When a consumer needs cycle math, effective column
derivation, or condition-cohort resolution, it imports from here
rather than re-implementing. Drift is structural — catch it at PR
review, not at runtime.

- **`$lib/cycleState.ts`** (CIPH-855a) — Cycle-phase math. Exports
  `Phase` type, `computeCycleAnchor(bp, docs)`,
  `cycleStateForDate(anchor, date)`, `phaseBoundaries(cycleLength)`,
  `phaseForDay(day, cycleLength)`, `computeCycleStateToday(…)`,
  `PHASE_COLORS`. Consumed by `Companion.svelte` and
  `routes/calendar/+page.svelte`. **Do not re-implement cycle-day
  math at a call site** — extend this module. 17 unit tests pin
  the extraction parity.
- **`$lib/pdf.ts` effective-column helpers** (CIPH-877) —
  `effectiveSymptomColumns(bp, docs, datePrefix, excludeIds?)` and
  `effectiveEpisodeColumns(bp, docs, datePrefix)`. Both return
  `curated ∪ items-with-data-in-range`. Used by the doctor PDF
  (`drawGridSection`) and by `routes/reports/+page.svelte`. Keeps
  the on-screen grid and the exported PDF/CSV aligned so users
  never see a logged symptom missing from the export.
- **`$lib/blueprint/cohort.ts`** (CIPH-854 / PI v10) — Resolves a
  blueprint to one of `discrete` / `cycle` / `phase` / `narrative`
  / `custom` via `cohortOf(blueprint)`. Used by Companion + route
  shells + Calendar to decide which cohort-specific surfaces to
  render.

## Card CSS variants

Defined in `app.css` (`@layer components`). Used directly as
CSS classes, not via `Card.svelte`. All 7 variants are in use;
none pruned.

- `.card` — default white-on-warm card. 1px border, 12px radius.
- `.card-anchor` — page's primary action card. 2px brand border,
  24px padding. One per page max. (CompanionMain, CompanionRail.)
- `.card-inline` — secondary info, muted surface, no border,
  12px padding. (reports/+page.svelte.)
- `.card-interactive` — hover-lift variant of `.card`.
  (conditions/+page, landing preset grid.)
- `.card-ochre` — ochre-tinted emphasis. (conditions/[id].)
- `.card-olive` — olive-tinted emphasis, used for success /
  completed states. (Companion today-filled, conditions/[id].)
- `.card-brand` — brand-tinted emphasis. (Companion today-
  not-filled CTA.)

## Companion split decision (CIPH-832)

**Kept split.** Rationale:
- `Companion.svelte` is already 637 LOC with 31 reactive
  declarations driving cycle math, chart data, compliance, and
  the how-are-you trend. Merging the 224 + 188 LOC of render
  markup from Main + Rail would push it past 1000 LOC of mixed
  reactive-state-plus-markup and make it unreadable.
- The responsibility boundary is clean: Companion owns state,
  Main + Rail are render-only (Main has 2 trivial derived
  helpers, Rail has 0). The ~47 total props flowing to Main +
  Rail document the boundary explicitly.
- The PI v8 retro flagged the split as "hasty" — post-PI v8 the
  layout is stable (full-width header + 2/3+1/3 grid + full-
  width footer) and the split survives the stability test. No
  reactive state has leaked into Main or Rail.
- Beat (visual) confirmed in persona dry-run: the split is
  invisible at the pixel level. Merging back and re-splitting
  later would be churn.

## Route shells (CIPH-833)

Source of truth: [`lib/routeShells.ts`](../routeShells.ts).
Enforced by: [`lib/routeShells.test.ts`](../routeShells.test.ts).

`ROUTE_SHELLS` maps each pathname pattern to a `ShellType` plus
`requiresAuth` and `requiresBlueprint` flags. `+layout.svelte`'s
redirect guards consume the flags directly — there is no longer a
per-route allowlist chained into each `$:` reactive block.

Shell types:

- `landing` — public marketing chrome. Routes: `/`.
- `auth-flow` — centred-card flow with public nav. Routes:
  `/login`, `/migrate`, `/stream/*`.
- `authed-app` — signed-in app: top header + main + bottom nav.
  Routes: `/log/*`, `/journal`, `/calendar`, `/reports`,
  `/settings`, `/setup`. The catch-all for unknown paths also
  resolves here (with both guards on) so an unregistered new
  route fails closed.
- `public-doc` — public reading surface. Routes: `/privacy`,
  `/terms`, `/protocol`, `/conditions/*`.
- `admin` — authed-app variant for admin pages. Routes:
  `/admin/*`. Does not require a blueprint (admin caregivers
  may not track their own condition).
- `family-claim` — public family-code claim landing. Routes:
  `/join/*`.

When adding a new route:

1. Add a pattern to `ROUTE_SHELLS` with the right `shell` +
   `requiresAuth` + `requiresBlueprint`.
2. Add a test case to `routeShells.test.ts`.
3. The layout's redirect guards will pick it up automatically —
   you should not need to touch `+layout.svelte` just to add a
   route.

## How to add a new feature

1. Read the "Read this before adding any code" section at the top.
2. Use only tokens from Spacing / Typography / Color sections.
3. Need a new component? Check the Component inventory first —
   there is probably already a primitive that covers it.
4. Adding a confirm-delete pattern or a centred dialog? Use
   `<ConfirmDelete>` / `<Modal>` / `<HelpHint>`. If your variant
   genuinely does not fit, declare `<!-- primitive-exempt:
   <Primitive> — <reason> -->` so the heuristic test stays green
   and the next visual pass knows why you opted out.
5. Adding a new route? Register it in `routeShells.ts` and add
   a test case. Do not copy-paste pathname checks into
   `+layout.svelte`.
6. If you need a new token, amend the corresponding
   `*Tokens.ts` file and document the reason in the same commit.
7. If you add or remove a `.svelte` file under
   `lib/components/`, update the Component inventory section
   above in the same commit — `components-inventory.test.ts`
   will fail otherwise.
8. Add i18n keys to all four locales (`de`, `en`, `fr`, `it`).
9. Run `npx vitest run && npx svelte-check` before you push —
   the enforcement tests fail fast on drift.

## How to add a new component

1. Confirm no existing primitive covers the need (Component
   inventory above).
2. Create `YourComponent.svelte` under `lib/components/`.
3. Add a doc comment at the top explaining when to use it, what
   it does **not** do (negative space matters), and a minimal
   `Usage:` example.
4. Add an entry to the Component inventory section in the same
   commit — otherwise `components-inventory.test.ts` fails.
5. If the component replaces an inline pattern, sweep existing
   call sites. If the sweep is out of scope, add the inline-
   pattern regex to `primitives.test.ts` so future PRs are
   caught.

## How to add a new route

1. Add the path to [`lib/routeShells.ts`](../routeShells.ts)
   with the correct shell + auth + blueprint flags.
2. Add a test case to `routeShells.test.ts`.
3. Create `src/routes/<path>/+page.svelte`.
4. Do not modify `+layout.svelte` auth-redirect logic to add a
   one-off exception — fix the shell definition instead.

## How to add an i18n string

1. Add the key to `de.ts` (authoritative) AND `en.ts`, `fr.ts`,
   `it.ts` in the same commit. All four files must have the
   key; missing-locale fallbacks silently hide bugs.
2. Reference the key statically: `$t('your.key')`.
3. If you access the key via a template string or variable
   lookup (e.g. `$t(`prefix_${variable}`)`), add the prefix to
   `DYNAMIC_KEY_PREFIXES` in `lib/i18n/dynamic-keys.ts` with a
   comment pointing to the call site — otherwise
   `keys-used.test.ts` flags the new keys as orphaned.
4. When removing a key, delete from all four locales AND remove
   any `dynamic-keys.ts` allowlist entry in the same commit.
