/**
 * CIPH-891 — Palette migration audit.
 *
 * Asserts the cohort-aware semantic tokens (`--accent`, `--accent-info`,
 * `--accent-calm`, `--accent-neutral` and their `-rgb` siblings) are
 * declared in `app.css` and overridden under each `[data-cohort="X"]`
 * scope. Migration consumers route through these tokens so most chrome
 * inherits cohort identity automatically without per-call-site changes.
 *
 * Also asserts the `--cohort-X-N-rgb` triples in `app.css` agree
 * numerically with `cohortPalette.ts:COHORT_PALETTE_RGB`.
 *
 * The CIPH-890 vitest already covers the JS-side palette contract; this
 * file is the CSS-side complement.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	ALL_COHORTS_PALETTE,
	COHORT_PALETTE_RGB,
} from './cohortPalette';

const APP_CSS = readFileSync(
	resolve(__dirname, '..', 'app.css'),
	'utf8',
);

const ACCENT_TOKENS = [
	'--accent',
	'--accent-rgb',
	'--accent-info',
	'--accent-info-rgb',
	'--accent-calm',
	'--accent-calm-rgb',
	'--accent-neutral',
	'--accent-neutral-rgb',
] as const;

describe('CIPH-891 — accent semantic tokens declared in :root', () => {
	it.each(ACCENT_TOKENS)('%s is declared with a value', (token) => {
		// Match `<token>:` followed by anything up to a `;` on the same
		// or next line. Robust against indentation + multiline values.
		const re = new RegExp(`${token}:\\s*[^;]+;`);
		expect(
			re.test(APP_CSS),
			`Expected \`${token}:\` declaration in app.css.`,
		).toBe(true);
	});
});

describe('CIPH-891 — every cohort has a [data-cohort] accent override block', () => {
	it.each(ALL_COHORTS_PALETTE)(
		'cohort %s declares all 8 accent tokens under [data-cohort="%s"]',
		(cohort) => {
			// Capture the body of the `[data-cohort="X"] { ... }` block.
			const re = new RegExp(
				`\\[data-cohort="${cohort}"\\]\\s*\\{([\\s\\S]*?)\\}`,
			);
			const match = APP_CSS.match(re);
			expect(
				match,
				`Missing \`[data-cohort="${cohort}"] { ... }\` selector block in app.css.`,
			).not.toBeNull();
			const body = match![1];
			for (const token of ACCENT_TOKENS) {
				const tokenRe = new RegExp(`${token}:\\s*[^;]+;`);
				expect(
					tokenRe.test(body),
					`[data-cohort="${cohort}"] missing \`${token}:\` override.`,
				).toBe(true);
			}
		},
	);
});

describe('CIPH-891 — cohort RGB triples in app.css match COHORT_PALETTE_RGB', () => {
	it.each(ALL_COHORTS_PALETTE)(
		'cohort %s rgb declarations match the JS matrix',
		(cohort) => {
			const triples = COHORT_PALETTE_RGB[cohort];
			for (let i = 0; i < 6; i++) {
				const [r, g, b] = triples[i];
				const slot = i + 1;
				const re = new RegExp(
					`--cohort-${cohort}-${slot}-rgb:\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*;`,
				);
				expect(
					re.test(APP_CSS),
					`app.css missing or stale \`--cohort-${cohort}-${slot}-rgb: ${r}, ${g}, ${b};\`.`,
				).toBe(true);
			}
		},
	);
});

describe('CIPH-891 — high-leverage primitives migrated to --accent', () => {
	// These are the chrome primitives migrated in CIPH-891. Each test
	// asserts the source contains a `var(--accent)` reference, proving
	// the migration landed and didn't get reverted.
	const PRIMITIVE_FILES = [
		'app.css',
		'lib/components/Button.svelte',
		'lib/components/BottomNav.svelte',
	];
	const SRC_ROOT = resolve(__dirname, '..');
	it.each(PRIMITIVE_FILES)(
		'%s references var(--accent) at least once',
		(rel) => {
			const src = readFileSync(resolve(SRC_ROOT, rel), 'utf8');
			expect(
				src,
				`${rel} should consume \`var(--accent)\` so chrome reflects ` +
					`cohort identity. Migration may have been reverted.`,
			).toMatch(/var\(--accent\)/);
		},
	);
});
