/**
 * CIPH-878 — Calendar "Heute / Today" jump-to-current-month pill.
 * Source-parse contract — the button must (a) exist, (b) hide when on
 * today's month, (c) call jumpToToday(), (d) use the shared common.today
 * i18n key. Pinning keeps regressions from silently removing the shortcut.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-878 jump-to-today', () => {
	it('defines jumpToToday() that resets year/month and focus', () => {
		expect(SOURCE).toMatch(/function jumpToToday\(\)/);
		expect(SOURCE).toMatch(/currentYear = now\.getFullYear\(\)/);
		expect(SOURCE).toMatch(/currentMonth = now\.getMonth\(\)/);
		expect(SOURCE).toMatch(/focusedDay = now\.getDate\(\)/);
	});

	it('clears selectedDate so the day-detail sheet does not auto-open', () => {
		expect(SOURCE).toMatch(/function jumpToToday\(\)[\s\S]{0,300}selectedDate = null/);
	});

	it('derives isOnCurrentMonth reactively from today', () => {
		expect(SOURCE).toMatch(/\$:\s*isOnCurrentMonth\s*=/);
	});

	it('renders the pill only when off the current month', () => {
		expect(SOURCE).toMatch(/\{#if !isOnCurrentMonth\}[\s\S]{0,200}cal-today-btn/);
	});

	it('uses the shared common.today i18n key, not a bespoke string', () => {
		expect(SOURCE).toMatch(/\$t\('common\.today'\)/);
	});

	it('wires the button onClick to jumpToToday', () => {
		expect(SOURCE).toMatch(/on:click=\{jumpToToday\}/);
	});
});
