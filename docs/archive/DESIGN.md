# ciphra* Design System

> "Confident. Warm. Precise. A private annotation on your health."

This document is the single source of truth for every visual and interaction decision in ciphra. If something isn't defined here, it doesn't exist in the product. Every component, every page, every animation references this spec.

---

## 1. Brand DNA

### What ciphra is
An encrypted health companion for chronic conditions. Zero-knowledge — the server stores only opaque blobs. 16 conditions, 4 languages, free, no email required.

### What ciphra is NOT
- Not a clinical tool (patients are tired of those)
- Not a wellness app (no gamification, no streaks-as-motivation)
- Not a startup product (no gradients, no "AI-powered", no confetti)
- Not a mailing list. **No email field exists on the user model and none should be added speculatively.** If a concrete feature requires it (family invites, security alerts, recovery backup), revisit deliberately — the bar is a real user problem, not a "nice to have." See `memory/project_backlog_decisions.md` for the full rationale and the checklist for how to do it right if the answer ever flips to yes.

### The feeling
Like writing in a good notebook with a reliable pen. Private but shareable. Warm but precise. You open it, record what matters, close it. The doctor gets a clear picture.

### The asterisk *
The soul of the brand. Three meanings:
- **Password masking** — your data is `*******`
- **Wildcard** — covers every condition, not just one
- **Footnote** — there's more here than meets the eye

The mark is rotated 8° clockwise. One arm is fractionally longer. The diagonals are slightly unequal. It reads as designed, not typed.

---

## 2. Color System

### Roles (not just colors)

Every color has a *job*. No color appears without a reason.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Action** | Brick | `#b23c2c` | CTA buttons, links, FAB. **Nothing else.** |
| **Action hover** | Brick dark | `#9a3326` | Hover/pressed state for brick |
| **Data** | Ochre | `#9f630b` | Numbers, metrics, chart bars, report icons, streak counts. "Information is ochre." |
| **Status** | Olive | `#7f821b` | Logged checkmarks, condition badges, medication counts, filter tabs active, "you did this." |
| **Severity** | Red | `#DC2626` | Episodes, errors, delete actions, danger states |
| **Success** | Emerald | `#059669` | Save confirmations, success toasts |

### Surfaces

| Surface | Hex | Usage |
|---------|-----|-------|
| **Page** | `#faf8f6` | Body background. Warm paper, not white. |
| **Card** | `#ffffff` | Primary cards. White creates depth on the warm bg. |
| **Muted** | `#f3f0ed` | Input backgrounds, secondary surfaces, nested elements |
| **Inset** | `#ede8e3` | Deeper nesting, progress bar backgrounds, table headers |

### Text

| Level | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#2c2520` | Headings, important content. Warm near-black. |
| **Secondary** | `#64594e` | Body text, descriptions. Warm medium. |
| **Muted** | `#97918a` | Captions, labels, timestamps. Warm light. |

### Borders

| Level | Hex | Usage |
|-------|-----|-------|
| **Default** | `#e8e3dd` | Card borders, dividers. Warm, never cold gray. |
| **Subtle** | `#f0ece7` | Very light separators, nested borders |

### Tinted backgrounds (for emphasis cards)

| Tint | Background | Border | Text | Usage |
|------|-----------|--------|------|-------|
| **Brand** | `#f5e8e6` | `rgba(178,60,44,0.15)` | `#b23c2c` | CTA cards, important alerts |
| **Ochre** | `#fdf3e5` | `rgba(159,99,11,0.15)` | `#9f630b` | Data highlights, report cards |
| **Olive** | `#f4f4e3` | `rgba(127,130,27,0.15)` | `#7f821b` | Status cards, "logged" confirmations |

### Anti-patterns
- ❌ Never use brick as a background fill (except tinted cards)
- ❌ Never use pure black (`#000000`) — always warm near-black
- ❌ Never use Tailwind's slate-800/900/950 — too cold
- ❌ Never use blue, cyan, teal, indigo — not in the palette
- ❌ Never use ochre for buttons — it's for data display only
- ❌ Never use olive for links — it's for status display only

