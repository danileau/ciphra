/**
 * CIPH-pi20-LB-2 — `auth.clearLocalCache()` contract.
 *
 * The wipe-without-logout invariant: same on-disk wipe path as
 * logout (IndexedDB plaintext cache + SW navigation cache) but
 * MUST leave session state intact (in-memory + localStorage +
 * sessionStorage all untouched).
 *
 * This is a doc-vs-code anchor — SECURITY.md "What the browser
 * stores" tells users the button exists and exactly what it does.
 * If this test breaks, the doc is lying.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUTH = readFileSync(join(__dirname, 'auth.ts'), 'utf8');
const SETTINGS = readFileSync(
	join(__dirname, '..', '..', 'routes', 'settings', '+page.svelte'),
	'utf8',
);

describe('CIPH-pi20-LB-2 auth.clearLocalCache contract', () => {
	it('exists as an async method on the auth store', () => {
		expect(AUTH).toMatch(/async clearLocalCache\(\)/);
	});

	it('awaits clearAllPartitions (IndexedDB wipe)', () => {
		expect(AUTH).toMatch(
			/clearLocalCache\(\)[\s\S]{0,400}await m\.clearAllPartitions\(\)/,
		);
	});

	it('purges every cache key starting with ciphra- (SW cache parity with logout)', () => {
		expect(AUTH).toMatch(
			/clearLocalCache\(\)[\s\S]{0,800}keys\.filter\(\(k\)\s*=>\s*k\.startsWith\('ciphra-'\)\)\.map\(\(k\)\s*=>\s*caches\.delete\(k\)\)/,
		);
	});

	it('does NOT touch in-memory auth state, localStorage, or sessionStorage', () => {
		// Match the function body and assert these mutations are absent.
		const bodyMatch = AUTH.match(/async clearLocalCache\(\)\s*\{([\s\S]*?)\n\t\t\}/);
		expect(bodyMatch, 'expected clearLocalCache body').toBeTruthy();
		const body = bodyMatch![1];
		expect(body).not.toMatch(/set\(emptyState/);
		expect(body).not.toMatch(/localStorage\.removeItem/);
		expect(body).not.toMatch(/sessionStorage\.removeItem/);
	});
});

describe('CIPH-pi20-LB-2 settings UI wiring', () => {
	it('imports + uses the auth store clearLocalCache method', () => {
		expect(SETTINGS).toMatch(/auth\.clearLocalCache\(\)/);
	});

	it('renders a clear-cache button with stable test id', () => {
		expect(SETTINGS).toMatch(/data-testid="clear-local-cache"/);
	});

	it('renders the section under the local-data heading id', () => {
		expect(SETTINGS).toMatch(/aria-labelledby="settings-local-data-heading"/);
	});

	it('shows count / empty / loading states gated on cachedDocCount', () => {
		expect(SETTINGS).toMatch(/cachedDocCount === null/);
		expect(SETTINGS).toMatch(/cachedDocCount === 0/);
		expect(SETTINGS).toMatch(/settings\.local_data_count/);
	});

	it('disables the button only while wiping is in flight (always-available privacy action)', () => {
		// 2026-06-07 — the earlier `cachedDocCount === 0` half of the
		// disabled gate was dropped. Three reasons captured in the
		// settings/+page.svelte block comment: it read as a broken
		// trust signal, the count was non-reactive and stale, and the
		// action also purges the SW cache (which can hold assets even
		// when IndexedDB is empty). Keeping `clearingCache` so a
		// double-click during the wipe is still bounced.
		expect(SETTINGS).toMatch(/disabled=\{clearingCache\}/);
		expect(SETTINGS).not.toMatch(/disabled=\{clearingCache \|\| cachedDocCount === 0\}/);
	});

	it('refreshes the count on mount', () => {
		expect(SETTINGS).toMatch(/onMount\([\s\S]{0,500}refreshCachedCount\(\)/);
	});
});

describe('CIPH-pi20-LB-2 i18n', () => {
	const KEYS = [
		'settings.local_data',
		'settings.local_data_desc',
		'settings.local_data_loading',
		'settings.local_data_empty',
		'settings.local_data_count',
		'settings.local_data_clear',
		'settings.local_data_cleared',
	] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every clear-cache key present + non-empty`, async () => {
			const mod = await import(`../i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
				expect(dict[k]!.trim().length).toBeGreaterThan(0);
			}
			expect(dict['settings.local_data_count']!).toMatch(/\{count\}/);
		});
	}
});

describe('CIPH-pi20-LB-2 SECURITY.md and code agree', () => {
	const SECURITY = readFileSync(
		join(__dirname, '..', '..', '..', '..', 'SECURITY.md'),
		'utf8',
	);

	it('SECURITY.md "What the browser stores" section discusses IndexedDB plaintext', () => {
		expect(SECURITY).toMatch(/What the browser stores/);
		expect(SECURITY).toMatch(/IndexedDB[\s\S]{0,500}plaintext/i);
	});

	it('SECURITY.md cites the wipe code path', () => {
		expect(SECURITY).toMatch(/clearAllPartitions/);
	});
});
