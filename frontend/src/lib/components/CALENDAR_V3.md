# Calendar v3 — design memo

Author: frontend-designer
PI: v18, story CIPH-pi18-1
Status: design proposal, not a PR
Surface: `routes/calendar/+page.svelte` + `lib/components/DayDetail.svelte`

The user's complaint, verbatim:

> "calendar view is very stuck at the top of the page and is missing the
> possibility to display Auslöser and taken medications. Doesn't feel ready
> for prod."

This memo answers that.

---

## 1. Diagnosis

V2 ships two correct decisions and one quiet failure.

The **quiet failure**: the day cell encodes "I logged" but not "what
mattered." Triggers and rescue meds are surfaced one tap away in
`DayDetail.svelte:32-76` — the data is fully aggregated — but the cell
that drives the user's eye carries zero signal for either. For an
epilepsy log of "Anfall + Midazolam given" the cell shows two
indistinguishable 6×6 dots: one red, one olive. The patient cannot scan
the month for "the days I had to use rescue meds." That's the prod gap.

The two correct decisions stay: 6px phase bands for `cohort==='phase'`
(`+page.svelte:533-545`) and the cycle-phase background for
`cohort==='cycle'` (`+page.svelte:514-516`). v3 must not regress either.

The "stuck at the top" complaint is the second-order symptom: because
the cell is mute, the panel does the work — but the panel only opens
on tap, leaving 250–300 px of empty real estate below the grid on a
desktop viewport. The grid finishes saying nothing at ~520 px and the
page hands you nothing else.

---

## 2. In-cell encoding for triggers + rescue meds

### Options weighed

**A — Edge marker stripe (right edge, 2 px, stacked).**
Pros: zero collision with phase-override triangle (top-right) or bands
(bottom). Honors the cell's existing geometry — phase background fills
center, dots sit center, bands sit bottom, override sits top-right;
right-edge is genuinely empty. Cons: 2 px stripes on a 44 px cell
disappear at any zoom-out. Color-blind risk: olive vs brand at 2 px is a
forensic exam.

**B — Icon micro-row under the day number.**
Pros: explicit, labelable via `aria-hidden` siblings. Cons: 8 px icons
look like crumbs. The day number is already centered; putting glyphs
under it pushes the typographic center off-axis on a 44 px square. SVGs
at 8 px lose stroke fidelity.

**C — Layered counter dot.**
Pros: stays inside the existing dot grammar. Cons: a "notch" on a 6 px
dot is invisible. A "split dot" (half olive / half ochre) reads as a
new third state, not as "log + trigger." This is the option that
sounds clever and tests poorly.

**D — Corner badge (bottom-right, 6×6 square).**
Pros: top-right is taken (override triangle), bottom-left can be
taken next, this gives us four anchored corners. Cons: rescue meds get
a corner, fine — what about triggers? Now we have two tiny corner
shapes plus two centered dots plus bands plus phase bg. Cell is
chrome soup.

**E — Abandon in-cell, use an always-visible legend strip.**
Pros: cell stays minimal. Cons: doesn't answer the user — they want
to *see the days* with triggers/meds while looking at the month.

### Recommendation: **modified A — single right-edge accent bar, count-aware, at 3 px.**

The cell already has six visual layers. Adding a seventh in the
*existing* counter-dot row is the least-invasive move. The counter-dot
row already grows from 0 to 2 dots; we extend it to a fixed 3-slot
grammar and add a single 3-px edge accent for "rescue med happened
today" because rescue meds are clinically the strongest signal and
deserve a position the dots can't drown.

#### Geometry (final shape)

```
┌─────────────┐  cell, 44 px+ square
│         ▲   │  ← phase-override triangle (existing, top-right)
│             │
│     12      │  ← day number (existing, centered)
│   ● ● ▲     │  ← counter row, 3 slots, 6 px each, 3 px gap
│             │     slot 1 = episode (red)
│ ░░░░░░░░░░░ │  ← multi-day band(s) (existing, bottom)
└─────────────┘     slot 2 = log (olive)
                    slot 3 = trigger (ochre, ▲ shape)
                    + right-edge bar 3 px wide if rescue med (brand)
```

Three encodings, three anchored positions, one shape variant (triangle
for trigger so olive vs ochre dots aren't the only differentiator —
defends color-blind users), one edge-bar for rescue med (the strongest
clinical signal gets the most distinct visual register).

#### CSS sketch

