# PDF Design Spec

> **SUPERSEDED 2026-05-21** by `CLINICAL_HANDOFF.md` after the 5-round
> "design from scratch" campfire + tribunal. The new spec replaces
> both this file and `PDF_TEMPLATE.md`. This file is kept only as
> historical reference for the current `pdf.ts` implementation while
> the rewrite is in progress. Do not extend this spec; extend
> `CLINICAL_HANDOFF.md` instead.

This appendix is binding for ciphra PDF output. Read alongside
`PDF_TEMPLATE.md` (the section + predicate contract) and
`memory/feedback_pdf_clinician_lens.md` (the user-facing framing
guarantees).

Provenance: this spec was forged through a 5-persona / 5-round
campfire (typography / information / print / brand / end-user
voices) and adjudicated by a tribunal that ruled on 3 splits and
8 open targets. The campfire transcript + tribunal rulings live in
the session log; the spec below is the binding output.

---

ciphra PDFs organize patient-entered diary data for a reader.
They are not medical reports.
They are not diagnostic summaries.
They must not imply clinical inference, risk scoring, treatment advice, or medical analysis.

The expected audience is clinician, family, or self.
The PDF must work on screen, in print, and after photocopying.
Swiss restraint is part of trust.
The design should be quiet, structured, legible, and durable.

## 1. Positioning Rules

1. Use the product name as `ciphra`.
2. Do not use clinical-analysis language.
3. Do not present patient-entered values as findings.
4. Do not rank symptoms by medical importance.
5. Do not imply diagnosis, triage, worsening, improvement, or treatment response.
6. Prefer neutral labels such as `entered`, `recorded`, `reported`, and `noted`.
7. Avoid labels such as `abnormal`, `critical`, `risk`, `score`, `alert`, `trend diagnosis`, or `clinical significance`.
8. The PDF may summarize, group, count, and display entries.
9. The PDF must make source and date range visible.
10. Every page must preserve enough context to be read independently.

## 2. Brand And Print

ciphra may use restrained brand color.
Color is never the only carrier of meaning.
Every semantic distinction must survive grayscale printing.

Use brand color as accent, not decoration.
Acceptable uses are rules, small labels, section dividers, and direct chart accents.
Avoid large filled brand surfaces.
Avoid sparkle, gradients, shadows, glossy treatment, and decorative color fields.

The default design is print-first.
If color and print survival conflict, print survival wins.
A black-and-white photocopy must still communicate structure, grouping, and chart identity.

## 3. Page 1 Structure

Page 1 must support a 60-second read.

The enforced eye-path is:

1. ciphra title, export date, and diary date range.
2. Rule-backed disclaimer notice.
3. Equal compact summary tiles.
4. Main diary sections in stable order.
5. Footer provenance and page number.

Cut anything that interrupts this path.
Do not place marketing copy on page 1.
Do not use a hero area.
Do not use large decorative branding.
Do not duplicate legends when direct labels already explain the data.
Do not add interpretation text.

## 4. Disclaimer Notice

The page 1 disclaimer is a rule-backed notice.
It is not a filled banner.

Use:
- white background
- 3pt olive left rule
- optional top hairline rule
- no full olive fill
- no warning icon unless required by existing product language
- body-size text
- compact vertical padding

The notice must say, in substance, that the PDF contains patient-entered diary information and is not medical analysis.
The notice must not sound alarming.
The notice must not resemble an alert.

## 5. Typography

Use one PDF type family consistently.
Use tabular numerals where values align.

Type scale:

- Compact labels: 7pt size, 9pt leading, medium weight.
- Table text: 8pt size, 10pt leading, regular weight.
- Body text: 9pt size, 12pt leading, regular weight.
- Section heads: 11pt size, 14pt leading, semibold weight.
- Summary numerics: 14pt size, 16pt leading, semibold weight, tabular numerals.
- Footnotes and provenance: 7pt size, 9pt leading, regular weight.
- Continuation labels: 7pt size, 9pt leading, medium weight.

Do not use oversized hero numerics.
Do not use display typography inside compact panels.
Do not use negative letter spacing.
Use uppercase only for short compact labels.

