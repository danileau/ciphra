/**
 * CIPH-880 — Calendar day-click sheet redesign guards.
 *
 * The pre-PI v12 calendar sheet rendered entries through inline summary
 * strings (e.g. "Schmerzlevel: 3 1-10 · Zyklustag: 31 Tag …") that were
 * flat, untyped, and brittle. PI v11 already routed display through
 * <EntryPreview>; PI v12 (CIPH-880) layered cohort-aware framing,
 * jump-to-adjacent-day arrows, and a Copy-previous-day affordance on top.
 *
 * These tests catch the most likely regression: someone re-introduces
 * raw vital-string concatenation or per-doc fields directly in the sheet
 * template, bypassing the typed primitive.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE = resolve(__dirname, '+page.svelte');
const SRC = readFileSync(ROUTE, 'utf8');

describe('CIPH-880 calendar day-click sheet — typed-rendering guard', () => {
	it('renders the day through <DayDetail> (CIPH-910 — was <EntryPreview>)', () => {
		// CIPH-910 — the per-doc EntryPreview stack was replaced by
		// the sectioned <DayDetail> view. Either component is a
		// typed-primitive consumer; what matters is that the sheet
		// never falls back to raw string concatenation.
		expect(SRC).toMatch(/<(EntryPreview|DayDetail)\b/);
	});

	it('does not concatenate vital strings with the · separator', () => {
		// EntryPreview legitimately uses `.join(' · ')` for paired-vital
		// formatting. That helper lives inside the primitive — never inline
		// in the calendar sheet.
		expect(SRC).not.toMatch(/\.join\(['"`] · ['"`]\)/);
	});

	it('does not interpolate raw `data.vitals[…]` in the template', () => {
		// Mustache-style interpolation reading vitals directly would mean
		// someone built a plaintext summary. Helpers may still read them
		// programmatically — the guard targets template binding sites only.
		// `{$documents…}` references are fine; this matches `{…data.vitals[…]}`.
		expect(SRC).not.toMatch(/\{[^}]*\.data\.vitals\s*\[/);
	});
});

describe('CIPH-880 calendar day-click sheet — cohort-aware framing', () => {
	it('exports a selectedDayPhase reactive for the cycle cohort chip', () => {
		expect(SRC).toMatch(/selectedDayPhase\s*=/);
		expect(SRC).toContain('cycle.phase_');
	});

	it('exports a selectedDayBands reactive for the phase cohort pills', () => {
		expect(SRC).toMatch(/selectedDayBands\s*=/);
	});

	it('exports a previousDayHasEntry reactive for the empty-state action', () => {
		expect(SRC).toMatch(/previousDayHasEntry\s*=/);
		expect(SRC).toContain('protocol.copy_previous');
	});
});

describe('CIPH-880 calendar day-click sheet — adjacent-day nav', () => {
	it('declares an adjustSelectedDate handler', () => {
		expect(SRC).toMatch(/function adjustSelectedDate\s*\(/);
	});

	it('exposes prev/next day buttons with i18n aria labels', () => {
		expect(SRC).toContain('common.previous_day');
		expect(SRC).toContain('common.next_day');
	});
});
