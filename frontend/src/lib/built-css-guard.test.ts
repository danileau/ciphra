/**
 * Built-CSS guard (2026-06-12) — the dark-header lesson.
 *
 * lightningcss (Vite's CSS transformer) dedups identical-selector rules
 * and ignores `!important` doing it: the `.bg-white\/95` dark-theme
 * override was silently deleted from every prod build while dev mode
 * (no lightningcss) looked perfect — the authed header shipped
 * white-on-dark in v0.2.0. Unit tests and dev-server smoke are
 * structurally blind to this class of bug; only the build artifact
 * tells the truth.
 *
 * This test inspects the BUILT stylesheet. It requires build output to
 * exist and SKIPS otherwise (vitest runs shouldn't force a 30s build).
 * CI must run it after `npm run build` — wire as a dedicated post-build
 * step in the CI/CD pipeline so the skip never hides it there.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = join(__dirname, '../../.svelte-kit/output/client/_app/immutable/assets');

const builtCss = (): string | null => {
	if (!existsSync(ASSETS)) return null;
	return readdirSync(ASSETS)
		.filter((f) => f.endsWith('.css'))
		.map((f) => readFileSync(join(ASSETS, f), 'utf-8'))
		.join('\n');
};

describe('built CSS keeps the theme overrides (lightningcss dedup guard)', () => {
	const css = builtCss();

	it.skipIf(css === null)('the bg-white/95 dark override survives the build', () => {
		// The themed rule must exist…
		expect(css!).toMatch(/\.bg-white\\\/95\{background-color:rgba\(var\(--surface-card-rgb\)/);
		// …and must come AFTER any literal-white utility for the same
		// selector, so it wins regardless of which rule a dedup keeps.
		const themed = css!.search(/\.bg-white\\\/95\{background-color:rgba\(var\(--surface-card-rgb\)/);
		const literal = css!.search(/\.bg-white\\\/95\{background-color:#fffff{2,3}\w*\}/);
		if (literal !== -1) expect(themed).toBeGreaterThan(literal);
	});

	it.skipIf(css === null)('the dark surface tokens are present', () => {
		expect(css!).toContain('--surface-card-rgb:34, 28, 23');
	});
});
