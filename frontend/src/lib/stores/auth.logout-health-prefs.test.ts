/**
 * Logout removes the localStorage values derived from health data.
 *
 * `ciphra_vital_targets:<username>` (setup wizard targets — a blood-pressure
 * goal says what is being treated) and `ciphra_quickadd_last_episode` (an
 * episode type id names the condition) survived logout in plaintext, readable
 * by the next person on the device. SECURITY_MODEL.md filed them under "no
 * health data" — it did not list them at all.
 *
 * Also pins that a caregiver's own targets are not drawn on a linked
 * patient's PDF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/idb', () => ({ clearAllPartitions: vi.fn(async () => {}) }));

describe('auth.logout — health-derived preferences', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it('removes vital targets (every user on the device) and the last quick-add episode', async () => {
		localStorage.setItem('ciphra_auth', JSON.stringify({ token: 't', username: 'hans' }));
		localStorage.setItem('ciphra_vital_targets:hans', '{"bp_sys":130}');
		localStorage.setItem('ciphra_vital_targets:eva', '{"glucose":6}');
		localStorage.setItem('ciphra_quickadd_last_episode', 'tonic_clonic');
		localStorage.setItem('ciphra_theme', 'dark');
		localStorage.setItem('ciphra_locale', 'fr');

		const { auth } = await import('./auth');
		await auth.logout();

		expect(localStorage.getItem('ciphra_vital_targets:hans')).toBeNull();
		expect(localStorage.getItem('ciphra_vital_targets:eva')).toBeNull();
		expect(localStorage.getItem('ciphra_quickadd_last_episode')).toBeNull();
		// Plain preferences stay.
		expect(localStorage.getItem('ciphra_theme')).toBe('dark');
		expect(localStorage.getItem('ciphra_locale')).toBe('fr');
	});

	it('SECURITY_MODEL.md names every key it removes', async () => {
		const { HEALTH_PREF_KEYS, HEALTH_PREF_PREFIXES } = await import('./auth');
		const doc = readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'SECURITY_MODEL.md'), 'utf8');
		const section = doc.slice(doc.indexOf('### 5. Small preference'), doc.indexOf('### What this means in practice'));
		for (const k of HEALTH_PREF_KEYS) expect(section).toContain(k);
		for (const p of HEALTH_PREF_PREFIXES) expect(section).toContain(p);
		expect(section).toMatch(/Removed on logout/);
	});
});

describe('doctor PDF in a linked vault', () => {
	it('does not apply the logged-in caregiver\'s vital targets', () => {
		const reports = readFileSync(join(__dirname, '..', '..', 'routes', 'reports', '+page.svelte'), 'utf8');
		expect(reports).toMatch(/const targetsOf = \$activeVault === null \? username : ''/);
		expect(reports).toMatch(/generateDoctorPdf\(bp, docs, year, month, \$t, \$locale, username, scope, targetsOf\)/);
		const pdf = readFileSync(join(__dirname, '..', 'pdf.ts'), 'utf8');
		expect(pdf).toMatch(/applyVitalTargetOverrides\(blueprintIn, vitalTargetsOf\)/);
	});
});