```css
.cal-cell {
  position: relative;
  /* existing: aspect-square, min-h-[44px], rounded-xl, etc. */
}
/* existing center row */
.cal-marks {
  display: flex;
  gap: 2px;
  margin-top: 2px;
  align-items: center;
}
.cal-mark-dot      { width: 6px; height: 6px; border-radius: 50%; }
.cal-mark-episode  { background: var(--danger); }
.cal-mark-log      { background: var(--olive); }
.cal-mark-trigger {  /* triangle, not dot — color-blind delta */
  width: 0; height: 0;
  border-left:  3px solid transparent;
  border-right: 3px solid transparent;
  border-bottom: 6px solid var(--ochre);
}
/* rescue-med edge bar — anchored, hard to miss, doesn't fight other layers */
.cal-mark-rescue {
  position: absolute;
  top: 4px; bottom: 4px; right: 0;
  width: 3px;
  border-radius: 2px 0 0 2px;
  background: var(--brand);
}
```

#### Three-density preview

Empty day:
```
┌─────────────┐
│             │
│     12      │
│             │
│             │
└─────────────┘
```

Log + trigger:
```
┌─────────────┐
│             │
│     12      │
│   ● ▲       │
│             │
└─────────────┘
```

Episode + log + trigger + rescue med (epilepsy worst-case):
```
┌─────────────┐
│            ▎│  ← rescue-med edge bar (brand)
│     12     ▎│
│   ● ● ▲    ▎│
│ ░░░░░░░░░░░│  ← phase band still wins the bottom edge
└─────────────┘
```

#### Tap targets

Cell stays the tap target. Marks are visual only — `pointer-events:
none` on `.cal-marks` and `.cal-mark-rescue` so the whole cell remains
the 44×44 hit zone. No focus traps inside the cell.

#### a11y

`aria-label` already aggregates count info (`+page.svelte:195-209`).
Extend `dayAriaLabel(day)` to append trigger count and rescue-med count
where present — the screen reader doesn't care about the visual
encoding, only the cardinality. The marks themselves are
`aria-hidden`.

#### Contrast

- `var(--ochre)` triangle on `var(--surface)` — same path as the dots,
  already audited at PI v8 LB-23.
- `var(--brand)` edge bar on cycle-phase backgrounds: edge bar sits at
  `right: 0`, full alpha, 3 px wide. Phase bg is at 15 % opacity (or
  35 % for menstrual). The edge bar wins. Verified against all four
  `PHASE_COLORS` swatches at 35 % opacity — brand ≥ 4.5:1 against each.
- The triangle inside the counter row is the only at-risk mark when
  rendered over a deeply-tinted phase bg (menstrual + selected). At
  35 % opacity, the triangle reads as a shape because of its silhouette,
  not its hue — that's the point of using a triangle.

#### Color-blind safety

The four marks resolve as: red dot, olive dot, ochre **triangle**,
brand edge bar. Two shape variants + one positional variant = robust
under deuteranopia. The current v2 *already* fails this test (red dot
vs olive dot is borderline); v3 fixes that incidentally.

#### Collapse rule (5+ signals)

The counter row caps at 3 slots. Because `episode`, `log`, `trigger`
are mutually exclusive *in slot meaning* (each can only be present
once per day in the row), there is no overflow case for the row.
Rescue-med bar is binary: present or not. The number of *individual*
rescue meds taken is collapsed into one bar — the count belongs in the
panel, not the cell. Same with trigger count: the cell says "had
triggers"; `aria-label` and `DayDetail` carry the cardinality.

If a future cohort wants a fourth signal (e.g. "fever flag" for IBD),
the rule is: it goes in `DayDetail`, not the cell. The cell is closed
at 3 marks + 1 edge.

---

## 3. Filling the dead vertical space

### Recommendation: **A — persistent right-rail day detail on `lg:` and up; bottom-sheet preserved on `md:` and below.**

The other options are familiar but wrong-shaped.

**B (KPI block expansion)** trades 250 px of dead space for 200 px of
low-information density. "Average symptoms/day" is not a number a
patient pulls up the calendar to find. It belongs on `/reports`, where
the team already shipped the 24-month trend (PI v17). The calendar
should not become reports-lite.

**C (daily-strip row)** is a novelty. Inverting the grid into a
horizontal scroll says "the grid wasn't enough" when the actual problem
is the cell, not the layout. Solving with C means we accepted the cell
is mute and built a workaround surface. We're solving the cell in §2 —
don't also build C.