---

## 3. Typography

### Font stack
```
Inter, 'DM Sans', system-ui, -apple-system, sans-serif
```

### Scale

| Level | Size | Weight | Tracking | Usage |
|-------|------|--------|----------|-------|
| **Display** | 28-32px | 700 | -0.02em | Landing page hero |
| **H1** | 24px | 700 | 0 | Page titles |
| **H2** | 18px | 600 | 0 | Section headers |
| **H3** | 14px | 600 | 0 | Card headers, sub-sections |
| **Body** | 14-16px | 400 | 0 | Default text |
| **Label** | 12px | 500 | 0.04em uppercase | Section labels, category headers |
| **Caption** | 12px | 400 | 0 | Timestamps, helper text |
| **Data** | varies | 700 | 0 | Numbers, metrics (always ochre) |

### Rules
- Body text minimum 16px on mobile (prevents iOS auto-zoom)
- Line height 1.5 for body, 1.3 for headings
- Numbers use `font-variant-numeric: tabular-nums` for alignment
- Data numbers are always ochre, never the body text color

---

## 4. Spacing

### Base unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps (icon + text) |
| `sm` | 8px | Chip gaps, badge padding |
| `md` | 12px | Input padding, small card padding |
| `lg` | 16px | Card padding (mobile) |
| `xl` | 20px | Card padding (desktop), section gaps |
| `2xl` | 24px | Page padding |
| `3xl` | 32px | Section vertical spacing |
| `4xl` | 48px | Major section breaks |

### Page structure
- Max content width: `max-w-3xl` (768px) for authenticated pages
- Max content width: `max-w-5xl` (1024px) for public/landing pages
- Horizontal padding: 16px mobile, 24px desktop
- Bottom padding: accounts for nav bar height + safe area

---

## 5. Components

### Card

The primary container. White on warm background.

**Variants:**
- `default` — white, warm border, 12px radius
- `interactive` — adds hover lift (translateY -1px, subtle shadow)
- `brand` — brick-tinted background for CTAs
- `ochre` — ochre-tinted for data emphasis
- `olive` — olive-tinted for status/completion

**Rules:**
- Cards never have heavy shadows — ciphra is flat-warm, not Material
- Border radius is always 12px
- Padding: 16px mobile, 20px desktop
- Cards stack vertically with 16px gaps

### Badge

Small status indicators.

**Variants:** `ochre` (data), `olive` (status), `brand` (action/count), `danger` (severity)

**Rules:**
- Always rounded-full
- Font size 12px, weight 500
- Horizontal padding 10px, vertical 4px
- Never more than 3 badges in a row

### Button

**Variants:**
- `primary` — brick background, white text. For main actions only.
- `secondary` — muted background, secondary text. For cancel, back, alternative actions.
- `ghost` — no background, brand text. For tertiary/inline actions.
- `danger` — red background, white text. For destructive actions.

**Rules:**
- Minimum touch target: 44x44px
- Active state: scale(0.97) for 150ms
- Disabled: 50% opacity
- Never more than one primary button visible at a time

### ChipGroup (Symptom/Trigger toggles)

The core daily interaction. Must feel tactile and satisfying.

**States:**
- `inactive` — muted background, secondary text
- `active` — olive tinted background, olive text, subtle ring (for symptoms — "I had this today")
- `active-trigger` — ochre tinted (for triggers — "this caused it")

**Rules:**
- Min height 36px, generous horizontal padding (12-16px)
- Wrap with 8px gap
- Group label above each group (Label style, uppercase)
- Toggle on tap — no confirmation needed

### Counter

Episode type counter (+/- buttons with number).

**Rules:**
- Number display uses `num-data` (ochre, bold, tabular-nums)
- +/- buttons are 44x44px touch targets
- The episode type color dot appears before the label
- Zero state shows "0" in muted color, not hidden

