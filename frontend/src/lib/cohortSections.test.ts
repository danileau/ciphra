import { describe, expect, it } from 'vitest';
import { ALL_COHORTS } from '$lib/blueprint/cohort';
import { SPINE, sectionsForCohort, type PdfSectionKey } from '$lib/cohortSections';

describe('cohortSections — typed gate', () => {
	it('returns a non-empty ordered list for every cohort', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			expect(list.length, `cohort ${c} must have at least the spine + tail`).toBeGreaterThan(SPINE.length);
		}
	});

	it('starts every cohort with the mandatory spine in order', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			expect(list.slice(0, SPINE.length)).toEqual([...SPINE]);
		}
	});

	it('ends every cohort with the universal tail (footer last)', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			expect(list[list.length - 1]).toBe('footer');
			expect(list).toContain('day-coverage-strip');
			expect(list).toContain('condition-aware-bullets');
			expect(list).toContain('symptom-grid');
		}
	});

	it('contains no duplicate section keys per cohort', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			expect(new Set(list).size, `cohort ${c} has duplicates`).toBe(list.length);
		}
	});

	it('cycle gets cycle-strip and only cycle does', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			if (c === 'cycle') expect(list).toContain('cycle-strip');
			else expect(list).not.toContain('cycle-strip');
		}
	});

	it('phase gets phase-distribution and only phase does', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			if (c === 'phase') expect(list).toContain('phase-distribution');
			else expect(list).not.toContain('phase-distribution');
		}
	});

	it('narrative gets trigger-frequency and only narrative does', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			if (c === 'narrative') expect(list).toContain('trigger-frequency');
			else expect(list).not.toContain('trigger-frequency');
		}
	});

	it('cycle-strip / phase-distribution / trigger-frequency are mutually exclusive', () => {
		for (const c of ALL_COHORTS) {
			const list = sectionsForCohort(c);
			const exclusive: PdfSectionKey[] = ['cycle-strip', 'phase-distribution', 'trigger-frequency'];
			const hits = exclusive.filter((k) => list.includes(k));
			expect(hits.length, `cohort ${c} must surface at most one cohort-exclusive section`).toBeLessThanOrEqual(1);
		}
	});

	it('discrete and custom share the same section list', () => {
		// Both are "no extra cohort-conditional middle" — gate symmetry catches
		// drift if someone adds a discrete-only or custom-only section without
		// updating the other. Document as intent; if they ever diverge, this
		// test must change deliberately.
		expect(sectionsForCohort('discrete')).toEqual(sectionsForCohort('custom'));
	});

	it('snapshot — full table per cohort (any change here forces a memo update)', () => {
		const table = Object.fromEntries(
			ALL_COHORTS.map((c) => [c, sectionsForCohort(c)]),
		);
		expect(table).toMatchInlineSnapshot(`
			{
			  "custom": [
			    "header",
			    "disclaimer",
			    "doctor-glance",
			    "trend",
			    "day-coverage-strip",
			    "condition-aware-bullets",
			    "symptom-grid",
			    "footer",
			  ],
			  "cycle": [
			    "header",
			    "disclaimer",
			    "doctor-glance",
			    "trend",
			    "cycle-strip",
			    "day-coverage-strip",
			    "condition-aware-bullets",
			    "symptom-grid",
			    "footer",
			  ],
			  "discrete": [
			    "header",
			    "disclaimer",
			    "doctor-glance",
			    "trend",
			    "day-coverage-strip",
			    "condition-aware-bullets",
			    "symptom-grid",
			    "footer",
			  ],
			  "narrative": [
			    "header",
			    "disclaimer",
			    "doctor-glance",
			    "trend",
			    "trigger-frequency",
			    "day-coverage-strip",
			    "condition-aware-bullets",
			    "symptom-grid",
			    "footer",
			  ],
			  "phase": [
			    "header",
			    "disclaimer",
			    "doctor-glance",
			    "trend",
			    "phase-distribution",
			    "day-coverage-strip",
			    "condition-aware-bullets",
			    "symptom-grid",
			    "footer",
			  ],
			}
		`);
	});
});
