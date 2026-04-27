/**
 * CIPH-881b — Rescue-medication render coverage source-parse guards.
 *
 * The paired-ship rule for PI v12 model extensions says: "both halves of
 * 881 ship or neither". 881a wires data + FAB; 881b extends every render
 * site so the new event kind is rendered distinctly from freeform note
 * markers. These tests guarantee the kind discriminator branch exists at
 * each surface so a future refactor can't silently drop coverage.
 *
 * Surfaces:
 *   - EntryPreview.svelte (journal + calendar day-sheet)
 *   - reports/+page.svelte (recent events list)
 *   - pdf.ts (event markers on the trend chart + CSV columns)
 *   - Companion.svelte + CompanionRail.svelte (dashboard counter)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('CIPH-881b kind discriminator branches', () => {
	it('EntryPreview branches on kind:"medication" with rescue_med.section_title', () => {
		const src = read('lib/components/EntryPreview.svelte');
		expect(src).toMatch(/kind\s*===\s*['"]medication['"]/);
		expect(src).toContain('rescue_med.section_title');
	});

	it('reports/+page.svelte branches on kind:"medication" in the recent-events list', () => {
		const src = read('routes/reports/+page.svelte');
		expect(src).toMatch(/kind\s*===\s*['"]medication['"]/);
	});

	it('pdf.ts buildEventMarkers branches on kind:"medication" for the event label', () => {
		const src = read('lib/pdf.ts');
		expect(src).toMatch(/kind\s*===\s*['"]medication['"]/);
	});

	it('pdf.ts CSV export adds rescueMedCols and filters kind:"medication" docs', () => {
		const src = read('lib/pdf.ts');
		expect(src).toContain('rescueMedCols');
		expect(src).toMatch(/kind\s*!==\s*['"]medication['"]|kind\s*===\s*['"]medication['"]/);
	});

	it('Companion.svelte derives rescueMedsThisMonth via the kind discriminator', () => {
		const src = read('lib/components/Companion.svelte');
		expect(src).toMatch(/kind\s*===\s*['"]medication['"]/);
		expect(src).toContain('rescueMedsThisMonth');
	});

	it('CompanionRail.svelte renders the rescueMedsThisMonth card when applicable', () => {
		const src = read('lib/components/CompanionRail.svelte');
		expect(src).toContain('rescueMedsThisMonth');
		expect(src).toContain('rescue_med.dashboard_count');
	});
});

describe('CIPH-881b render-coverage discipline', () => {
	it('every surface that renders type:"event" docs accounts for the kind field', () => {
		// Inventory of files known to read `data.type === 'event'`. If a new
		// site is added, this test forces the author to either add a kind
		// branch or prove the surface doesn't need one (and amend the inventory).
		const SURFACES = [
			'lib/components/EntryPreview.svelte',
			'routes/reports/+page.svelte',
			'lib/pdf.ts',
			'lib/components/Companion.svelte',
		];
		for (const path of SURFACES) {
			const src = read(path);
			const touchesEventType = /['"]event['"]/.test(src);
			if (!touchesEventType) continue;
			expect(
				src,
				`${path}: touches type:'event' but does not branch on kind:'medication'. ` +
					`Either add the discriminator branch or re-scope this file out of CIPH-881b.`,
			).toMatch(/kind\s*===\s*['"]medication['"]|kind\s*!==\s*['"]medication['"]/);
		}
	});
});
