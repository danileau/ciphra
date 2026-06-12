/**
 * Dynamic sitemap (SEO foundation 2026-06-12).
 *
 * Lists the PUBLIC, crawlable surfaces only — the marketing landing, the
 * per-condition catalogue, the public docs, and the legal pages. The
 * signed-in app is deliberately excluded (it returns an auth-gated shell
 * with no content; also disallowed in robots.txt).
 *
 * Locale note: ciphra is multilingual at runtime (de/en/fr/it) but serves
 * every language from the same URL (locale is a client-side preference,
 * not a path segment). Until URL-addressable locales land, the sitemap
 * lists one canonical URL per page and declares no hreflang alternates —
 * claiming alternates that don't have distinct URLs would mislead
 * crawlers. See the SEO plan / OPERATIONS follow-ups.
 */
import { docList } from '$lib/docs';
import { conditionInfoMap } from '$lib/conditionInfo';

const BASE = 'https://ciphra.ch';

export const prerender = true;

type Entry = { path: string; changefreq: string; priority: string };

export function GET() {
	const staticPages: Entry[] = [
		{ path: '/', changefreq: 'weekly', priority: '1.0' },
		{ path: '/privacy', changefreq: 'monthly', priority: '0.5' },
		{ path: '/terms', changefreq: 'monthly', priority: '0.5' },
		{ path: '/protocol', changefreq: 'monthly', priority: '0.4' },
		{ path: '/docs', changefreq: 'monthly', priority: '0.4' },
	];

	const conditionPages: Entry[] = Object.keys(conditionInfoMap).map((id) => ({
		path: `/conditions/${id}`,
		changefreq: 'monthly',
		priority: '0.7',
	}));

	const docPages: Entry[] = docList.map((d) => ({
		path: `/docs/${d.slug}`,
		changefreq: 'monthly',
		priority: '0.3',
	}));

	const all = [...staticPages, ...conditionPages, ...docPages];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all
	.map(
		(e) =>
			`  <url><loc>${BASE}${e.path}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
	)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
