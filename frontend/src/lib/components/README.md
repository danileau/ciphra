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
- **BottomNav.svelte** — mobile bottom tab bar (Heute /
  Journal / Kalender / Reports / Settings). Auth-aware via its
  own store subscription; renders nothing when signed out.

### Cards

- **EntryPreview.svelte** — 396 LOC, the canonical entry/event
  card. Used on dashboard, journal, calendar day-detail. Owns
  its own edit/delete affordances, symptom-chip rendering,
  condition-icon mapping, date chrome. This is the one card
  primitive for diary content.

### Forms

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
- **Toast.svelte** — top-of-viewport transient message. Used
  in `+layout.svelte` for sync indicator and in
  `conditions/*` for the preset-saved confirmation. Keyed
  re-render pattern documented at use sites.
- **ChartWrapper.svelte** — thin Chart.js wrapper with
  responsive sizing + reduced-motion handling. Used on
  dashboard (episode + symptom + how-are-you charts) and
  calendar (weekday distribution).
- **ConfirmDelete.svelte** (CIPH-834) — the red "Yes delete" +
  "Cancel" button pair shown next to a just-tapped delete icon
  on an entry card. Used on `routes/journal/+page.svelte` and
  `routes/calendar/+page.svelte`. Compact sibling variants
  (CompanionRail 40px pair, `/log/[date]` full-width banner)
  keep their inline markup and declare a
  `<!-- primitive-exempt: ConfirmDelete … -->` comment.
- **Modal.svelte** (CIPH-834) — centred dialog over a
  translucent backdrop. Esc + backdrop click close when
  `dismissable`. Used for the `/migrate` post-import tour.
  Settings + admin keep their bespoke danger-chrome dialogs
  inline with `<!-- primitive-exempt: Modal … -->` comments.
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
- **PhaseContextCard.svelte** (CIPH-854) — home-dashboard card
  shown only for the phase-band cohort (bipolar / MS / long-covid
  / IBD / IBS / chronic_pain / anxiety_depression / burnout) when
  a multiDay episode is ongoing. Renders "Day N of <phase>,
  started <date>". Used in `CompanionMain.svelte`.

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
