/**
 * CIPH-886 — Per-day phase override precedence + render-coverage guards.
 *
 * The cycle cohort can set an explicit phase on any entry day to override
 * the derivation when the auto-computed phase doesn't match reality
 * (irregular cycles, late ovulation, …). The contract:
 *
 *   1. dayPhase(day) returns phaseOverride if present on the entry,
 *      otherwise falls back to the cycle-anchor-derived phase.
 *   2. Override-bearing days render a small triangle indicator so users
 *      can tell derived from manually-set days at a glance.
 *   3. The anchor-correction hint surfaces a count of overridden days
 *      in the visible month so the calendar stops feeling like a black
 *      box.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE = resolve(__dirname, '+page.svelte');
const SRC = readFileSync(ROUTE, 'utf8');

describe('CIPH-886 phase-override calendar precedence', () => {
	it('declares dayPhaseOverride() that reads phaseOverride from the entry doc', () => {
		expect(SRC).toMatch(/function dayPhaseOverride\s*\(/);
		expect(SRC).toContain('phaseOverride');
	});

	it('dayPhase() consults the override before the derived phase', () => {
		// The function body must check `dayPhaseOverride(day)` and short-circuit
		// when an override exists. We assert via source-parse: the override
		// lookup must appear before the derived `cycleStateForDate` call inside
		// dayPhase().
		const m = SRC.match(/function dayPhase\([\s\S]*?\n\t\}/);
		expect(m, 'dayPhase function body not found').toBeTruthy();
		const body = m![0];
		const overrideIdx = body.indexOf('dayPhaseOverride');
		const derivedIdx = body.indexOf('cycleStateForDate');
		expect(overrideIdx, 'dayPhase must call dayPhaseOverride').toBeGreaterThan(-1);
		expect(derivedIdx, 'dayPhase must fall through to cycleStateForDate').toBeGreaterThan(-1);
		expect(overrideIdx, 'override lookup must come BEFORE derivation').toBeLessThan(derivedIdx);
	});

	it('exports overrideCountThisMonth for the anchor-hint extension', () => {
		expect(SRC).toMatch(/overrideCountThisMonth\s*=/);
		expect(SRC).toContain('cycle.anchor_overrides_count');
	});

	it('day-cell template renders the triangle indicator on override days', () => {
		expect(SRC).toMatch(/phaseIsOverridden\s*=/);
		// Triangle SVG with PHASE_COLORS fill, conditional on phaseIsOverridden
		expect(SRC).toMatch(/\{#if phaseIsOverridden[\s\S]{0,500}polygon[\s\S]{0,200}PHASE_COLORS/);
	});
});

describe('CIPH-886 EntryComposer phase-override section', () => {
	const COMPOSER = readFileSync(
		resolve(__dirname, '..', '..', 'lib', 'components', 'EntryComposer.svelte'),
		'utf8',
	);

	it('declares phaseOverride form state and a cycle-cohort gate', () => {
		expect(COMPOSER).toMatch(/let phaseOverride/);
		expect(COMPOSER).toMatch(/showPhaseOverride\s*=/);
		expect(COMPOSER).toContain("cohort === 'cycle'");
	});

	it('adds phaseOverride to the EntryData payload (omitted when blank)', () => {
		expect(COMPOSER).toMatch(/phaseOverride:\s*phaseOverride\s*\|\|\s*undefined/);
	});

	it('renders a radio group with all four phases plus Automatic', () => {
		expect(COMPOSER).toContain('cycle.phase_override_title');
		expect(COMPOSER).toContain('cycle.phase_override_auto');
		// All four phase tokens must appear in the chip iteration.
		expect(COMPOSER).toMatch(/PHASES_FOR_OVERRIDE.*menstrual.*follicular.*ovulation.*luteal/s);
	});

	it('hydrates phaseOverride from existingDoc with a Phase-type guard', () => {
		expect(COMPOSER).toMatch(/d\.phaseOverride[\s\S]{0,150}PHASES_FOR_OVERRIDE\.includes/);
	});
});
