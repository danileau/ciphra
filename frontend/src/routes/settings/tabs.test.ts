/**
 * CIPH-857 — Settings tabs enforcement.
 *
 * Ensures the three tabs (account/tracking/sharing) stay wired and
 * that i18n keys exist in every locale. Static parse rather than
 * component render to keep fast.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '../../lib/i18n/de';
import en from '../../lib/i18n/en';
import fr from '../../lib/i18n/fr';
import itLocale from '../../lib/i18n/it';

const SETTINGS_PATH = join(__dirname, '+page.svelte');
const source = readFileSync(SETTINGS_PATH, 'utf8');

const TABS = ['account', 'tracking', 'sharing'] as const;

describe('CIPH-857 settings tabs', () => {
	it.each(TABS)('declares tabpanel for %s', (tab) => {
		expect(source).toContain(`id="tabpanel-${tab}"`);
		expect(source).toContain(`aria-labelledby="tab-${tab}"`);
	});

	it('uses the Tabs primitive', () => {
		expect(source).toContain("import Tabs from '$lib/components/Tabs.svelte'");
		expect(source).toMatch(/<Tabs[\s\S]*?onSelect={selectTab}/);
	});

	it('has the query-param driven tab state', () => {
		expect(source).toContain("searchParams.get('tab')");
	});

	it.each(TABS)('tab label key exists in every locale: %s', (tab) => {
		const key = `settings.tab_${tab}` as const;
		expect(de[key], `de missing ${key}`).toBeTruthy();
		expect(en[key], `en missing ${key}`).toBeTruthy();
		expect(fr[key], `fr missing ${key}`).toBeTruthy();
		expect(itLocale[key], `it missing ${key}`).toBeTruthy();
	});

	it('primary surface override i18n keys exist in every locale', () => {
		const keys = [
			'settings.primary_surface_title',
			'settings.primary_surface_desc',
			'settings.primary_surface_auto',
			'settings.primary_surface_journal',
			'settings.primary_surface_calendar',
			'settings.primary_surface_trend',
		] as const;
		for (const k of keys) {
			expect(de[k], `de missing ${k}`).toBeTruthy();
			expect(en[k], `en missing ${k}`).toBeTruthy();
			expect(fr[k], `fr missing ${k}`).toBeTruthy();
			expect(itLocale[k], `it missing ${k}`).toBeTruthy();
		}
	});

	it('placebo primary-surface UI stays hidden until a consumer exists', () => {
		// Design review 2026-06-11: the select wrote
		// blueprint.primaryBrowseSurface but getPrimaryBrowseSurface() has
		// zero runtime consumers — the control changed nothing. It comes
		// back in the same PR that ships a real consumer; until then its
		// reappearance without one is a regression.
		expect(source).not.toContain('primary-surface-select');
		expect(source).not.toContain('setPrimarySurface');
	});

	it('danger zone stays in account tab (not removed)', () => {
		expect(source).toContain('settings.delete_account');
		expect(source).toContain('settings.section_danger');
	});
});