### EntryCard

A single logged entry (daily log, episode, event).

**Structure:**
- Left border: 3px, color-coded (olive for logs, red for episodes, ochre for events)
- Type label (bold, primary text)
- Optional: episode type, note preview (1-2 lines)
- Edit/delete actions on the right

### BottomSheet

Slides up from bottom. Used for: quick-add, calendar day detail, confirmations.

**Rules:**
- Handle bar at top (40x4px, rounded, border color)
- Max height 80vh
- Backdrop: black/40 with backdrop-blur
- Entry animation: fly from bottom, 300ms
- Exit: 200ms (faster than enter)
- Must have a clear dismiss action (backdrop tap or explicit close)

### EmptyState

When there's no data to show.

**Structure:**
- Large faded asterisk (size 64, muted)
- Message text (secondary color)
- Optional CTA button
- Vertically centered in available space

### SectionDivider

Visual break between sections.

**Structure:**
- Thin line — asterisk mark — thin line
- The asterisk is 14px, muted color
- Lines extend to fill available width
- Vertical padding: 16px

### StatCard

A metric display (used in streak, reports, admin).

**Structure:**
- Large number (font-size 28-32px, ochre for data, red for severity)
- Label below (caption style)
- Compact: number and label side by side

### Skeleton

Loading placeholder.

**Rules:**
- Warm shimmer gradient (muted → inset → muted)
- Same dimensions as the content it replaces
- Staggered animation delay (50ms per item)
- Border radius matches the component it replaces

---

## 6. The Asterisk System

The asterisk appears throughout the app with different meanings:

| Context | Size | Color | Animation | Meaning |
|---------|------|-------|-----------|---------|
| **Header logo** | 14px | Brand (brick) | None | Brand identity |
| **Loading** | 24-48px | Muted | Continuous rotation | "Working..." |
| **Empty state** | 64px | Muted (15% opacity) | None | "Nothing here yet" |
| **Section divider** | 14px | Muted | None | Visual break |
| **Save confirmation** | 28px | Olive | Scale pulse (1→1.1→1) | "Saved!" |
| **Error** | 28px | Red | Shake (x ±3px) | "Something went wrong" |
| **Encryption badge** | 14px | Muted | None | "Your data is encrypted" |
| **Watermark** | 120px | 3% opacity | None | Background texture |

---

## 7. Interaction Patterns

### Animations

| Type | Duration | Easing | Notes |
|------|----------|--------|-------|
| Micro-interaction (hover, press) | 150ms | ease-out | |
| State change (toggle, expand) | 200ms | ease-out | |
| Entry (sheet, modal) | 300ms | ease-out | |
| Exit (sheet, modal) | 200ms | ease-in | Faster than entry |
| Stagger (list items) | 300ms + 50ms/item | ease-out | Max 10 items staggered |
| Page transition | 200ms | ease-out | Fade + subtle translateY |

### Touch

- Minimum touch target: 44x44px
- Minimum gap between targets: 8px
- Active/pressed feedback: scale(0.97) or opacity change within 100ms
- Swipe: reserved for system gestures only (no custom swipe actions)

### Forms

- Labels always visible (never placeholder-only)
- Validation on blur, not keystroke
- Error messages below the field, in red with icon
- Success feedback: olive checkmark or brief toast
- Auto-save for long forms (daily log)

---

## 8. Page Specifications

### Daily Log (`/log/[date]`)

**Concept:** Card-per-section, vertically scrollable. Each section is a self-contained card. The page feels like flipping through a short questionnaire, not filling a form.

