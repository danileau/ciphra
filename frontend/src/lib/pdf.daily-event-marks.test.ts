/**
 * Per-event marks belong on daily-resolution surfaces — and only there.
 *
 * `feedback_chart_event_markers` (2026-05-12), after three rejected on-screen
 * iterations, states the rule in two halves:
 *
 *   "Aggregate-axis line charts: never draw per-event marks. The axis
 *    compresses them past the point of legibility."
 *   "Daily-axis surfaces: per-event badges are fine; the day IS the unit."
 *
 * The PDF had it exactly backwards. The 12/24-month trajectory drew a dashed
 * line and a 22-char label per event — 255mm of labels on a 174mm axis — while
 * the two surfaces where a day is a day drew nothing at all: the monthly chart
 * (5.7–6.3mm per day) and the landscape grid (one row per day).
 *
 * The first half was fixed by moving the trajectory to a per-month count.
 * This is the second half.
 *
 * One mark per DAY, never per event. Two notes on the same day are one thing
 * that happened that day, and per-event marking is what reintroduces
 * collision the moment someone logs twice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');
const DICTS: Array<[string, Record<string, string>]> = [
	['de', de], ['en', en], ['fr', fr], ['it', itDict],
];

describe('the monthly chart marks the day', () => {
	const fn = () => {
		const i = PDF.indexOf('function drawDailyMonthChart');
		return PDF.slice(i, PDF.indexOf('\n}\n', i));
	};

	it('collects marked days as a Set, so a day is marked once', () => {
		expect(fn()).toMatch(/const dayMarks = new Set<number>\(\)/);
	});

	it('positions by day index over days-in-month, not by a date fraction', () => {
		expect(fn()).toMatch(/\(day - 1\) \/ Math\.max\(1, daysInMonth - 1\)/);
	});

	it('resolves the markers through the shared module', () => {
		// Same definition the export review offers and the note list prints.
		expect(fn()).toMatch(/noteMarkersInWindow\(documents,/);
	});

	it('a month whose only content is note markers is not called empty', () => {
		// The empty-state guard tested episodes and symptoms only, so a month
		// with note markers printed "Keine Einträge diesen Monat" — and the
		// early return meant the marks never drew, on precisely the export
		// where they carry the only information.
		expect(fn()).toMatch(
			/episodeTotal === 0 && symptomTotal === 0 && dayMarks\.size === 0/,
		);
	});
});

describe('the grid marks the day row', () => {
	it('marks the Day column of a body row, never the totals rows', () => {
		const i = PDF.indexOf('const markedDays = new Set<number>()');
		expect(i).toBeGreaterThan(0);
		const block = PDF.slice(i, i + 7000);
		expect(block).toMatch(/data\.section !== 'body' \|\| data\.column\.index !== 0/);
		expect(block).toMatch(/day > daysInMonth \|\| !markedDays\.has\(day\)/);
	});

	it('keeps the existing continuation-label hook rather than replacing it', () => {
		// The grid paginates; dropping that hook would silently remove the
		// "continued" label from every split table.
		const i = PDF.indexOf('const markedDays = new Set<number>()');
		expect(PDF.slice(i, i + 7000)).toMatch(
			/continuationLabelHook\(t\('pdf\.table_continued'\)\)\(data\)/,
		);
	});
});

describe('the symbol is explained on both surfaces', () => {
	it('the monthly chart legend carries it', () => {
		const i = PDF.indexOf('function drawDailyMonthChart');
		expect(PDF.slice(i, PDF.indexOf('\n}\n', i))).toContain("t('pdf.legend_note_marker_day')");
	});

	it('the grid header carries it', () => {
		const i = PDF.indexOf('const markedDays = new Set<number>()');
		expect(PDF.slice(i, i + 1400)).toContain("t('pdf.legend_note_marker_day')");
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the string exists`, () => {
			expect(dict['pdf.legend_note_marker_day'], `${name} missing`).toBeTruthy();
		});
	}

	it('both render it only when the surface actually has a mark', () => {
		// An empty legend row is chrome on a page that has none to spare.
		expect(PDF).toMatch(/if \(dayMarks\.size > 0\)/);
		expect(PDF).toMatch(/if \(markedDays\.size > 0\)/);
	});
});

describe('the aggregate surfaces stay clean', () => {
	it('the trajectory still has no per-event marks', () => {
		// The rule this PR completes: daily yes, aggregate no.
		expect(PDF).not.toContain('drawEventLines');
		expect(PDF).not.toContain('buildEventMarkers');
	});
});
