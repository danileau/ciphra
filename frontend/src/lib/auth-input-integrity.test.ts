/**
 * What the user types is what gets derived (2026-09-16).
 *
 * A login with correct credentials failed on iOS Brave (audit: LOGIN_FAILED,
 * right user) and succeeded in a private tab. The server and the derivation
 * were fine; the string reaching Argon2 was not what was meant. Two causes:
 *
 * - Phone keyboards alter text inputs (capitalize, autocorrect, smart
 *   punctuation) unless told not to, and password managers fill the wrong
 *   saved entry without `autocomplete` hints.
 * - Word codes (recovery, family) were validated case-insensitively but
 *   derived from the raw string, so "Able acid …" passed validation and then
 *   derived the wrong key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalWordCode, generateRecoveryCode, validateRecoveryCode } from './wordlist';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('word codes derive from one canonical spelling', () => {
	it('lowercases and collapses whitespace, leaving generated codes unchanged', () => {
		const code = generateRecoveryCode();
		expect(canonicalWordCode(code)).toBe(code);
		const typed = `  ${code.split(' ').map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join('  ')} `;
		expect(validateRecoveryCode(typed)).toBe(true);
		expect(canonicalWordCode(typed)).toBe(code);
	});

	it('recovery and family keys are derived from the canonical code, not the raw input', () => {
		const crypto = read('lib/crypto.ts');
		expect(crypto).toMatch(/deriveArgon2Key\(\s*canonicalWordCode\(recoveryCode\), salt, `:\$\{username\}:RECOVERY`, params/);
		expect(crypto).toMatch(/deriveArgon2Key\(canonicalWordCode\(familyCode\), salt, ':FAMILY', params\)/);
		expect(crypto).not.toMatch(/recoveryCode\.trim\(\)|familyCode\.trim\(\)/);
	});
});

describe('credential inputs are not altered by keyboards and are labelled for password managers', () => {
	const NO_MANGLE = /autocapitalize="off"\s+autocorrect="off"\s+spellcheck="false"/;

	const cases: Array<[string, RegExp, RegExp | null]> = [
		['lib/components/LoginForm.svelte', /id="login-user"[\s\S]*?\/>/, /autocomplete="username"/],
		['lib/components/SignupFlow.svelte', /id="signup-user"[\s\S]*?\/>/, /autocomplete="username"/],
		['routes/login/+page.svelte', /id="rec-user"[\s\S]*?\/>/, /autocomplete="username"/],
		['routes/login/+page.svelte', /id="rec-code"[\s\S]*?\/>/, null],
		['routes/join/[grantId]/+page.svelte', /bind:value=\{sourceUsername\}[\s\S]*?\/>/, null],
		['lib/components/LinkedAccounts.svelte', /bind:value=\{sourceUsername\}[\s\S]*?\/>/, null],
		['lib/components/LinkedAccounts.svelte', /bind:value=\{familyCode\}[\s\S]*?\/>/, null],
	];
	for (const [file, field, hint] of cases) {
		it(`${file} ${field.source.slice(0, 30)}`, () => {
			const m = field.exec(read(file));
			expect(m, 'field not found').toBeTruthy();
			expect(m![0]).toMatch(NO_MANGLE);
			if (hint) expect(m![0]).toMatch(hint);
		});
	}

	it('login asks for the current password; recovery and change ask for a new one', () => {
		expect(read('lib/components/LoginForm.svelte')).toMatch(/id="login-pass"[\s\S]*?autocomplete="current-password"/);
		const login = read('routes/login/+page.svelte');
		expect(login).toMatch(/id="rec-new-pass"\s+autocomplete="new-password"/);
		expect(login).toMatch(/id="rec-new-pass2"\s+autocomplete="new-password"/);
		expect(read('routes/settings/+page.svelte')).toMatch(/bind:value=\{currentPassword\}[\s\S]*?autocomplete="current-password"/);
	});
});
