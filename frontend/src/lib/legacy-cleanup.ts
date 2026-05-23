/**
 * One-shot legacy-localStorage sweep.
 *
 * Some ciphra deployments accumulated localStorage entries from a pre-
 * zero-knowledge proof-of-concept build (client-side CryptoJS vault, bare
 * `masterKey` / `username` keys). Those entries are harmless today (no
 * current code reads them), but `masterKey` in particular reads as a
 * security smell at first glance — anyone opening devtools wonders why
 * an end-to-end-encrypted app is parking a 32-byte hex string in plain
 * localStorage. The current key actually lives in **sessionStorage** under
 * `ciphra_master_key`; this sweep removes the legacy squatter.
 *
 * Sentinel `ciphra_legacy_swept_v1` means we only sweep once per browser.
 * Bump the version suffix if a future build needs a second sweep — the
 * `_v1` key stays so older browsers don't re-run this sweep.
 */
const SENTINEL = 'ciphra_legacy_swept_v1';

/**
 * Dead keys to remove. Keep this list narrow: only entries we are
 * confident were written by an obsolete build and that no current code
 * references. Active keys live in `+layout.svelte`, `api.ts`,
 * `stores/auth.ts`, `migrate/+page.svelte`, etc.
 */
export const LEGACY_KEYS: readonly string[] = Object.freeze([
	'ciphra_dark',   // dark-mode toggle, dropped in the pre-launch batch
	'masterKey',     // pre-zero-knowledge: key in plain localStorage
	'user_admin',    // pre-zero-knowledge: CryptoJS-encrypted vault blob
	'username',      // pre-zero-knowledge: bare top-level username
]);

export function sweepLegacyLocalStorage(): { removed: string[]; alreadySwept: boolean } {
	if (typeof localStorage === 'undefined') return { removed: [], alreadySwept: false };
	try {
		if (localStorage.getItem(SENTINEL) === '1') {
			return { removed: [], alreadySwept: true };
		}
		const removed: string[] = [];
		for (const k of LEGACY_KEYS) {
			if (localStorage.getItem(k) !== null) {
				localStorage.removeItem(k);
				removed.push(k);
			}
		}
		localStorage.setItem(SENTINEL, '1');
		return { removed, alreadySwept: false };
	} catch {
		// Private mode / quota / disabled — silent no-op.
		return { removed: [], alreadySwept: false };
	}
}
