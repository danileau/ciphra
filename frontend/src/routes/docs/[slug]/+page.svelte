<script lang="ts">
	import { page } from '$app/stores';
	import { getDoc } from '$lib/docs';

	$: doc = getDoc($page.params.slug ?? '');
</script>

<svelte:head>
	<title>{doc ? doc.meta.title : 'Documentation'} — ciphra</title>
</svelte:head>

<main id="main-content" class="layout-reading py-8 space-y-5">
	<a class="doc-back" href="/docs">← Documentation</a>

	{#if doc}
		<header>
			<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{doc.meta.title}</h1>
		</header>
		<!-- First-party, in-repo markdown — see lib/docs.ts on why {@html} is safe here. -->
		<article class="doc-prose">{@html doc.html}</article>
	{:else}
		<p class="text-sm" style="color: var(--text-secondary)">
			That document doesn't exist. <a href="/docs" style="color: var(--brand)">Back to documentation</a>.
		</p>
	{/if}
</main>

<style>
	.doc-back {
		display: inline-block;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.doc-back:hover {
		color: var(--brand);
	}

	.doc-prose {
		color: var(--text-secondary);
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.doc-prose :global(h1) {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 1.6rem 0 0.6rem;
	}
	.doc-prose :global(h2) {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 1.8rem 0 0.6rem;
	}
	.doc-prose :global(h3) {
		font-size: 0.98rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 1.3rem 0 0.4rem;
	}
	.doc-prose :global(p) {
		margin: 0.6rem 0;
	}
	.doc-prose :global(ul),
	.doc-prose :global(ol) {
		margin: 0.6rem 0;
		padding-left: 1.4rem;
	}
	.doc-prose :global(li) {
		margin: 0.25rem 0;
	}
	.doc-prose :global(a) {
		color: var(--brand);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* A document that exists in the repository but is not published in
	   the app (see lib/docs-manifest.ts). Reads as a name, not as a
	   broken link — dotted underline, no colour, no pointer. */
	.doc-prose :global(.doc-offsite) {
		color: var(--text-muted);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
		cursor: help;
	}
	.doc-prose :global(strong) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.doc-prose :global(code) {
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.82em;
		background: var(--surface-muted);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
	.doc-prose :global(pre) {
		background: var(--surface-inset);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.85rem 1rem;
		overflow-x: auto;
		margin: 0.8rem 0;
	}
	.doc-prose :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.8rem;
	}
	.doc-prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0.9rem 0;
		font-size: 0.82rem;
	}
	.doc-prose :global(th),
	.doc-prose :global(td) {
		border: 1px solid var(--border);
		padding: 0.4rem 0.6rem;
		text-align: left;
		vertical-align: top;
	}
	.doc-prose :global(th) {
		background: var(--surface-inset);
		color: var(--text-primary);
		font-weight: 600;
	}
	.doc-prose :global(blockquote) {
		border-left: 3px solid var(--text-muted);
		padding-left: 0.9rem;
		margin: 0.8rem 0;
		color: var(--text-muted);
	}
	.doc-prose :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.6rem 0;
	}
</style>