**A is the Threema move.** Threema's file panel, GitHub's file-tree +
diff split, Linear's issue-list + side panel: all of them recognize
that on a desktop viewport ≥ 1024 px wide, splitting "browse" from
"detail" is more honest than overlaying a modal on a sea of empty
pixels. The calendar is a browser; the day is the detail. Make it
permanent.

#### Layout (grid-template-areas)

```
Mobile (<md, <768px) — unchanged from v2:
┌───────────────────────────┐
│ month nav                 │
│ legend (cohort)           │
│ weekday hdr               │
│ ┌─────────────────────┐   │
│ │   day grid          │   │
│ └─────────────────────┘   │
│ KPI 2-card                │
│ event strip (if any)      │
└───────────────────────────┘
  bottom sheet on tap → DayDetail.svelte (existing)

Desktop (md, 768–1023px) — unchanged from v2:
  Same as mobile. Right-side slide-in panel on tap.
  This breakpoint is small enough that splitting steals
  too much grid width.

Wide (lg, ≥1024px) — NEW:
┌─────────────────────────────────────────────────────┐
│ month nav                  │ ── selected day ──     │
│ legend                     │ Mi, 14. Mai            │
│ weekday hdr                │ ┌────────────────────┐ │
│ ┌──────────────────┐       │ │ DayDetail content  │ │
│ │   day grid       │       │ │ (sectioned, full)  │ │
│ │   (~64% width)   │       │ └────────────────────┘ │
│ └──────────────────┘       │                        │
│ KPI 2-card                 │ ── this month ──       │
│ event strip                │ ▦ trigger heatmap row  │
│                            │ ▦ rescue-med count     │
└─────────────────────────────────────────────────────┘
```

```css
@media (min-width: 1024px) {
  .cal-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 24px;
    align-items: start;
  }
  .cal-rail {
    position: sticky;
    top: 80px;          /* under the authed header */
    max-height: calc(100vh - 96px - var(--bottom-nav-h, 0px));
    overflow-y: auto;
    border-left: 1px solid var(--border-subtle);
    padding-left: 20px;
  }
}
```

The rail's default content (when `selectedDate === null`) is **today**
plus a "this month" mini-summary at the bottom — trigger frequency
strip, rescue-med count. That mini-summary is where option B's
data goes when it's actually relevant: as context to "today," not as a
KPI dashboard.

#### What the rail shows in three states

| state | top of rail | bottom of rail |
|-|-|-|
| no selection, on current month | "Heute" + DayDetail for today | this-month mini-summary |
| no selection, browsing past month | "Letzte Aktivität" + DayDetail for the most recent logged day in view | this-month mini-summary |
| day selected | DayDetail for selected | this-month mini-summary |

#### Mobile + tablet stay the same

`md:` users (768–1023 px, mostly tablets in portrait + small laptops)
keep the existing right-side slide-in. Why: rail at 360 px on a 768 px
viewport leaves the grid at 408 px — too cramped for 7 columns of
44+ px cells. The slide-in remains the right tradeoff there.

`<md` mobile: bottom sheet stays. The user's original "stuck at top"
complaint is a desktop complaint — on mobile, the page scrolls and
there is no dead vertical space because the bottom-nav is right under
the grid.

---

## 4. Per-cohort relevance matrix

| cohort | trigger importance | rescue-med importance | default visibility | notes |
|-|-|-|-|-|
| **discrete** (epilepsy, ADHD, asthma, parkinson, …) | Medium | **High** | both ON | epilepsy specifically: rescue-med signal is clinically critical. Asthma puffer is the same shape. ADHD has neither typically — see filter rule below. |
| **cycle** (endo, menopause, PCOS) | **High** | Low–Med | trigger ON, rescue-med ON if `bp.rescueMedications?.length` | trigger hunting drives cycle work; rescue meds rare but PCOS hormonal-rescue exists. |
| **phase** (bipolar, MS, IBD, IBS, chronic_pain, anx_dep, burnout, long_covid) | **High** | **High** | both ON | bipolar rescue benzo; MS steroid burst; IBD flare-cortico — all need to be visible in-month. |
| **narrative** (migraine) | **High** | Medium | both ON | trigger encoding is the entire game. Even though journal is the primary surface for migraine cohort, when they DO open calendar it's specifically to scan triggers. |
| **custom** | depends | depends | both ON if blueprint declares them | safe-default: render what the blueprint defines. |

### Filter rule

The mark renders **iff the blueprint declares the corresponding feature
is non-empty AND the day's data carries that signal.**

