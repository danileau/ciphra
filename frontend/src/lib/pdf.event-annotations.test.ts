/**
 * Annotations belong to a list; the aggregate chart gets a count.
 *
 * The trajectory drew one dashed line, one triangle and a 22-char label per
 * event at the event's x position, with no collision handling, no right-edge
 * clamp and no de-duplication. Twelve labels from one real export measured
 * 255mm on a 174mm axis — 147% of the axis. The design has no working case
 * above ~5 events; the shipped worst case is a rescue-med user at ~250.
 *
 * The vital mini-charts got the same lines with `withLabels: false`, i.e. an
 * unexplained brick symbol over someone's TSH trend, with no legend anywhere
 * in the document. That is the defect the 2026-06-07 five-doctor review
 * removed as P0-1, reintroduced on a different marker.
 *
 * `feedback_chart_event_markers` (2026-05-12) already banned this after three
 * on-screen iterations: "Aggregate-axis line charts: never draw per-event
 * marks." The web answer was a tooltip. Paper has no hover — hence a count on
 * the chart (pitch = axis pitch, so it cannot collide) and the text in a list.
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

describe('per-event chart markers are gone', () => {
	it('the marker drawing machinery is removed', () => {
		for (const sym of ['drawEventLines', 'buildEventMarkers', 'EventMarker']) {
			expect(PDF, `${sym} is back`).not.toContain(sym);
		}
	});

	it('nothing draws a per-event dashed fence across a plot area', () => {
		// The old signature took the plot box and stroked floor-to-ceiling.
		expect(PDF).not.toMatch(/setLineDashPattern\(\[1\.2, 1\]/);
	});

	it('no chart label is truncated to a fragment', () => {
		// `raw.length > 22 ? raw.slice(0, 21) + '…'` kept the identifying half
		// of a sentence and discarded the meaning.
		expect(PDF).not.toMatch(/slice\(0,\s*21\)\s*\+\s*'…'/);
	});
});

describe('the chart carries a count whose pitch is the axis pitch', () => {
	it('drawEventCountRow buckets by month', () => {
		expect(PDF).toContain('function drawEventCountRow');
		const fn = PDF.slice(PDF.indexOf('function drawEventCountRow'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		// Position comes from the bucket index over the bucket count — never
		// from a per-event day fraction.
		expect(body).toMatch(/monthBuckets\.length\s*-\s*1/);
		expect(body).not.toMatch(/frac/);
	});

	it('counts note markers only, not rescue-med administrations', () => {
		// A PRN taken twice weekly is 104 events a year and would drown the
		// annotations. Rescue meds already have a KPI tile and CSV columns.
		expect(PDF).toMatch(/noteEvents\s*=\s*reportEvents\.filter\(\(e\) => !e\.isMed\)/);
	});

	it('the symbol is explained by a legend entry (PDF_DESIGN_SPEC §14)', () => {
		expect(PDF).toContain("t('pdf.legend_event_count')");
		for (const [name, dict] of DICTS) {
			expect(dict['pdf.legend_event_count'], `${name}: legend string missing`).toBeTruthy();
		}
	});
});

describe('vital mini-charts carry no annotations at all', () => {
	it('both mini-chart renderers record why they draw none', () => {
		// `drawEventLines` no longer exists at all (asserted above), so the
		// call cannot return by accident — only by someone re-inventing it.
		// The note at both former call sites is what they would have to
		// delete first.
		const notes = PDF.match(/No event markers here/g) ?? [];
		expect(notes, 'the line-renderer and the diverging-bars renderer').toHaveLength(2);
	});
});

describe('the note text lives in a list, in full', () => {
	it('resolves note text through the shared module, not its own copy', () => {
		// `noteMarkerText` prefers `title` over `notes` — the epilepc migration
		// puts the short human title in `title` and the long prose in `notes`,
		// which is why the reported labels were sentences. Behaviour is pinned
		// in reports/noteMarkers.test.ts; what matters HERE is that the PDF and
		// the pre-export review resolve it identically, so the user cannot tick
		// one set of sentences and hand over another.
		expect(PDF).toContain("from '$lib/reports/noteMarkers'");
		expect(PDF).toMatch(/text = noteMarkerText\(d\);/);
		expect(PDF, 'a second, drifting copy').not.toMatch(/\.title\s*\|\|\s*d\.data\.notes/);
	});

	it('events are ordered oldest first — the arc, not a feed', () => {
		expect(PDF).toMatch(/sort\(\(a, b\) => a\.dateISO\.localeCompare\(b\.dateISO\)\)/);
	});

	it('the list is clamped to the report window', () => {
		const fn = PDF.slice(PDF.indexOf('function buildEventList'));
		const body = fn.slice(0, fn.indexOf('return out.sort'));
		expect(body).toMatch(/ds < scopeStartISO \|\| ds > scopeEndISO/);
	});

	it('the date column names the month and the year', () => {
		// A 2-year report spans two years, so a bare day/month is ambiguous,
		// and a numeric day/month flips meaning between locales.
		const idx = PDF.indexOf("t('pdf.event_notes_col')");
		const block = PDF.slice(idx, idx + 700);
		expect(block).toMatch(/month:\s*'short'/);
		expect(block).toMatch(/year:\s*'numeric'/);
	});

	it('carries a provenance header, per the P0-2 quote precedent', () => {
		expect(PDF).toContain("t('pdf.event_notes_provenance')");
		for (const [name, dict] of DICTS) {
			const v = dict['pdf.event_notes_provenance'];
			expect(v, `${name}: provenance string missing`).toBeTruthy();
			// Must attribute authorship before the reader parses the words.
			expect(v.length, `${name}: provenance string looks empty`).toBeGreaterThan(10);
		}
	});

	it('renders on every scope, including month exports', () => {
		// The month-scope chart never drew markers, so annotations were absent
		// from that export entirely. The list is outside the scope branch.
		const listIdx = PDF.indexOf("t('pdf.event_notes_title')");
		const branchEnd = PDF.indexOf("} // end of `if (scope !== 'month')`");
		expect(branchEnd).toBeGreaterThan(0);
		expect(listIdx).toBeGreaterThan(branchEnd);
	});
});