## 6. Summary Tiles

KPI or summary tiles are equal compact tiles.
All tiles in a group use the same width, height, padding, type scale, and visual weight.

A tile may show:
- label
- value
- unit or short qualifier
- date range qualifier when needed

A tile must not imply priority.
Do not enlarge one tile because its value appears important.
Do not color a tile as success, warning, or danger.
Do not use filled badges for interpretation.

## 7. Trajectory Label

The trajectory indicator is a neutral inline label.
It is not a badge.

Use:
- white fill
- hairline border
- 7pt label text
- neutral text
- no success or warning color
- no pill with strong fill

Acceptable language describes display mechanics only.
Do not use trajectory wording that implies clinical meaning.

## 8. Component Breaks

Components may split only at declared boundaries.

Minimum presence rules:
- A section head must keep with at least 24mm of following content.
- A chart title must keep with legend and at least 35mm of chart body.
- A summary tile row must not split.
- A table header must keep with at least three body rows.
- A monthly grid header must keep with at least one full week row.
- A note block must keep with its label and first two lines.

Orphan prevention:
- No section head may appear alone at the bottom of a page.
- No chart title may appear without chart marks.
- No continuation page may begin without repeated context.
- No table may end with a single orphan row after a page break.

Table behavior:
- Repeat table headers after page breaks.
- Add `continued` to repeated headers.
- Do not split a row across pages.
- Preserve column widths across continuations.
- Repeat units when the continuation could be read alone.

## 9. Palette

The palette must work in color and grayscale.

Semantic encodings:

- ciphra olive: brand accent and notice rule.
- Cohort accent: primary comparison or selected diary grouping.
- Break tone: structural dividers and neutral reference lines.
- Ochre: event or annotation accent only.

Grayscale survival rules:
- Olive uses medium-dark tone and solid rule.
- Cohort accent uses 1.25pt solid line and circle marker.
- Break tone uses 0.75pt neutral gray line and no marker.
- Ochre uses 1pt dashed line and diamond marker.
- Secondary comparison uses 1pt dotted line and square marker.

Never rely on hue alone.
Every chart series must have either direct label text or a distinct marker and stroke pattern.
Every event mark must have a shape or line pattern that remains visible in black and white.

## 10. Charts

Charts must be quiet and directly readable.

Use direct labels where space allows.
Avoid legends when direct labels are practical.
Keep axes minimal.
Use only necessary ticks.
Use thin grid lines.
Do not frame charts in decorative boxes.
Do not use gradient fills.

Stroke rules:
- Primary data line: 1.25pt.
- Secondary data line: 1pt.
- Reference line: 0.75pt.
- Grid line: 0.35pt.
- Axis line: 0.5pt.

Marker rules:
- Primary series: circle.
- Secondary series: square.
- Event marker: diamond.
- Missing or unavailable entry: hollow marker.
- Patient note event: short vertical tick with label.

Diverging bars require a zero line.
The zero line must be visible in grayscale.
Positive and negative sides must not depend on red/green meaning.
Use direct labels and alignment to explain direction.

Charts must not include clinical judgement labels.
Use neutral labels such as `entries`, `reported value`, `days with entries`, and `notes`.

## 11. Monthly Grid

The monthly grid is a matrix.

Columns represent days or weeks.
Rows represent diary dimensions or entry categories.
The month label is the strongest hierarchy.
Week labels are secondary.
Day labels are compact.

Use row rules for scanning.
Use light column rules.
Avoid heavy cell fills.
Use marks instead of color blocks where possible.

Mark system:
- filled dot: entry exists
- hollow dot: partial or unavailable entry
- short dash: no entry recorded where showing absence is required
- diamond: event or note
- small count: multiple entries

The grid must survive grayscale.
Do not encode categories by color alone.
Use row labels, mark shapes, and repeated headers.

Continuation behavior:
- Repeat month and column headers on continuation pages.
- Label continuation as `Month name continued`.
- Preserve row order across pages.
- Do not split a week row from its header.
- Keep page numbering visible.

## 12. Tables