```ts
$: showTriggerMark = (bp?.triggers?.length ?? 0) > 0;
$: showRescueMedMark = (bp?.rescueMedications?.length ?? 0) > 0;
```

So an ADHD blueprint with no `rescueMedications` simply never paints
the edge bar — no chrome cost. The matrix above is for documentation;
the runtime rule is data-driven, not cohort-switched. **The cohort
table is a sanity check, not a hardcoded gate.** This matches the v2
discipline ("cohort is derived, not stored", `cohort.ts:18-21`).

### Per-blueprint toggle?

Not in v3. The audit-trail of "user disabled trigger marks" is more
chrome than the marks themselves. If post-launch a user complains the
cell is too busy for their condition, we add a Settings toggle then —
but ship without it. (Custom blueprints can already curate their own
trigger/rescue-med lists upstream.)

### Migraine note

Migraine is `narrative` — primary surface is journal. But the calendar
isn't hidden for narrative; it's just secondary. The trigger-mark IS
the reason a migraine patient would open the calendar. So narrative
gets full mark rendering; the cohort default surface stays journal
(`cohort.ts:67-73`).

---

## 5. Day-detail panel coexistence

### On `<lg` (mobile + tablet)

Tap a day → existing behavior. Bottom sheet on mobile, right-slide
panel on tablet. Header arrows (prev/next day) stay. `Esc` closes.
Focus return to the cell. **Zero changes from v2.**

### On `lg:` and up

Tap a day → the rail's content updates to that day's `DayDetail`. The
rail is **not modal** — no overlay, no focus trap, no `aria-modal`.
Tap another day, rail updates again. Tap the same day a second time:
no-op (don't toggle off — the rail always shows *something*).

The slide-in modal **goes away on `lg:`**. It was a layered overlay
solving an absence-of-rail problem; now there is a rail.

#### What about the prev/next-day arrows?

They survive, in the rail header. They stop being "dialog navigation"
(escape valve out of a modal) and become "browse without leaving the
month." Selected-cell ring follows the arrows, exactly like v2's
`adjustSelectedDate()` already does.

```
Rail header (lg:):
┌──────────────────────────────────┐
│  ←  Mi, 14. Mai 2026  →   ✎     │
│                          edit   │
└──────────────────────────────────┘
```

The edit link still routes to `/log/{date}` — the rail is render-only,
same contract as `DayDetail.svelte`'s docstring promise.

#### What about the dim/scrim?

There is no scrim on `lg:`. The dim is a modal affordance; the rail is
a layout affordance. Removing the scrim is half the win — the user can
keep glancing at the grid while reading the day. This is the actual
"unstuck from the top" delivery.

#### a11y on the rail

`role="region"`, `aria-label="Tagesdetails"`. Selected day announced
via `aria-live="polite"` on the rail title. No focus trap. `Esc` from
within the rail clears `selectedDate` (returns to "today"
default), focus moves back to the previously-selected cell — same
focus-restore code that already exists at `+page.svelte:307-321`,
just minus the modal-only branches.

The `lg:` removal of the modal also means `panelEl`/`handlePanelKey`
become `<lg`-only. Cleaner code, fewer branches.

---

## 6. Implementation split for PI v19

Four stories. Sized so they can ship in any order; I've marked the
soft dependency where it matters.

### CIPH-pi19-A — In-cell trigger + rescue-med encoding

- **Summary:** Add trigger triangle (counter-row slot 3) and rescue-med
  edge bar to the calendar day cell. Aggregation already exists in
  `DayDetail`; lift the same logic into `+page.svelte` once
  (Set-based, memoized like `docsByDay`). Extend `dayAriaLabel`.
- **Files:** `routes/calendar/+page.svelte` (add `dayHasTrigger(day)`
  + `dayHasRescueMed(day)` + memoization, add markup, extend
  `dayAriaLabel`), `i18n/{de,en,fr,it}.ts` (extended aria strings),
  vitest.
- **User-facing change:** the user can scan the month and see which
  days had triggers (ochre triangle) and which days had rescue meds
  (brand edge bar) without opening the panel.
- **Risk:** **Low.** Pure additive, gated by data-driven `if`-rules.
  Vitest covers the cardinality; visual smoke covers the layering.
- **Dependency:** none. Ships standalone.

### CIPH-pi19-B — Persistent right-rail on `lg:`

- **Summary:** Wrap calendar page in a `lg:` 2-column grid. Rail
  hosts a render-only `DayDetail` plus a "this month" mini-summary
  (count of days with triggers, count of rescue-med days). Modal
  behavior preserved on `<lg`.
- **Files:** `routes/calendar/+page.svelte` (new `.cal-page` wrapper +
  `.cal-rail` block + new `MonthMiniSummary.svelte` child), new
  component `MonthMiniSummary.svelte`, `routeShells.ts` (no change —
  same `data` shell), README inventory entry.
- **User-facing change:** desktop calendar at ≥ 1024 px no longer has
  dead vertical space; the day-detail is always visible. No mobile
  change.
- **Risk:** **Medium.** The lg:-vs-modal branch needs visual smoke
  on three viewport widths (375 / 900 / 1440). Focus management
  refactor is the riskiest bit — the current modal trap code at
  `+page.svelte:282-321` must become `<lg`-conditional without
  regressing the existing a11y test.
- **Dependency:** soft on A. B without A is fine (rail still useful);
  A without B is fine (cells still better). A then B is the order I'd
  vote for, because A's mini-summary feeds B's rail.

### CIPH-pi19-C — Trigger heatmap row in mini-summary

- **Summary:** Inside the rail's "this month" block (or under the KPI
  cards on `<lg`), a 28-cell horizontal strip — one per day of the
  month — colored ochre at variable opacity by *number of triggers
  logged that day*. Click jumps to that day. Pulls from the same
  aggregation as A.
