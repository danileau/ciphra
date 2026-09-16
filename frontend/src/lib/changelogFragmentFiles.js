// @ts-check
/**
 * Reading changelog.d/ from disk — the only file access the changelog
 * fragments need, kept apart from the pure compiler in changelogFragments.js.
 * Node-only: imported by vite.config.ts (build time) and scripts/changelog.mjs,
 * never by code that ships to the browser.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The directory's explainer, not an entry. */
export const FRAGMENT_README = 'README.md';

/**
 * Every fragment in `dir`, sorted by name. Missing directory = none. A file
 * that vanishes mid-read (an editor saving) is skipped rather than thrown.
 *
 * @param {string} dir
 * @returns {Array<{ name: string, text: string }>}
 */
export function readFragments(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name !== FRAGMENT_README && !name.startsWith('.'))
		.sort()
		.flatMap((name) => {
			try {
				return [{ name, text: readFileSync(join(dir, name), 'utf8') }];
			} catch {
				return [];
			}
		});
}