Tables are for exact reading.
Charts are for shape and comparison.
Do not force exact values into chart labels when a table is more appropriate.

Table rules:
- Use 8pt text and 10pt leading.
- Use tabular numerals for dates, times, and values.
- Align numbers by decimal or unit.
- Keep text left aligned.
- Use minimal horizontal rules.
- Avoid vertical rules unless the table is dense.
- Repeat units in headers.
- Repeat headers on continuation pages.

## 13. Spacing And Density

The PDF should be compact but not crowded.
Whitespace should separate reading groups, not decorate the page.

Use consistent spacing between:
- page header and first content
- section head and body
- table and following section
- chart title and plot area
- footer and content

Do not use card stacks as page decoration.
Use cards only for repeated compact summary tiles or genuinely framed tools.
Do not nest cards inside cards.

## 14. Icons And Symbols

Icons are optional and should be rare.
Use icons only when they improve scanning without adding interpretation.

Do not use medical alert iconography.
Do not use warning triangles for ordinary diary data.
Do not use checkmarks to imply success.
Do not use red/green status symbols.

Symbols used in charts or grids must be explained by direct label, header, or legend.

## 15. Language And Locale

Use Swiss-safe German when German text appears.
Do not use `ß`; use `ss`.

Keep PDF language plain.
Prefer short labels.
Avoid clinical inference wording.
Avoid motivational language.
Avoid product marketing language.

Dates, times, and units must be clear for the export locale.
The date range must appear on page 1.
Export provenance must appear in the footer or final page metadata section.

## 16. Footer And Provenance

Each page must show:
- page number
- export date or generated timestamp
- diary date range or enough continuation context
- ciphra identity in restrained form

The footer must not compete with content.
Use 7pt text and quiet tone.

## 17. Accessibility And Robustness

Text must remain legible after printing.
Thin marks must not disappear.
Color contrast must be adequate in grayscale.
Tables and charts must remain understandable without color.

Avoid tiny color-only legends.
Avoid dense labels that collide.
Avoid rotated text unless space leaves no better option.
Direct labels must not overlap marks.

## 18. Implementation Checklist

PDF code must define shared tokens for:
- type scale
- line weights
- palette
- chart markers
- spacing
- break rules
- continuation labels
- disclaimer notice styling

Components must not invent local styles that contradict this spec.
New PDF components must declare:
- page-break behavior
- grayscale survival behavior
- semantic language used
- continuation behavior if the component can split

## What this spec does NOT cover

This spec does not define medical logic.
It does not define symptom models.
It does not define risk scoring.
It does not define diagnosis, triage, or treatment guidance.
It does not decide which diary fields exist.
It does not replace product copy review.
It does not replace legal or regulatory review.
It governs PDF presentation, hierarchy, print behavior, and MDR-positioning-safe design language only.

---

## Open implementation deltas (created by this spec)

The spec defines target states; the current pdf.ts diverges from
several. These become P-PDF backlog items:

1. **Disclaimer banner → rule-backed notice** (Section 4). Today the
   disclaimer renders as an olive-tinted filled banner; the spec
   mandates white field + 3pt olive left rule.
2. **Trajectory pill → trajectory label** (Section 7). Today the pill
   uses a filled background (light olive for stable, light brick for
   worsening, etc.); the spec mandates white fill + hairline border +
   no semantic color.
3. **Type scale codification** (Section 5). Today pdf.ts uses scattered
   `doc.setFontSize(7.5)`, `8`, `9`, `10`, `12` calls inline. Move to
   shared constants matching the spec scale.
4. **Marker-shape redundancy in charts** (Section 9, 10). Today series
   are distinguished only by color. Add shape (circle / square /
   diamond) to every multi-series chart.
5. **Continuation labels on multi-page tables** (Section 8, 12). Today
   autoTable repeats headers but does not append `continued` text.
6. **Component break contracts** (Section 8). Today pdf.ts uses ad-hoc
   `if cursorY > pageH - X { addPage }` checks; the spec mandates
   declared minimum-presence values per component type.

Each of these is implementable in isolation. Track as P-PDF-DSPEC-1
through P-PDF-DSPEC-6 if the user prioritizes.