**Sections (each is a card):**
1. **Date header** — prev/next arrows, "Today" badge (olive)
2. **Symptoms** — ChipGroup per symptom group. Group label (Label style). Chips toggle olive on tap.
3. **Episodes** — Counter per episode type. Number is ochre. Episode color dot.
4. **Triggers** — ChipGroup, single group. Chips toggle ochre on tap.
5. **Vitals** — Input per vital. Label + unit above. Ochre labels.
6. **Medications** — ChipGroup. Toggle olive (taken/not taken).
7. **Notes** — Single textarea.
8. **Save bar** — Sticky bottom. Primary button. Delete (danger, icon only) if editing.

**Distinctive elements:**
- Each section card has a subtle left-border accent:
  - Symptoms: olive
  - Episodes: red
  - Triggers: ochre  
  - Vitals: ochre
  - Medications: olive
  - Notes: warm gray
- Section headers use the Label typography (12px, 500, uppercase, tracking)
- Save bar uses frosted glass effect (backdrop-blur on warm bg)

### Today / Companion (`/`)

**Concept:** Your daily dashboard. Calm, informative, actionable. Not a metrics dashboard — more like opening your notebook to today's page.

**Sections:**
1. **Greeting** — "Hello {name}" + date + condition badge (olive)
2. **Today status** — Either "not logged yet" (brand-tinted CTA card with asterisk) or "logged" (olive-tinted summary with badges)
3. **Streak** — Number (ochre, large) + label + progress bar (ochre)
4. **Reports link** — Ochre-tinted interactive card → /reports
5. **7-day episodes** — Chart card (episode colors)
6. **Top symptoms** — Chart card (ochre bars)
7. **Today's entries** — EntryCard list with stagger animation
8. **Footer** — Asterisk divider + encryption badge

### Journal (`/journal`)

**Concept:** A reverse-chronological timeline. Date headers break the flow. Each entry is an EntryCard.

**Structure:**
- Search bar at top (input component)
- Filter chips (olive active state for selected filter)
- Date headers (Label style, sticky)
- EntryCard per entry, grouped by date
- Empty state with large asterisk

### Calendar (`/calendar`)

**Concept:** Monthly grid. Days have dots (olive for logs, red for episodes). Tapping a day opens a BottomSheet.

**Day cell states:**
- Empty: plain number
- Has log: olive dot below number
- Has episode: red dot below number
- Today: olive text + subtle olive background
- Selected: olive ring

### Landing Page (`/`)

**Concept:** Scroll-driven story. Not a feature list — a narrative. "Here's your problem. Here's how ciphra solves it. Here's the proof it's secure. Start for free."

**Sections:**
1. **Hero** — Large ciphra* wordmark + tagline + CTA
2. **The problem** — "Your doctor needs data. You don't want to keep a spreadsheet."
3. **How it works** — 3 numbered steps (setup once, log daily, PDF for doctor)
4. **Conditions** — Grid of 16 conditions linking to /conditions/[id]
5. **Security** — Key hierarchy, server-sees/can't-see, open source
6. **CTA** — Final "Start for free" with encryption badges
7. **Footer** — Links, language selector

### Login (`/login`)

**Concept:** Clean, centered, warm. The asterisk wordmark above the form. Recovery code screen has gravitas — "this is the only key to your data."

### Setup Wizard (`/setup`)

**Concept:** Step-per-screen. Progress bar (ochre fill). Each step is focused — pick template, customize symptoms, etc. Template cards link to /conditions/[id] for "learn more."

### Conditions (`/conditions/[id]`)

**Concept:** Public SEO page. Clinical credibility + privacy promise. Each condition explains what's tracked and why, with PubMed links. Strong CTA at bottom.

### Reports (`/reports`)

**Concept:** The "show your doctor" page. Month picker, summary stats (ochre numbers), PDF export buttons, monthly grid table. Clean, clinical, data-forward.

### Settings (`/settings`)

**Concept:** Utility page. No drama. Language, profile, password, account. Boring-good.

### Admin (`/admin`)

**Concept:** Operator dashboard. Stats cards (ochre numbers), user table (sortable), audit log (color-coded actions). "Metadata only — content is encrypted" reminder.

---

## 9. Responsive Behavior

