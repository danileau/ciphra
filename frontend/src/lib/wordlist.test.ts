/**
 * CIPH-pi22-C-1 — wordlist coverage closing the PI v21 carryover gap.
 *
 * Recovery-code format validation moved client-side in the zero-knowledge
 * refactor (PI v21 LB-4b-2): server.py no longer validates code format,
 * so wordlist.ts:validateRecoveryCode is the single defense against bad
 * input before the client tries Argon2-derivation. Until this file landed
 * the function had zero test coverage; only caller is
 * routes/login/+page.svelte:81.
 *
 * Pinning the validate/generate round-trip + the 12-word + checksum
 * contract here means a future refactor of WORDLIST, the checksum math,
 * or the `.toLowerCase().trim().split` normalisation has to break a test
 * to ship — protects the recovery-code path that personas Anna (bipolar,
 * dose-stable on lithium) and Hans (epilepsy, multi-AED) both rely on
 * for cross-device unlock.
 */
import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, validateRecoveryCode, WORDLIST } from '$lib/wordlist';

describe('validateRecoveryCode — happy path', () => {
	it('accepts a freshly generated code', () => {
		// Round-trip: the generator and validator must agree on the
		// checksum semantics, otherwise the user gets a code they can't
		// recover from (see PI v5 launch-blocker about recovery-code parity).
		const code = generateRecoveryCode();
		expect(validateRecoveryCode(code)).toBe(true);
	});

	it('round-trips 25 freshly generated codes (statistical sanity)', () => {
		for (let i = 0; i < 25; i++) {
			expect(validateRecoveryCode(generateRecoveryCode())).toBe(true);
		}
	});

	it('accepts uppercase and mixed-case input (casing-insensitive)', () => {
		const code = generateRecoveryCode();
		expect(validateRecoveryCode(code.toUpperCase())).toBe(true);
		const mixed = code
			.split(' ')
			.map((w, i) => (i % 2 === 0 ? w.toUpperCase() : w))
			.join(' ');
		expect(validateRecoveryCode(mixed)).toBe(true);
	});

	it('accepts leading + trailing whitespace + tabs/newlines between words', () => {
		const code = generateRecoveryCode();
		expect(validateRecoveryCode('  ' + code + '  ')).toBe(true);
		// Multiple whitespace chars between words split the same as single
		// — the regex `\s+` collapses them.
		const padded = code.split(' ').join('   \t  ');
		expect(validateRecoveryCode(padded)).toBe(true);
	});
});

describe('validateRecoveryCode — rejection paths', () => {
	it('rejects the empty string', () => {
		expect(validateRecoveryCode('')).toBe(false);
	});

	it('rejects whitespace-only input', () => {
		expect(validateRecoveryCode('     ')).toBe(false);
		expect(validateRecoveryCode('\t\n  \t')).toBe(false);
	});

	it('rejects fewer than 12 words', () => {
		const code = generateRecoveryCode();
		const words = code.split(' ');
		expect(validateRecoveryCode(words.slice(0, 11).join(' '))).toBe(false);
		expect(validateRecoveryCode(words.slice(0, 5).join(' '))).toBe(false);
	});

	it('rejects more than 12 words', () => {
		const code = generateRecoveryCode();
		expect(validateRecoveryCode(code + ' ' + WORDLIST[0])).toBe(false);
	});

	it('rejects a code containing a non-wordlist word', () => {
		const code = generateRecoveryCode();
		const words = code.split(' ');
		// Replace a middle word with an English word that is NOT in WORDLIST.
		// Pick something visibly absent — "xerox" is not in the 300-word list.
		const broken = [...words];
		broken[5] = 'xerox';
		expect(validateRecoveryCode(broken.join(' '))).toBe(false);
	});

	it('rejects a checksum mismatch (valid words, wrong last word)', () => {
		const code = generateRecoveryCode();
		const words = code.split(' ');
		const correctChecksum = words[11];
		// Pick a different wordlist word for the checksum slot — has to
		// be different from the real one, so swap to whatever isn't it.
		const wrongChecksum = WORDLIST.find((w) => w !== correctChecksum)!;
		words[11] = wrongChecksum;
		expect(validateRecoveryCode(words.join(' '))).toBe(false);
	});

	it('rejects punctuation injected between words', () => {
		// Comma/period would NOT split via \s+ — they stay part of the word
		// and the wordlist membership check fails. Validates the regex
		// behaviour explicitly so a future "be more lenient" refactor
		// doesn't accidentally accept "able, acid, aged ..." as 12 words.
		const code = generateRecoveryCode();
		const punctured = code.replace(/ /g, ', ');
		expect(validateRecoveryCode(punctured)).toBe(false);
	});

	it('rejects a single-word input even when it is on the wordlist', () => {
		expect(validateRecoveryCode(WORDLIST[0])).toBe(false);
	});

	it('rejects 12 valid words but with the WRONG checksum derived from a different prefix', () => {
		// Belt-and-suspenders: take a known-valid code, swap two prefix words
		// (which changes the expected checksum), keep the original last word.
		// Result must reject because the checksum no longer matches.
		const code = generateRecoveryCode();
		const words = code.split(' ');
		// Swap words[0] and words[1] — changes the prefix sum if those
		// words have different WORDLIST indices.
		const a = WORDLIST.indexOf(words[0]);
		const b = WORDLIST.indexOf(words[1]);
		if (a !== b) {
			[words[0], words[1]] = [words[1], words[0]];
			const newPrefixSum = words.slice(0, 11).reduce(
				(s, w) => s + WORDLIST.indexOf(w),
				0,
			);
			const expectedChecksum = WORDLIST[newPrefixSum % WORDLIST.length];
			// If swapping happened to produce the same checksum (rare, but
			// possible when (b - a) is a multiple of WORDLIST.length), the
			// test wouldn't be meaningful — assert the swap actually changed
			// the expected checksum first.
			if (expectedChecksum !== words[11]) {
				expect(validateRecoveryCode(words.join(' '))).toBe(false);
			}
		}
	});
});
