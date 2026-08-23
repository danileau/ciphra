/**
 * AGPL §13 source offer — see `source.ts`.
 *
 * Two things are pinned here. The first is ordinary input handling. The
 * second is the one that matters: no surface may hardcode the upstream
 * repository again. A fork inherits this test, so the moment someone
 * pastes a repo URL back into a component, their own CI tells them the
 * link no longer describes what they are serving.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSourceUrl, sourceLabel, UPSTREAM_SOURCE_URL } from '$lib/source';

describe('resolveSourceUrl', () => {
	it('falls back to upstream when unset', () => {
		expect(resolveSourceUrl(undefined)).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl(null)).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl('')).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl('   ')).toBe(UPSTREAM_SOURCE_URL);
	});

	it('accepts an operator-supplied https URL', () => {
		expect(resolveSourceUrl('https://git.example.org/you/ciphra')).toBe(
			'https://git.example.org/you/ciphra',
		);
	});

	it('accepts http (self-hosted forges on a private network)', () => {
		expect(resolveSourceUrl('http://gitea.lan/you/ciphra')).toBe('http://gitea.lan/you/ciphra');
	});

	it('strips trailing slashes so the label stays stable', () => {
		expect(resolveSourceUrl('https://git.example.org/you/ciphra/')).toBe(
			'https://git.example.org/you/ciphra',
		);
	});

	it('trims surrounding whitespace from a sloppy .env line', () => {
		expect(resolveSourceUrl('  https://git.example.org/you/ciphra  ')).toBe(
			'https://git.example.org/you/ciphra',
		);
	});

	it('rejects a non-absolute value rather than rendering a dead link', () => {
		expect(resolveSourceUrl('git.example.org/you/ciphra')).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl('/source')).toBe(UPSTREAM_SOURCE_URL);
	});

	it('rejects non-http(s) schemes — this value becomes an href', () => {
		// The app holds a decryption key in memory on every authed page.
		// A javascript: href in the footer is not a theoretical concern.
		expect(resolveSourceUrl('javascript:alert(1)')).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl('data:text/html,<script>')).toBe(UPSTREAM_SOURCE_URL);
		expect(resolveSourceUrl('file:///etc/passwd')).toBe(UPSTREAM_SOURCE_URL);
	});
});

describe('sourceLabel', () => {
	it('drops the scheme so the host reads as the host', () => {
		expect(sourceLabel('https://github.com/danileau/ciphra')).toBe('github.com/danileau/ciphra');
		expect(sourceLabel('https://git.example.org/you/ciphra')).toBe('git.example.org/you/ciphra');
	});

	it('drops a trailing slash', () => {
		expect(sourceLabel('https://git.example.org/you/')).toBe('git.example.org/you');
	});

	it('returns the input unchanged when it cannot be parsed', () => {
		expect(sourceLabel('not a url')).toBe('not a url');
	});
});

/** Every `.svelte` / `.ts` under src/, except this module and its test. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			sourceFiles(full, acc);
		} else if (/\.(svelte|ts)$/.test(entry)) {
			acc.push(full);
		}
	}
	return acc;
}

describe('AGPL §13 — no surface hardcodes the upstream repository', () => {
	const SRC = join(__dirname, '..');
	// source.ts is where the fallback legitimately lives; this test file
	// names the URL in its own assertions.
	const EXEMPT = [join(SRC, 'lib', 'source.ts'), join(SRC, 'lib', 'source.test.ts')];

	it('renders the configured URL instead of a literal repo link', () => {
		const offenders = sourceFiles(SRC)
			.filter((f) => !EXEMPT.includes(f))
			.filter((f) => /github\.com\/danileau\/ciphra/.test(readFileSync(f, 'utf8')))
			.map((f) => f.slice(SRC.length + 1));

		expect(
			offenders,
			`These files hardcode the upstream repository. On a fork they would tell users\n` +
				`to inspect code that is not what the fork is serving — AGPL §13 requires the\n` +
				`source of THIS deployment. Import { sourceUrl } from '$lib/source' instead.\n` +
				`Offending files:\n  ${offenders.join('\n  ')}\n`,
		).toEqual([]);
	});
});
