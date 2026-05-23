import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LEGACY_KEYS, sweepLegacyLocalStorage } from './legacy-cleanup';

const SENTINEL = 'ciphra_legacy_swept_v1';

function clearAll() {
	localStorage.clear();
}

describe('sweepLegacyLocalStorage', () => {
	beforeEach(clearAll);
	afterEach(clearAll);

	it('removes every legacy key when present', () => {
		for (const k of LEGACY_KEYS) localStorage.setItem(k, 'x');
		const result = sweepLegacyLocalStorage();
		expect(result.alreadySwept).toBe(false);
		expect(result.removed.sort()).toEqual([...LEGACY_KEYS].sort());
		for (const k of LEGACY_KEYS) expect(localStorage.getItem(k)).toBeNull();
		expect(localStorage.getItem(SENTINEL)).toBe('1');
	});

	it('is a no-op when the sentinel is already set', () => {
		localStorage.setItem(SENTINEL, '1');
		localStorage.setItem('masterKey', 'should-stay');
		const result = sweepLegacyLocalStorage();
		expect(result.alreadySwept).toBe(true);
		expect(result.removed).toEqual([]);
		expect(localStorage.getItem('masterKey')).toBe('should-stay');
	});

	it('only reports keys that were actually present', () => {
		localStorage.setItem('masterKey', 'x');
		const result = sweepLegacyLocalStorage();
		expect(result.removed).toEqual(['masterKey']);
	});

	it('does not touch active ciphra keys', () => {
		const active = [
			'ciphra_locale',
			'ciphra_auth',
			'ciphra_fab_seen_count',
			'ciphra_quickadd_last_mode',
			'ciphra_migrate_tour_seen',
		];
		for (const k of active) localStorage.setItem(k, 'live');
		for (const k of LEGACY_KEYS) localStorage.setItem(k, 'dead');
		sweepLegacyLocalStorage();
		for (const k of active) expect(localStorage.getItem(k)).toBe('live');
		for (const k of LEGACY_KEYS) expect(localStorage.getItem(k)).toBeNull();
	});

	it('LEGACY_KEYS never overlaps with the current key namespace', () => {
		for (const k of LEGACY_KEYS) {
			// Current keys are either prefixed `ciphra_` for active client state
			// or the sentinel itself. The legacy set is the explicit allowlist of
			// historical names we sweep — if anyone adds a `ciphra_*` key here it
			// would risk deleting live data.
			if (k.startsWith('ciphra_')) {
				expect(k).toBe('ciphra_dark'); // the only legacy ciphra_-prefixed key
			}
		}
	});
});