### Breakpoints
- **Mobile:** 0-639px (primary design target)
- **Tablet:** 640-1023px
- **Desktop:** 1024px+

### Navigation
- **Mobile:** Bottom tab bar (4 tabs), FAB above nav
- **Desktop:** Consider top/side nav (future)

### Content width
- Authenticated pages: `max-w-3xl` (768px)
- Public pages: `max-w-5xl` (1024px)
- Admin: `max-w-6xl` (1152px)

### Adaptations
- Cards: full-width on mobile, may grid on desktop
- Charts: full-width always
- Tables: horizontal scroll on mobile
- Bottom sheets: full-width on mobile, centered modal on desktop (future)

---

## 10. Accessibility

### Non-negotiable
- Color contrast 4.5:1 minimum for all text
- Touch targets 44x44px minimum
- Visible focus rings (3px, brand color, offset 2px)
- Skip-to-content link
- All images/icons have aria-labels
- Form fields have visible labels (never placeholder-only)
- Error messages include recovery path
- `prefers-reduced-motion` respected (all animations disabled)

### Color not the only indicator
- Logged status: olive dot AND text label
- Episode severity: red color AND count number
- Errors: red color AND icon AND text message
- Active filter: color change AND visual weight change

---

## 11. Implementation Notes

### Component file structure
```
src/lib/components/
├── Asterisk.svelte        — Brand mark (done)
├── Card.svelte            — All card variants
├── Badge.svelte           — Status badges
├── Button.svelte          — Action buttons
├── Input.svelte           — Form inputs
├── ChipGroup.svelte       — Toggle chip groups
├── Counter.svelte         — +/- counter
├── SectionDivider.svelte  — Asterisk divider
├── EmptyState.svelte      — Empty state with asterisk
├── StatCard.svelte        — Metric display
├── EntryCard.svelte       — Journal/today entries
├── BottomSheet.svelte     — Slide-up sheet
├── Skeleton.svelte        — Loading placeholder
└── ChartWrapper.svelte    — Chart.js wrapper (exists)
```

### CSS architecture
- Design tokens in `app.css` as CSS custom properties
- Component-level styles use the tokens
- Tailwind utilities for layout only (flex, grid, spacing, responsive)
- No raw hex colors in component files — always reference tokens or component classes

### Implementation order
1. Component library (this session or next)
2. Daily Log — sets the interaction pattern
3. Today (Companion) — daily dashboard
4. Journal — entry list
5. Calendar — grid + bottom sheet
6. Login — first impression
7. Setup — onboarding
8. Landing — public face
9. Conditions — SEO pages
10. Reports — data display
11. Settings — utility
12. Admin — operator dashboard

---

## 12. QA Validation

This design system was validated through 3 rounds of QA with 13 unique personas:
- 5 patient personas (ADHD, migraine, epilepsy, quadriplegic, diabetes)
- 5 contextual personas (burnout skeptic, privacy engineer, parent, nurse, psychiatrist)
- 3 professional reviewers (UX designer, DPO, pharmacist)

**Final UX score: 8/10** (UX Designer Clara: "Solid beta. Ship it.")

Key findings that shaped the system:
- Chip min-height 44px and 12px gap (accessibility, Youssef)
- Auto-save with 3s debounce (retention, Lena)
- Section headers 16px not 12px (readability, Herta)
- Olive for symptom active state, ochre for trigger active state (semantic clarity, all)
- Checkmarks on active chips (visibility, Herta)
- Copy from yesterday (efficiency, Youssef/Marco)
- Focus-visible rings on all interactive elements (keyboard nav, Clara)

## 13. Compliance Notes

The DPO review identified items that affect the DESIGN but not the visual system:
- Medical disclaimer must be visible on all condition pages
- Privacy policy page must exist at /privacy
- "Zero-knowledge" claim must be qualified if server-side key generation is not yet moved to client

These are governance items tracked in the compliance findings document.
