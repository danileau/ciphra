/**
 * The doctor PDF documents; it does not conclude.
 *
 * Operator ruling 2026-08-21: *"Ciphra ist nur eine Dokumentationsplattform."*
 * The trajectory chart used to carry a label reading "Mehr Ereignisse" /
 * "Weniger Ereignisse" / "Stabil" — a derived verdict on which way the
 * patient's course was going.
 *
 * This is the third time that verdict has been narrowed, so it is worth
 * pinning rather than trusting to memory:
 *
 *   pre-pi24  a coloured pill (improving / stable / worsening) for every
 *             cohort. The five-doctor campfire flagged it as the single
 *             most-cited concern — STABIL on Helena mid-titration,
 *             VERBESSERUNG on Hans with a recent GTC, VERSCHLECHTERUNG on
 *             Anna's normal-rhythm bipolar quarter. "A wrong pill is worse
 *             than no pill."
 *   pi24      made cohort-aware and allowed to return null.
 *   DSPEC-2   colour removed, neutral text kept — the claim survived the
 *             thing that was supposed to fix it.
 *   2026-08-21 removed entirely.
 *
 * The direction remains fully available: it is the plotted line and the
 * monthly numbers. What is gone is ciphra asserting what that line means.
 *
 * NOTE the deliberate boundary. This guard covers DERIVED VERDICTS about
 * direction, not measured facts. "Blutdruck 128/82", "3 Episoden",
 * "2 Tage erfasst" are recorded data and must keep working.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

const DICTS: Array<[string, Record<string, string>]> = [
	['de', de],
	['en', en],
	['fr', fr],
	['it', itDict],
];

const REMOVED_KEYS = [
	'pdf.trend_improving',
	'pdf.trend_worsening',
	'pdf.trend_stable',
	'pdf.trend_vital_rising',
	'pdf.trend_vital_falling',
	'pdf.trend_vital_stable',
	'pdf.trend_polarity_more_manic',
	'pdf.trend_polarity_more_depressive',
	'pdf.trend_polarity_closer_to_baseline',
	'pdf.trajectory_narrative',
];

describe('the PDF makes no directional assessment', () => {
	it('the trajectory verdict machinery is gone from pdf.ts', () => {
		for (const symbol of ['resolveTrajectoryPill', 'pillSpec', 'trendLabel', 'chartContext']) {
			expect(PDF, `${symbol} is back in pdf.ts`).not.toContain(symbol);
		}
	});

	it('pdfTrajectory.ts is deleted, not merely unused', () => {
		// It existed only to compute the verdict. Leaving it on disk invites
		// a future caller to wire it back up.
		expect(existsSync(join(__dirname, 'pdfTrajectory.ts'))).toBe(false);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the verdict strings stay removed`, () => {
			const back = REMOVED_KEYS.filter((k) => dict[k] !== undefined);
			expect(
				back,
				`${name}: these assert a direction on the patient's course: ${back.join(', ')}. ` +
					`ciphra documents what was recorded; the chart shows the direction.`,
			).toEqual([]);
		});
	}

	it('the label chrome that read as a button is gone', () => {
		// White rounded rect + hairline border + short centred label is the
		// visual grammar of a control. A user reported it as "a 'Mehr
		// Ereignisse' button that isn't one" — in a PDF, where nothing is.
		expect(PDF).not.toMatch(/roundedRect\([^)]*labelW/);
	});

	it('no delta is graded good or bad', () => {
		// Second front of the same rule, closed 2026-08-21. The KPI tile delta
		// painted "three fewer episodes" olive and "three more" brick — the
		// trajectory verdict again, in colour rather than words, two
		// centimetres from where the label used to sit.
		//
		// The vital tiles had already refused to do this, with the reasoning
		// that generalises: "TSH falling on a hypothyroid patient is good, on
		// a hyperthyroid patient is bad. The tile shows direction; doctor
		// interprets."
		expect(PDF).not.toMatch(/semantic:\s*'(good|bad)'/);
		expect(PDF).not.toMatch(/semantic:\s*episodeChange/);
		expect(PDF, 'the graded-delta field is back').not.toMatch(
			/interface StatCardDelta\s*\{[\s\S]{0,400}semantic/,
		);
	});

	it('the direction itself still reaches the reader', () => {
		// Guards the over-correction: removing the GRADE must not remove the
		// CHANGE. The sign and the magnitude are recorded fact.
		expect(PDF).toMatch(/sign:\s*episodeChange\s*>\s*0\s*\?\s*'\+'\s*:\s*'-'/);
		expect(PDF).toMatch(/interface StatCardDelta\s*\{[\s\S]{0,400}value:\s*string/);
	});

	describe('a medication change gets structure, not an outcome (2026-09-17)', () => {
		// Operator ruling 2026-09-16/17: the charts shade the dose periods,
		// draw a boundary at the change and label the dose, and page 1 states
		// the regimen on the end date. The doctor compares by eye. ciphra
		// prints no per-period count, rate, average or delta, and no word
		// about what happened after the change — "before/after" is the
		// layout, never a sentence.
		const STRUCTURE_KEYS = [
			'pdf.dose_band_caption',
			'pdf.dose_band_stopped',
			'pdf.meds_on_date',
			'pdf.med_now_since',
			'pdf.med_now_before',
			'pdf.med_now_stopped',
			'pdf.med_now_as_needed',
		];
		const OUTCOME =
			/besser|schlechter|wirk|erfolg|seltener|häufiger|weniger|mehr|anfall|anfälle|episod|symptom|durchschnitt|better|worse|improv|effect|success|fewer|more|seizure|average|mieux|pire|amélior|efficac|moins|crise|moyenne|miglior|peggior|effic|meno|più|crisi|%/i;

		for (const [name, dict] of DICTS) {
			it(`${name}: the structure strings name doses and dates only`, () => {
				for (const k of STRUCTURE_KEYS) {
					expect(dict[k], `${name} ${k}`).toBeTruthy();
					expect(dict[k], `${name} ${k}`).not.toMatch(OUTCOME);
				}
			});
		}

		it('the treatment history says what was taken, never how it went (2026-09-19)', () => {
			// Its own strings, held to the same vocabulary as the bands.
			const THERAPY_KEYS = [
				'pdf.scope_therapy_label',
				'pdf.therapy_title',
				'pdf.therapy_col_med',
				'pdf.therapy_col_period',
				'pdf.therapy_col_regimen',
				'pdf.therapy_col_reason',
				'pdf.therapy_current_title',
				'pdf.therapy_provenance',
				'pdf.therapy_start_unknown',
				'pdf.therapy_ongoing',
				'pdf.therapy_remembered',
				'pdf.therapy_empty',
			];
			for (const [name, dict] of DICTS) {
				for (const k of THERAPY_KEYS) {
					expect(dict[k], `${name} ${k}`).toBeTruthy();
					expect(dict[k], `${name} ${k}`).not.toMatch(OUTCOME);
				}
			}
		});

		it('why a medication ended comes from the fixed list, and cannot be swapped for free text', () => {
			// The reasons are the person's own statement, so they are exempt
			// from the OUTCOME vocabulary ("Nebenwirkungen" contains "wirk").
			// What must hold is that they are a CLOSED set: five keys, resolved
			// inside the row builder. `therapyRows` used to take the resolver
			// as a callback — a caller could have passed `p => p.endNote` and
			// put free text on a clinical document.
			const REASONS = ['side_effects', 'ineffective', 'doctor', 'pregnancy', 'other'];
			for (const [name, dict] of DICTS) {
				for (const r of REASONS) expect(dict[`medication.stop_reason_${r}`], `${name} ${r}`).toBeTruthy();
			}
			const src = readFileSync(join(__dirname, 'pdfMedicationHistory.ts'), 'utf8');
			const i = src.indexOf('export function therapyRows(');
			expect(i, 'therapyRows missing').toBeGreaterThan(0);
			const body = src.slice(i, src.indexOf('\n}\n', i));
			expect(body).toMatch(/stopReasonLabel\(p\.stopReason, t\)/);
			expect(body, 'a typed reason must never reach a row').not.toMatch(/endNote|\.note\b/);
			// No indirection left for one to arrive through.
			expect(src.slice(i, src.indexOf(')', i))).not.toMatch(/=>|callback|stopReasonText/);
		});

		it('every PDF carries the medical-device disclaimer', () => {
			// The one sentence that states what ciphra is NOT. Each document
			// stamps it through drawFooter; nothing else pinned this.
			for (const fn of ['generateDoctorPdf', 'generateTherapyPdf']) {
				const i = PDF.indexOf(`export function ${fn}(`);
				expect(i, `${fn} missing`).toBeGreaterThan(0);
				const body = PDF.slice(i, PDF.indexOf('\nexport function ', i + 10));
				expect(body, `${fn} does not stamp the disclaimer`).toMatch(
					/drawFooter\(doc, t, 'pdf\.disclaimer_medical_long'/,
				);
			}
			// Each locale names its own regulation (MDR / MepV, ODim, ODmed);
			// the regulation NUMBER is what they all have to carry.
			for (const [name, dict] of DICTS) {
				expect(dict['pdf.disclaimer_medical_long'], name).toMatch(/2017\/745/);
			}
		});

		it('the band drawing reads no series data — it cannot count per period', () => {
			for (const fn of ['planDoseBands', 'drawDoseBandFills', 'drawDoseBandMarks', 'drawDoseBandCaption']) {
				const i = PDF.indexOf(`function ${fn}(`);
				expect(i, `${fn} missing`).toBeGreaterThan(0);
				const body = PDF.slice(i, PDF.indexOf('\n}\n', i));
				expect(body, `${fn} touches the data it must not summarise`).not.toMatch(
					/episod|symptom|seizure|Totals|values|documents|reduce\(/,
				);
			}
		});
	});

	it('measured facts are untouched — this guard is not a blanket ban', () => {
		// Guards against over-correcting: the report must still state what
		// was recorded.
		expect(de['pdf.days_logged_short']).toBeDefined();
		expect(de['pdf.legend_episodes']).toBeDefined();
		expect(PDF).toContain('pdf.days_logged_short');
	});
});
