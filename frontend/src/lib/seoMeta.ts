/**
 * Head metadata for the PUBLIC pages (landing, condition pages, legal,
 * docs), rendered by the root layout's <svelte:head>.
 *
 * Why the layout and not each page: the layout gates its slot behind
 * `$authReady`, which is never true during SSR, so a page's own
 * <svelte:head> never reaches the server HTML. Crawlers got no <title>,
 * and the site-wide `canonical=/` in app.html folded every sub-page into
 * the homepage. The layout's head sits outside that gate, so metadata
 * resolved here is in the HTML a crawler fetches.
 *
 * The server has no user locale (it lives in localStorage), so SSR passes
 * the `de` dictionary — German is the default and the first market. The
 * client re-resolves with `$t` once hydrated.
 */
import { conditionInfoMap } from './conditionInfo';
import { getDoc } from './docs';

export const SITE_ORIGIN = 'https://ciphra.ch';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

export interface PublicMeta {
	title: string;
	description?: string;
	/** Absolute, self-referencing canonical URL. */
	canonical: string;
	ogType: 'website' | 'article';
	/** Large branded card — only the landing has one so far. */
	ogImage?: string;
	jsonLd?: Record<string, unknown>;
}

// Named `t` so the i18n orphan detector (keys-used.test.ts) sees the keys.
type Translate = (key: string) => string;

/** Resolve the head metadata for a public path, or `null` for app routes. */
export function publicMeta(pathname: string, t: Translate): PublicMeta | null {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	const canonical = `${SITE_ORIGIN}${path}`;

	if (path === '/') {
		return {
			title: t('landing.page_title'),
			description: t('landing.meta_description'),
			canonical,
			ogType: 'website',
			ogImage: OG_IMAGE,
		};
	}

	const condition = path.match(/^\/conditions\/([^/]+)$/);
	if (condition) {
		const id = condition[1];
		const info = Object.hasOwn(conditionInfoMap, id) ? conditionInfoMap[id] : undefined;
		if (!info) return null;
		const title = t(info.titleKey);
		const subtitle = t(info.subtitleKey);
		return {
			title: `${title} — ciphra | ${t('condition.seo_suffix')}`,
			description: `${subtitle} — ${t('condition.seo_description')}`,
			canonical,
			ogType: 'article',
			jsonLd: {
				'@context': 'https://schema.org',
				'@type': 'MedicalWebPage',
				name: title,
				description: subtitle,
				url: canonical,
				about: { '@type': 'MedicalCondition', name: title },
				publisher: { '@type': 'Organization', name: 'ciphra', url: SITE_ORIGIN },
			},
		};
	}

	if (path === '/privacy') {
		return { title: `${t('privacy.title')} — ciphra`, description: t('privacy.meta'), canonical, ogType: 'article' };
	}
	if (path === '/terms') {
		return { title: `${t('terms.title')} — ciphra`, description: t('terms.meta'), canonical, ogType: 'article' };
	}

	// Docs are English-only by design (see routes/docs/+page.svelte).
	if (path === '/docs') {
		return { title: 'Documentation — ciphra', canonical, ogType: 'website' };
	}
	const docMatch = path.match(/^\/docs\/([^/]+)$/);
	if (docMatch) {
		const doc = getDoc(docMatch[1]);
		if (!doc) return null;
		return {
			title: `${doc.meta.title} — ciphra`,
			description: doc.meta.blurb || undefined,
			canonical,
			ogType: 'article',
		};
	}

	return null;
}

/** JSON-LD for an inline <script>; `</` is escaped so no value can close the tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
	return `<script type="application/ld+json">${JSON.stringify(data).replace(/<\//g, '<\\/')}</script>`;
}
