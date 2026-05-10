import { describe, expect, it } from 'vitest';
import { aggregateCycleStrip } from '$lib/pdfCycleStrip';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

function endoBlueprint(): Blueprint {
	return {
		version: 1,
		conditionId: 'endometriosis',
		conditionLabel: 'Endometriosis',
		accentColor: '#b6306a',
		symptomGroups: [],
		episodeTypes: [],
		triggers: [],
		vitals: [
			{ id: 'cycle_day', label: 'cycle_day', unit: 'd', placeholder: '' } as never,
			{ id: 'cycle_length', label: 'cycle_length', unit: 'd', placeholder: '' } as never,
		],
		medications: [],
	} as Blueprint;
}

function entryWithCycle(id: number, date: string, day: number, length = 28): CiphraDocument {
	return {
		id,
		data: {
			type: 'entry',
			date,
			vitals: { cycle_day: String(day), cycle_length: String(length) },
		},
		createdAt: new Date(date).getTime(),
		updatedAt: new Date(date).getTime(),
	} as unknown as CiphraDocument;
}

describe('aggregateCycleStrip', () => {
	it('returns an array of length daysInMonth', () => {
		const cells = aggregateCycleStrip(endoBlueprint(), [], 2026, 4, 31);
		expect(cells).toHaveLength(31);
	});

	it('numbers days 1..N in order', () => {
		const cells = aggregateCycleStrip(endoBlueprint(), [], 2026, 4, 31);
		expect(cells.map((c) => c.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
	});

	it('emits ISO YYYY-MM-DD with zero-padded month + day', () => {
		const cells = aggregateCycleStrip(endoBlueprint(), [], 2026, 0, 31);
		expect(cells[0].iso).toBe('2026-01-01');
		expect(cells[8].iso).toBe('2026-01-09');
		expect(cells[30].iso).toBe('2026-01-31');
	});

	it('returns phase=null for every day when anchor has no data', () => {
		// No cycle_day in any doc → anchor has no data → cycleStateForDate
		// returns null → strip renders empty (hairline border per cell).
		const cells = aggregateCycleStrip(endoBlueprint(), [], 2026, 4, 31);
		expect(cells.every((c) => c.phase === null)).toBe(true);
	});

	it('resolves phases against an anchor when cycle data is present', () => {
		// Anchor: 2026-04-15 was cycle_day=1 (start of menstrual). 28-day cycle.
		// Phase boundaries: menstrual 1-5, follicular 6-13, ovulation 14-16, luteal 17+.
		const docs = [entryWithCycle(1, '2026-04-15', 1, 28)];
		const cells = aggregateCycleStrip(endoBlueprint(), docs, 2026, 3, 30);  // month 3 = April
		// Day 15 (anchor) → menstrual.
		expect(cells.find((c) => c.day === 15)?.phase).toBe('menstrual');
		// Day 20 → 6 days post-anchor → cycle_day 7 → follicular.
		expect(cells.find((c) => c.day === 20)?.phase).toBe('follicular');
		// Day 28 → 13 days post-anchor → cycle_day 14 → ovulation.
		expect(cells.find((c) => c.day === 28)?.phase).toBe('ovulation');
		// Day 1 (before anchor) → 14 days back → cycle_day 15 → ovulation
		// (cycle math wraps modulo cycleLength).
		expect(cells.find((c) => c.day === 1)?.phase).toBe('ovulation');
	});

	it('honors cycle_length other than 28 (PCOS irregular case)', () => {
		// cycle_length=35 → menstrual 1-6, follicular 7-16, ovulation 17-20, luteal 21+.
		const docs = [entryWithCycle(1, '2026-04-15', 1, 35)];
		const cells = aggregateCycleStrip(endoBlueprint(), docs, 2026, 3, 30);
		expect(cells.find((c) => c.day === 15)?.phase).toBe('menstrual');
		// Day 22 → 7 days post-anchor → cycle_day 8 → follicular (still inside).
		expect(cells.find((c) => c.day === 22)?.phase).toBe('follicular');
		// Day 30 → 15 days post-anchor → cycle_day 16 → follicular (boundary).
		expect(cells.find((c) => c.day === 30)?.phase).toBe('follicular');
	});

	it('handles anchor docs from outside the focus month', () => {
		// Anchor in March, focus month is April — strip must still resolve.
		const docs = [entryWithCycle(1, '2026-03-20', 1, 28)];
		const cells = aggregateCycleStrip(endoBlueprint(), docs, 2026, 3, 30);
		expect(cells.every((c) => c.phase !== null)).toBe(true);
	});
});