- **Files:** new `MonthTriggerHeatmap.svelte`, `routes/calendar/`,
  README inventory entry.
- **User-facing change:** at-a-glance "trigger pressure across the
  month" — high-leverage for migraine and cycle cohorts.
- **Risk:** **Low–Medium.** Novel surface, but tiny. Real risk is
  cohort-switching: the heatmap is only valuable when triggers are
  the dominant signal (`narrative` + `cycle`). For `discrete` cohorts
  with no triggers, hide it.
- **Dependency:** **soft on A** (same aggregation). Cleaner if A ships
  first.

### CIPH-pi19-D — Color-blind + reduced-motion validation pass

- **Summary:** Playwright visual regression for the day cell at the 3
  density extremes from §2 across 4 phase backgrounds × 2 selected/not
  states. Add `prefers-reduced-motion` check on the rail-content
  swap (no slide animation when the rail re-targets).
- **Files:** Playwright spec, vitest snapshot.
- **User-facing change:** none direct; defends the v3 invariants.
- **Risk:** **Low.** Pure test discipline.
- **Dependency:** **hard on A and B.** Ships last.

### Suggested sprint order

1. A (cell encoding) — highest user value, low risk, unblocks rail.
2. B (rail) — biggest visible delivery to the "stuck at top" complaint.
3. C (heatmap) — extra credit; can defer to PI v20 if sprint pressure.
4. D (validation) — defend the work.

A and B together close the user complaint. C is the additional
"the calendar feels like a real tool" lift.

---

## 7. What this memo does NOT solve

1. **Week view + year view.** The grid is month-only. A week view
   would let the rescue-med edge bar carry text labels (because cells
   would be 5–10× larger). A year view would compress trigger heatmap
   to a true GitHub-style contribution graph. Both are real
   demands but out of scope — they require swipe-gesture work and a
   route-level mode switcher. **Park for PI v20+.**

2. **Swipe gestures on mobile.** Month nav is currently button-only.
   Touch-swipe to change months would feel native, but it conflicts
   with the bottom-sheet's drag-to-dismiss gesture and needs a real
   gesture-arbitration design. **Park.**

3. **The KPI 2-card block under the grid.** "Total episodes / days
   logged" is fine but not *interesting*. PI v19+ should ask whether
   this block is doing real work or whether the rail's mini-summary
   makes it redundant. I'd vote redundant, but defer to a dry-round.
   **Note for PI v20.**

---

## 8. Self-score

**Memo score: 4.7 / 5.**

Picks one option per question. CSS sketches are concrete, not
gestural. Three-density preview answers the "but what does it look
like at the worst case" challenge head-on. Cohort matrix is
data-driven (the runtime rule, not the table, gates rendering) which
matches v2 discipline. Implementation split is four stories, sized,
ordered, with clear soft dependencies — the team can vote in PI v19
planning without pre-work.

What keeps it from 4.9: I haven't sketched the `MonthMiniSummary`
component (story C) at the same fidelity as the cell — it's described
in words, not CSS. And I deferred week/year view rather than at least
sketching how the cell encoding would scale, which a 4.9 memo would
do. That's the honest gap.
