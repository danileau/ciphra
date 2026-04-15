/**
 * CIPH-883 — Reports jump-to-current-month pill. Mirror of CIPH-878
 * (calendar). Pin via source-parse so the shortcut can't be silently
 * removed — both surfaces must offer the same affordance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-883 reports jump-to-today', () => {
	it('defines jumpToCurrentMonth() that resets currentDate to day 1', () => {
		expect(SOURCE).toMatch(/function jumpToCurrentMonth\(\)/);
		expect(SOURCE).toMatch(/currentDate = `\$\{now\.getFullYear\(\)\}-/);
	});

	it('derives isOnCurrentMonth reactively', () => {
		expect(SOURCE).toMatch(/\$:\s*isOnCurrentMonth\s*=/);
	});

	it('pill only renders when off the current month', () => {
		expect(SOURCE).toMatch(/\{#if !isOnCurrentMonth\}[\s\S]{0,200}rpt-today-btn/);
	});

	it('uses common.today i18n (parity with calendar)', () => {
		expect(SOURCE).toMatch(/\$t\('common\.today'\)/);
	});

	it('wires the button to jumpToCurrentMonth', () => {
		expect(SOURCE).toMatch(/on:click=\{jumpToCurrentMonth\}/);
	});
});
