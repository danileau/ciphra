/**
 * CIPH-pi19-B — Persistent right-rail on lg:.
 *
 * Guards the lg+ 2-column grid wrapper, the rail's non-modal contract
 * (no role=dialog / aria-modal / scrim), the railSelectedDate
 * derivation, the modal-vs-rail gating, the focus-trap refactor, and
 * the MonthMiniSummary contract.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CAL = readFileSync(join(__dirname, '+page.svelte'), 'utf8');
const MINI = readFileSync(
	join(__dirname, '..', '..', 'lib', 'components', 'MonthMiniSummary.svelte'),
	'utf8',
);

describe('CIPH-pi19-B 2-column lg+ layout', () => {
	it('wrapper switches to 2-col grid at lg with 1fr / 360px', () => {
		expect(CAL).toMatch(
			/lg:grid lg:grid-cols-\[minmax\(0,1fr\)_360px\] lg:gap-6 lg:items-start/,
		);
	});

	it('rail aside is hidden below lg', () => {
		expect(CAL).toMatch(/<aside class="hidden lg:block cal-rail"/);
	});

	it('rail uses position: sticky under the authed header', () => {
		expect(CAL).toMatch(/\.cal-rail\s*\{[\s\S]*?position:\s*sticky/);
		expect(CAL).toMatch(/\.cal-rail\s*\{[\s\S]*?top:\s*80px/);
	});
});

describe('CIPH-pi19-B isLg media-query subscription', () => {
	it('isLg derives from min-width:1024 matchMedia', () => {
		expect(CAL).toMatch(/window\.matchMedia\('\(min-width: 1024px\)'\)/);
	});

	it('onMount subscribes to MQ change so resize keeps isLg in sync', () => {
		expect(CAL).toMatch(/mq\.addEventListener\('change',\s*handler\)/);
		expect(CAL).toMatch(/mq\.removeEventListener\('change',\s*handler\)/);
	});
});

describe('CIPH-pi19-B railSelectedDate fallback chain', () => {
	it('derives selectedDate, else today on current month, else most-recent-logged', () => {
		// Order matters: selectedDate wins, then today (when isOnCurrentMonth),
		// then the last (most recent) logged day in monthDocs.
		expect(CAL).toMatch(/\$:\s*railSelectedDate\s*=\s*\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(selectedDate\)\s*return\s*selectedDate/);
		expect(CAL).toMatch(/if\s*\(isOnCurrentMonth\)\s*return\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
		expect(CAL).toMatch(/logged\.length\s*>\s*0\s*\?\s*logged\[logged\.length\s*-\s*1\]\s*:\s*null/);
	});

	it('railDocs reads from $documents using railSelectedDate', () => {
		expect(CAL).toMatch(/\$:\s*railDocs\s*=\s*railSelectedDate[\s\S]*?\$documents\.filter/);
	});
});

describe('CIPH-pi19-B modal-vs-rail gating', () => {
	it('modal only renders when selectedDate AND not isLg', () => {
		expect(CAL).toMatch(/\{#if selectedDate && !isLg\}/);
	});

	it('rail is non-modal: no role=dialog / aria-modal / scrim inside the aside', () => {
		const aside = CAL.match(/<aside class="hidden lg:block cal-rail"[\s\S]*?<\/aside>/);
		expect(aside, 'expected aside block').toBeTruthy();
		expect(aside![0]).not.toMatch(/role="dialog"/);
		expect(aside![0]).not.toMatch(/aria-modal="true"/);
		expect(aside![0]).not.toMatch(/bg-black\/40/);
	});

	it('rail title uses aria-live="polite" for announce-on-change', () => {
		const aside = CAL.match(/<aside class="hidden lg:block cal-rail"[\s\S]*?<\/aside>/);
		expect(aside![0]).toMatch(/aria-live="polite"/);
	});
});

describe('CIPH-pi19-B focus-trap refactor', () => {
	it('Tab trap is skipped when isLg (rail is non-modal)', () => {
		expect(CAL).toMatch(/if\s*\(isLg\)\s*return;\s*\n\s*if\s*\(e\.key\s*!==\s*'Tab'/);
	});

	it('autofocus reactive only fires when !isLg', () => {
		expect(CAL).toMatch(/if\s*\(typeof document\s*!==\s*'undefined'\s*&&\s*selectedDate\s*&&\s*!isLg\)/);
	});

	it('Esc still clears selectedDate at all viewports', () => {
		// The Escape branch fires before the isLg early-return.
		expect(CAL).toMatch(/if\s*\(e\.key === 'Escape'\)\s*\{\s*\n\s*selectedDate\s*=\s*null;\s*\n\s*return;\s*\n\s*\}/);
	});
});

describe('CIPH-pi19-B adjustSelectedDate uses railSelectedDate as fallback', () => {
	it('anchors on railSelectedDate when selectedDate is null', () => {
		expect(CAL).toMatch(/const anchor = selectedDate \|\| railSelectedDate/);
	});
});

describe('CIPH-pi19-B MonthMiniSummary component contract', () => {
	it('declares all 5 required props', () => {
		for (const p of [
			'monthName',
			'triggerDayCount',
			'rescueMedDayCount',
			'showTrigger',
			'showRescue',
		]) {
			expect(MINI, `missing prop ${p}`).toMatch(new RegExp(`export let ${p}`));
		}
	});

	it('renders trigger row only when showTrigger', () => {
		expect(MINI).toMatch(/\{#if showTrigger\}[\s\S]*?calendar\.mini_trigger_days/);
	});

	it('renders rescue row only when showRescue', () => {
		expect(MINI).toMatch(/\{#if showRescue\}[\s\S]*?calendar\.mini_rescue_days/);
	});

	it('renders empty-state when neither row flag is on (and no heatmap)', () => {
		// CIPH-pi19-C narrowed this branch from `{:else}` to
		// `{:else if !showHeatmap}` so the empty copy doesn't double-print
		// when only the heatmap is showing. The empty key is still reached.
		expect(MINI).toMatch(/\{:else if !showHeatmap\}[\s\S]*?calendar\.mini_summary_empty/);
	});

	it('glyphs mirror the cell encoding (ochre triangle + brand bar)', () => {
		expect(MINI).toMatch(/border-bottom:\s*6px solid var\(--ochre\)/);
		expect(MINI).toMatch(/background:\s*var\(--brand\)/);
	});

	it('parent passes the props derived from triggerCountByDay / rescueMedCountByDay', () => {
		expect(CAL).toMatch(/\$:\s*triggerDayCount\s*=\s*triggerCountByDay\.size/);
		expect(CAL).toMatch(/\$:\s*rescueMedDayCount\s*=\s*rescueMedCountByDay\.size/);
		expect(CAL).toMatch(/<MonthMiniSummary[\s\S]*?showTrigger=\{showTriggerMark\}/);
		expect(CAL).toMatch(/<MonthMiniSummary[\s\S]*?showRescue=\{showRescueMedMark\}/);
	});
});

describe('CIPH-pi19-B i18n', () => {
	const KEYS = [
		'calendar.rail_aria',
		'calendar.this_month',
		'calendar.mini_trigger_days',
		'calendar.mini_rescue_days',
		'calendar.mini_summary_aria',
		'calendar.mini_summary_empty',
	] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every rail/mini-summary key present and non-empty`, async () => {
			const mod = await import(`../../lib/i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
				expect(dict[k]!.trim().length).toBeGreaterThan(0);
			}
			expect(dict['calendar.mini_summary_aria'], `${locale} mini_summary_aria templates {month}`).toMatch(/\{month\}/);
		});
	}
});

describe('CIPH-pi19-C trigger heatmap row', () => {
	it('MonthMiniSummary declares the new heatmap props with safe defaults', () => {
		expect(MINI).toMatch(/export let monthPrefix:\s*string\s*=\s*''/);
		expect(MINI).toMatch(/export let daysInMonth:\s*number\s*=\s*0/);
		expect(MINI).toMatch(/export let triggerCountByDay:\s*Map<string,\s*number>\s*=\s*new Map\(\)/);
	});

	it('heatmap is gated on showTrigger AND non-zero geometry inputs', () => {
		expect(MINI).toMatch(
			/showHeatmap\s*=\s*showTrigger\s*&&\s*daysInMonth\s*>\s*0\s*&&\s*monthPrefix\.length\s*>\s*0/,
		);
	});

	it('5-bucket opacity ramp covers 0 / 1 / 2 / 3-4 / 5+', () => {
		// The discrete ramp must distinguish "no triggers" from "1 trigger"
		// — a continuous mapping (0.2 + count * 0.15) would hide that.
		expect(MINI).toMatch(/if\s*\(count\s*<=\s*0\)\s*return 0/);
		expect(MINI).toMatch(/if\s*\(count\s*===\s*1\)\s*return 0\.3/);
		expect(MINI).toMatch(/if\s*\(count\s*===\s*2\)\s*return 0\.5/);
		expect(MINI).toMatch(/if\s*\(count\s*<=\s*4\)\s*return 0\.7/);
		expect(MINI).toMatch(/return 0\.9/);
	});

	it('cells are buttons (clickable) with aria-label per density', () => {
		// Filled cells use plural() for cardinality; empty cells use the
		// dedicated _empty key so SR users hear "no triggers" not "0".
		expect(MINI).toMatch(/<button\s+type="button"\s+class="cal-mini-heat-cell"/);
		expect(MINI).toMatch(/calendar\.trigger_pressure_cell\b/);
		expect(MINI).toMatch(/calendar\.trigger_pressure_cell_empty/);
	});

	it('click dispatches selectday with an ISO date string', () => {
		expect(MINI).toMatch(/dispatch\('selectday',\s*dateStr\)/);
	});

	it('parent wires the new props + selectday handler', () => {
		expect(CAL).toMatch(/<MonthMiniSummary[\s\S]*?\{monthPrefix\}/);
		expect(CAL).toMatch(/<MonthMiniSummary[\s\S]*?\{daysInMonth\}/);
		expect(CAL).toMatch(/<MonthMiniSummary[\s\S]*?\{triggerCountByDay\}/);
		expect(CAL).toMatch(
			/<MonthMiniSummary[\s\S]*?on:selectday=\{\(e\)\s*=>\s*\{\s*selectedDate\s*=\s*e\.detail;?\s*\}\}/,
		);
	});

	it('grid columns scale with daysInMonth so 28-day Februaries fit', () => {
		expect(MINI).toMatch(/grid-template-columns:\s*repeat\(\{daysInMonth\},\s*1fr\)/);
	});

	it('empty cell has hairline outline so column position stays readable', () => {
		expect(MINI).toMatch(
			/\.cal-mini-heat-cell\.is-empty\s*\{[\s\S]*?box-shadow:\s*inset 0 0 0 1px var\(--border-subtle/,
		);
	});

	it('empty-state copy yields the floor only when neither row nor heatmap renders', () => {
		// Previously the empty <p> appeared as the {:else} of the row block;
		// once the heatmap gate is on, it must not double-print.
		expect(MINI).toMatch(/\{:else if !showHeatmap\}[\s\S]*?calendar\.mini_summary_empty/);
	});
});

describe('CIPH-pi19-D motion + visual-smoke contract', () => {
	it('rail aside has NO transition: directive — re-target is instant', () => {
		// Modal's fly transition was a dialog affordance. The rail is a
		// layout element; sliding it on every day-pick would feel like
		// the modal we just dissolved. This test asserts that none of
		// the elements inside the lg+ aside use svelte transitions.
		const aside = CAL.match(/<aside class="hidden lg:block cal-rail"[\s\S]*?<\/aside>/);
		expect(aside, 'expected aside block').toBeTruthy();
		expect(aside![0]).not.toMatch(/\btransition:[a-z]+\s*=/);
		expect(aside![0]).not.toMatch(/\bin:[a-z]+\s*=/);
		expect(aside![0]).not.toMatch(/\bout:[a-z]+\s*=/);
	});

	it('modal preserves prefers-reduced-motion gating on fly + scrim', () => {
		// fly() durations and the scrim's fade must collapse to 0 under
		// prefers-reduced-motion. Defends the PI v15 LB-1+2 contract.
		expect(CAL).toMatch(/duration:\s*prefersReducedMotion\s*\?\s*0\s*:\s*200/);
		expect(CAL).toMatch(/duration:\s*prefersReducedMotion\s*\?\s*0\s*:\s*300/);
		expect(CAL).toMatch(/x:\s*prefersReducedMotion\s*\?\s*0/);
		expect(CAL).toMatch(/y:\s*prefersReducedMotion\s*\?\s*0/);
	});

	it('1440px viewport added to visual-smoke spec so rail is captured', () => {
		const smoke = readFileSync(
			join(__dirname, '..', '..', '..', 'e2e', 'visual-smoke.spec.ts'),
			'utf8',
		);
		expect(smoke).toMatch(/name:\s*'wide',\s*width:\s*1440/);
	});

	it('rail-only marks (heatmap cells) get focus-visible outlines', () => {
		// Color-blind validation: clickable cells must be keyboard-focusable
		// AND show a non-color focus indicator. The :focus-visible style
		// uses an outline (not just a color shift) so blind/contrast users
		// see the focus state.
		expect(MINI).toMatch(
			/\.cal-mini-heat-cell:focus-visible\s*\{[\s\S]*?outline-color:\s*var\(--brand\)/,
		);
	});
});

describe('CIPH-pi19-C i18n keys', () => {
	const KEYS = [
		'calendar.trigger_pressure',
		'calendar.trigger_pressure_aria',
		'calendar.trigger_pressure_cell_one',
		'calendar.trigger_pressure_cell_other',
		'calendar.trigger_pressure_cell_empty',
	] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: heatmap keys present + plural variants reference {count}+{day}`, async () => {
			const mod = await import(`../../lib/i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
				expect(dict[k]!.trim().length).toBeGreaterThan(0);
			}
			expect(dict['calendar.trigger_pressure_aria']!).toMatch(/\{month\}/);
			expect(dict['calendar.trigger_pressure_cell_one']!).toMatch(/\{day\}/);
			expect(dict['calendar.trigger_pressure_cell_one']!).toMatch(/\{count\}/);
			expect(dict['calendar.trigger_pressure_cell_other']!).toMatch(/\{day\}/);
			expect(dict['calendar.trigger_pressure_cell_other']!).toMatch(/\{count\}/);
			expect(dict['calendar.trigger_pressure_cell_empty']!).toMatch(/\{day\}/);
		});
	}
});
