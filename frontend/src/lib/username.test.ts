import { describe, it, expect } from 'vitest';
import { canonicalUsername, describeUsername, isValidUsername } from './username';

describe('canonicalUsername', () => {
	it('leaves every valid username exactly as it is', () => {
		// Backward compatibility: an existing account must map to itself.
		for (const u of ['abc', 'anna_k', 'user_2026', 'a'.repeat(64), '___', '007']) {
			expect(canonicalUsername(u)).toBe(u);
		}
	});

	it('keeps the old trim + lowercase', () => {
		expect(canonicalUsername('  Anna_K ')).toBe('anna_k');
	});

	it('removes invisible format characters that trim() keeps', () => {
		expect(canonicalUsername('anna​_k')).toBe('anna_k');
		expect(canonicalUsername('⁠anna_k‍')).toBe('anna_k');
		expect(canonicalUsername('an­na_k')).toBe('anna_k');
	});

	it('folds fullwidth letters to ASCII', () => {
		expect(canonicalUsername('ａｎｎａ_ｋ')).toBe('anna_k');
	});

	it('does not invent a username out of something that is not one', () => {
		expect(isValidUsername(canonicalUsername('anna.k'))).toBe(false);
		expect(isValidUsername(canonicalUsername('anna@example.ch'))).toBe(false);
		expect(isValidUsername(canonicalUsername('able acid aged'))).toBe(false);
		expect(isValidUsername(canonicalUsername(''))).toBe(false);
		expect(isValidUsername(canonicalUsername('a'.repeat(65)))).toBe(false);
	});
});

describe('describeUsername', () => {
	it('names length and code points, never the value', () => {
		const text = describeUsername('anna@example.ch');
		expect(text).toBe('username: 15 characters; not allowed: U+0040, U+002E');
		expect(text).not.toContain('anna');
	});

	it('counts repeats', () => {
		expect(describeUsername('able acid aged')).toBe('username: 14 characters; not allowed: U+0020 ×2');
	});

	it('says only the length when nothing is wrong with the characters', () => {
		expect(describeUsername('')).toBe('username: 0 characters');
	});
});
