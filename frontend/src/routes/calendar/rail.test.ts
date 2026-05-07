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

	it('renders empty-state when neither flag is on', () => {
		expect(MINI).toMatch(/\{:else\}[\s\S]*?calendar\.mini_summary_empty/);
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
