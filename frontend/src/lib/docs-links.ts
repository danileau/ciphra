/**
 * Link rewriting for the in-app `/docs` renderer.
 *
 * Lives apart from `docs.ts` on purpose: `docs.ts` imports
 * `virtual:ciphra-docs`, a module only the Vite plugin can provide, so
 * anything importing it is untestable under plain vitest. This half is
 * pure string work and gets real tests — see `docs-links.test.ts`.
 */

/**
 * Rewrite intra-doc markdown links so they resolve inside the `/docs`
 * route: a link to `ARCHITECTURE.md`, `../SECURITY.md`, `docs/FEATURES.md`
 * etc. becomes `/docs/{slug}`.
 *
 * Links to documents the app does not ship (`docs-manifest.ts` decides
 * which it does) are un-linked rather than left pointing nowhere. Before
 * the manifest existed every `docs/*.md` was in the app, so every such
 * link resolved; narrowing the set would otherwise have turned the
 * README's documentation table into a row of dead links, and a dead link
 * in a doc about being verifiable is a bad look. The text stays, so the
 * reader still learns the document exists and can find it in the source.
 *
 * Links to deeper repo paths (source files, docs/archive) are left
 * untouched — they were always repo references, never app routes.
 */
export function rewriteDocLinks(html: string, known: Set<string>): string {
	const withRoutes = html.replace(/href="([^"]*)"/g, (full, href: string) => {
		const norm = href.replace(/^(?:\.\.?\/)+/, '').replace(/^docs\//, '');
		const m = norm.match(/^([A-Za-z][\w-]*)\.md(#.*)?$/);
		if (m && known.has(m[1].toLowerCase())) {
			return `href="/docs/${m[1].toLowerCase()}${m[2] ?? ''}"`;
		}
		return full;
	});

	// Anything still pointing at a bare `*.md` is a document this
	// deployment doesn't publish. Keep the words, drop the dead anchor.
	return withRoutes.replace(
		/<a href="([^"]*\.md(?:#[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/g,
		(full, href: string, text: string) =>
			/^(https?:|mailto:)/.test(href)
				? full
				: `<span class="doc-offsite" title="In the repository, not published in the app">${text}</span>`,
	);
}
