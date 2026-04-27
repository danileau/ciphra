/**
 * CIPH-882b — Custom-item render coverage source-parse guards.
 *
 * Mirror of `rescueMedications-render.test.ts`. Every render site that
 * translates a blueprint item id into a label must branch on
 * `isCustomItem(id)`. One missed site = a raw `custom_*` id rendered in
 * a chip, calendar tooltip, or PDF.
 *
 * The inventory below MUST stay in sync with `lib/labels-audit.md`. The
 * `labels-audit-doc.test.ts` companion guards the doc itself; this file
 * guards the source.
 *
 * Adding a new render surface:
 *   1. Add the file to `lib/labels-audit.md`.
 *   2. Add the discriminator branch in the source.
 *   3. Add the path to `RENDER_SITES` below.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Sites that translate id → label and use the inline branch:
 *  `isCustomItem(item.id) ? item.label : $t(item.label)` */
const RENDER_SITES: ReadonlyArray<{ path: string; reason: string }> = [
	{ path: 'lib/components/EntryPreview.svelte', reason: 'symptom/trigger/episode/vital labels' },
	{ path: 'lib/components/EntryComposer.svelte', reason: 'symptom chips, trigger chips, episode counters, vital labels' },
	{ path: 'lib/components/Companion.svelte', reason: 'top-symptoms label map + episode chart series' },
	{ path: 'lib/components/PhaseContextCard.svelte', reason: 'phase/episode label' },
	{ path: 'routes/calendar/+page.svelte', reason: 'multiDay band tooltips + selected-day pills + legend' },
	{ path: 'routes/+layout.svelte', reason: 'FAB episode chip' },
	{ path: 'routes/reports/+page.svelte', reason: 'itemLabel() + year-most-frequent symptom' },
	{ path: 'routes/setup/+page.svelte', reason: 'step-2 symptom-item preview, step-3 trigger + vital previews' },
];

/** pdf.ts uses the centralized `labelOf` / `vitalLabelOf` helpers
 *  rather than inline branches. */
const PDF_HELPER_SITE = 'lib/pdf.ts';

describe('CIPH-882b custom-item discriminator branches', () => {
	for (const site of RENDER_SITES) {
		it(`${site.path} branches on isCustomItem (${site.reason})`, () => {
			const src = read(site.path);
			expect(src, `Expected isCustomItem( in ${site.path}`).toMatch(/isCustomItem\(/);
		});
	}

	it(`${PDF_HELPER_SITE} centralizes the branch in labelOf / vitalLabelOf helpers`, () => {
		const src = read(PDF_HELPER_SITE);
		expect(src).toContain('function labelOf');
		expect(src).toContain('function vitalLabelOf');
		expect(src).toMatch(/isCustomItem\(/);
	});

	it('applyBlueprintCustomizations chains resolveBlueprint so custom items reach the export pipeline', () => {
		const src = read(PDF_HELPER_SITE);
		// The chain happens inside applyBlueprintCustomizations. Source-
		// parse guard: `resolveBlueprint(blueprint)` appears inside the
		// function body before the hide-filter logic.
		expect(src).toMatch(/applyBlueprintCustomizations[\s\S]*?resolveBlueprint\(/);
	});
});

describe('CIPH-882b render-coverage discipline', () => {
	it('every site listed in labels-audit.md by file path is in RENDER_SITES or is the PDF helper site', () => {
		const audit = read('lib/labels-audit.md');
		const re = /^-\s+`([^`]+)`/gm;
		const auditPaths = new Set(
			Array.from(audit.matchAll(re), (m) => m[1].split(/[#:]/)[0].trim())
				.filter((p) => p.endsWith('.svelte') || p.endsWith('.ts')),
		);
		const known = new Set([...RENDER_SITES.map((s) => s.path), PDF_HELPER_SITE]);
		const missing: string[] = [];
		for (const p of auditPaths) {
			if (!known.has(p)) missing.push(p);
		}
		expect(
			missing,
			`Files in labels-audit.md without a render-coverage assertion:\n${missing.join('\n')}`,
		).toEqual([]);
	});
});
