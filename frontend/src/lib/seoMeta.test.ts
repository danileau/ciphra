/**
 * Public-page head metadata (lib/seoMeta.ts). The root layout renders
 * this outside its auth gate so it reaches the SSR HTML — these pin that
 * every public page gets its own title and a SELF-referencing canonical
 * (a site-wide canonical=/ once folded every page into the homepage).
 */
import { describe, it, expect } from 'vitest';
import de from './i18n/de';
import { publicMeta, jsonLdScript, SITE_ORIGIN } from './seoMeta';
import { conditionInfoMap } from './conditionInfo';
import { docList } from './docs';

const tr = (k: string) => (de as Record<string, string>)[k] ?? k;

describe('publicMeta', () => {
	const publicPaths = [
		'/',
		'/privacy',
		'/terms',
		'/docs',
		...Object.keys(conditionInfoMap).map((id) => `/conditions/${id}`),
		...docList.map((d) => `/docs/${d.slug}`),
	];

	it.each(publicPaths)('%s has a title and a self canonical', (path) => {
		const meta = publicMeta(path, tr);
		expect(meta).not.toBeNull();
		expect(meta!.title).toMatch(/ciphra/);
		expect(meta!.canonical).toBe(`${SITE_ORIGIN}${path}`);
	});

	it('resolves every i18n key it uses (no raw keys leak into titles)', () => {
		for (const path of publicPaths) {
			const meta = publicMeta(path, tr)!;
			expect(meta.title).not.toMatch(/\b[a-z_]+\.[a-z_.]+\b/);
			if (meta.description) expect(meta.description).not.toMatch(/^[a-z_]+\.[a-z_.]+$/);
		}
	});

	it('gives every condition page a distinct title', () => {
		const titles = Object.keys(conditionInfoMap).map((id) => publicMeta(`/conditions/${id}`, tr)!.title);
		expect(new Set(titles).size).toBe(titles.length);
	});

	it('strips a trailing slash from the canonical', () => {
		expect(publicMeta('/privacy/', tr)!.canonical).toBe(`${SITE_ORIGIN}/privacy`);
	});

	it.each(['/login', '/journal', '/settings', '/log/today', '/conditions/nope', '/conditions/__proto__', '/docs/nope'])(
		'%s is not a public page',
		(path) => {
			expect(publicMeta(path, tr)).toBeNull();
		},
	);
});

describe('jsonLdScript', () => {
	it('escapes a closing script tag inside a value', () => {
		const out = jsonLdScript({ name: '</script><script>alert(1)</script>' });
		expect(out.match(/<\/script>/g)).toHaveLength(1);
	});
});
