/**
 * CIPH-pi19-A — In-cell trigger triangle + rescue-med edge bar.
 *
 * Guards the per-day tally Maps, the data-driven render gates, the
 * counter-row triangle (slot 3), and the brand right-edge bar. Plus
 * the plural-aware aria-label suffix and the four new i18n keys per
 * locale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CAL = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-pi19-A per-day tally maps', () => {
	it('triggerCountByDay buckets entry-doc triggers (array + boolean-object)', () => {
		expect(CAL).toMatch(/triggerCountByDay\s*=\s*\(\(\)\s*=>/);
		// Counts both Array.isArray triggers AND object-shape booleans.
		expect(CAL).toMatch(/Array\.isArray\(trs\)/);
		expect(CAL).toMatch(/Object\.values\(trs as Record<string, boolean>\)/);
	});

	it('rescueMedCountByDay buckets event docs with kind === medication', () => {
		expect(CAL).toMatch(/rescueMedCountByDay\s*=\s*\(\(\)\s*=>/);
		expect(CAL).toMatch(/d\.data\.type\s*!==\s*'event'\s*\|\|\s*\(d\.data as Record<string, unknown>\)\.kind\s*!==\s*'medication'/);
	});

	it('both maps are reactive ($:) and consume monthDocs (memoized like docsByDay)', () => {
		expect(CAL).toMatch(/\$:\s*triggerCountByDay/);
		expect(CAL).toMatch(/\$:\s*rescueMedCountByDay/);
	});
});

describe('CIPH-pi19-A render gates are blueprint-driven', () => {
	it('showTriggerMark gates on bp.triggers length', () => {
		expect(CAL).toMatch(/\$:\s*showTriggerMark\s*=\s*\(bp\?\.triggers\?\.length\s*\?\?\s*0\)\s*>\s*0/);
	});

	it('showRescueMedMark gates on bp.rescueMedications length', () => {
		expect(CAL).toMatch(/\$:\s*showRescueMedMark\s*=\s*\(bp\?\.rescueMedications\?\.length\s*\?\?\s*0\)\s*>\s*0/);
	});

	it('cell template threads gates into hasTrigger / hasRescueMed @const', () => {
		expect(CAL).toMatch(/@const hasTrigger = showTriggerMark && dayHasTrigger\(day\)/);
		expect(CAL).toMatch(/@const hasRescueMed = showRescueMedMark && dayHasRescueMed\(day\)/);
	});
});

describe('CIPH-pi19-A counter-row triangle (slot 3)', () => {
	it('renders an ochre triangle when hasTrigger', () => {
		// Triangle uses CSS border trick: width 0, height 0,
		// border-bottom 6px solid var(--ochre).
		expect(CAL).toMatch(/\{#if hasTrigger\}[\s\S]{0,200}border-bottom:\s*6px solid var\(--ochre\)/);
	});

	it('triangle is aria-hidden (the cardinality lives in the parent label)', () => {
		expect(CAL).toMatch(/\{#if hasTrigger\}[\s\S]{0,200}aria-hidden="true"/);
	});

	it('triangle inherits the dot-row dim under phaseBandEmphasis', () => {
		// Triangle is a sibling of the existing dot spans inside the same
		// flex row that already carries the opacity binding.
		const row = CAL.match(/<div class="flex gap-0\.5 mt-0\.5 items-center"[\s\S]*?<\/div>/);
		expect(row, 'expected dot row markup').toBeTruthy();
		expect(row![0]).toMatch(/opacity:\s*\{phaseBandEmphasis/);
		expect(row![0]).toMatch(/\{#if hasTrigger\}/);
	});
});

describe('CIPH-pi19-A rescue-med right-edge bar', () => {
	it('renders a 3px brand bar absolutely-positioned on the right edge', () => {
		expect(CAL).toMatch(
			/\{#if hasRescueMed\}[\s\S]{0,400}width:\s*3px[\s\S]{0,80}background:\s*var\(--brand\)/,
		);
	});

	it('bar is aria-hidden + pointer-events:none (whole cell stays the hit zone)', () => {
		expect(CAL).toMatch(/\{#if hasRescueMed\}[\s\S]{0,400}aria-hidden="true"/);
		expect(CAL).toMatch(/\{#if hasRescueMed\}[\s\S]{0,400}pointer-events:\s*none/);
	});

	it('bar is OUTSIDE the dot-row dim wrapper (always reads first)', () => {
		// The bar lives in its own absolutely-positioned <span>, NOT inside
		// the .flex.gap-0.5.mt-0.5 dot row that gets opacity-dimmed.
		const dotRowMatch = CAL.match(/<div class="flex gap-0\.5 mt-0\.5 items-center"[\s\S]*?<\/div>/);
		expect(dotRowMatch).toBeTruthy();
		expect(dotRowMatch![0]).not.toMatch(/\{#if hasRescueMed\}/);
	});
});

describe('CIPH-pi19-A aria-label suffix uses plural()', () => {
	it('imports plural from $lib/i18n', () => {
		expect(CAL).toMatch(/import\s*\{[^}]*\bplural\b[^}]*\}\s*from\s*'\$lib\/i18n'/);
	});

	it('dayAriaLabel appends trigger + rescue suffixes via plural()', () => {
		expect(CAL).toMatch(/plural\(\$t,\s*\$locale,\s*'calendar\.aria_day_trigger_suffix'/);
		expect(CAL).toMatch(/plural\(\$t,\s*\$locale,\s*'calendar\.aria_day_rescue_suffix'/);
	});

	it('suffixes only appear when the gate AND the count are both present', () => {
		// Reads from countTriggersForDay/countRescueMedsForDay only when the
		// blueprint-level showTriggerMark/showRescueMedMark gates pass.
		expect(CAL).toMatch(/showTriggerMark\s*\?\s*countTriggersForDay\(day\)\s*:\s*0/);
		expect(CAL).toMatch(/showRescueMedMark\s*\?\s*countRescueMedsForDay\(day\)\s*:\s*0/);
	});
});

describe('CIPH-pi19-A i18n', () => {
	const KEYS = [
		'calendar.aria_day_trigger_suffix_one',
		'calendar.aria_day_trigger_suffix_other',
		'calendar.aria_day_rescue_suffix_one',
		'calendar.aria_day_rescue_suffix_other',
	] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every cell-mark key present and references {count}`, async () => {
			const mod = await import(`../../lib/i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
				expect(dict[k], `${locale} ${k} should template {count}`).toMatch(/\{count\}/);
			}
		});
	}
});
