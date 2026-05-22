/**
 * In-app documentation source — D5 of the docs-reset sprint.
 *
 * The repository's `docs/*.md` reach the app through the
 * `virtual:ciphra-docs` module — the `ciphraDocs` Vite plugin reads them
 * with Node `fs` (see vite.config.ts), because they live above the
 * SvelteKit root where a browser-side glob can't reach.
 * Editing a `.md` file updates `/docs` directly: documentation as code.
 *
 * The markdown is first-party, in-repo, team-authored content — never user
 * input — so rendering it via `{@html}` in the route carries no XSS risk.
 */
import { marked } from 'marked';
import { docs as rawDocs } from 'virtual:ciphra-docs';

export interface DocMeta {
	slug: string;
	title: string;
	blurb: string;
}

export interface RenderedDoc {
	meta: DocMeta;
	html: string;
}

/** Display order on the index; anything unlisted sorts alphabetically after. */
const ORDER = ['readme', 'features', 'architecture', 'developing', 'security'];

function slugOf(path: string): string {
	const file = path.split('/').pop() ?? '';
	return file.replace(/\.md$/i, '').toLowerCase();
}

function titleOf(raw: string, fallback: string): string {
	const m = raw.match(/^#\s+(.+)$/m);
	return m ? m[1].trim() : fallback;
}

/** First prose paragraph, flattened + truncated — the index card blurb. */
function blurbOf(raw: string): string {
	const body = raw.replace(/^#[^\n]*\n+/, '');
	const para = body
		.split(/\n\s*\n/)
		.find((b) => b.trim().length > 0 && !b.trim().startsWith('#') && !b.trim().startsWith('>'));
	if (!para) return '';
	const flat = para
		.replace(/\s+/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
		.replace(/[*_`#[\]]/g, '')
		.trim();
	return flat.length > 160 ? flat.slice(0, 157).trimEnd() + '…' : flat;
}

/**
 * Rewrite intra-doc markdown links so they resolve inside the `/docs`
 * route: a link to `ARCHITECTURE.md`, `../SECURITY.md`, `docs/FEATURES.md`
 * etc. becomes `/docs/{slug}`. Links to deeper repo paths (source files,
 * docs/archive) are left untouched — they are repo references.
 */
function rewriteDocLinks(html: string, known: Set<string>): string {
	return html.replace(/href="([^"]*)"/g, (full, href: string) => {
		const norm = href.replace(/^(?:\.\.?\/)+/, '').replace(/^docs\//, '');
		const m = norm.match(/^([A-Za-z][\w-]*)\.md(#.*)?$/);
		if (m && known.has(m[1].toLowerCase())) {
			return `href="/docs/${m[1].toLowerCase()}${m[2] ?? ''}"`;
		}
		return full;
	});
}

interface DocEntry {
	meta: DocMeta;
	raw: string;
}

const bySlug = new Map<string, DocEntry>();
for (const [path, raw] of Object.entries(rawDocs)) {
	const slug = slugOf(path);
	bySlug.set(slug, {
		meta: { slug, title: titleOf(raw, slug), blurb: blurbOf(raw) },
		raw,
	});
}

/** All docs, in display order, for the `/docs` index. */
export const docList: DocMeta[] = [...bySlug.values()]
	.map((d) => d.meta)
	.sort((a, b) => {
		const ai = ORDER.indexOf(a.slug);
		const bi = ORDER.indexOf(b.slug);
		if (ai !== -1 && bi !== -1) return ai - bi;
		if (ai !== -1) return -1;
		if (bi !== -1) return 1;
		return a.slug.localeCompare(b.slug);
	});

/** Resolve a slug to its title + rendered HTML. `null` for an unknown slug. */
export function getDoc(slug: string): RenderedDoc | null {
	const entry = bySlug.get(slug.toLowerCase());
	if (!entry) return null;
	// Drop the leading H1 — the route renders the title in its own header.
	const body = entry.raw.replace(/^#[^\n]*\n+/, '');
	const html = rewriteDocLinks(marked.parse(body) as string, new Set(bySlug.keys()));
	return { meta: entry.meta, html };
}
