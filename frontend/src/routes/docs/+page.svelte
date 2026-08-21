<script lang="ts">
	import { docList } from '$lib/docs';
</script>

<svelte:head>
	<title>Documentation — ciphra</title>
</svelte:head>

<main id="main-content" class="layout-reading py-8 space-y-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold" style="color: var(--text-primary)">Documentation</h1>
		<p class="text-sm" style="color: var(--text-muted)">
			ciphra's documentation, rendered straight from the repository.
		</p>
	</header>

	<aside class="english-note">
		<p>
			<strong>Why English only?</strong> The app itself is translated into German, French,
			Italian, and English, because those are the languages our users live in. The
			documentation isn't — it covers architecture, the threat model, and how to develop
			against ciphra, and its audience is engineers, auditors, and contributors who already
			work in English across the rest of their toolchain. Keeping one canonical version
			also avoids the drift problem: four translated copies of an architecture doc rot at
			four different rates, and a stale security note is worse than no translation at all.
		</p>
	</aside>

	<ul class="space-y-3">
		{#each docList as doc (doc.slug)}
			<li>
				<a class="doc-card" href="/docs/{doc.slug}">
					<span class="doc-card__title">{doc.title}</span>
					{#if doc.blurb}
						<span class="doc-card__blurb">{doc.blurb}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	.english-note {
		padding: 0.85rem 1rem;
		border-left: 3px solid var(--brand);
		background: var(--surface-card);
		border-radius: 0.5rem;
	}
	.english-note p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}
	.english-note strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.doc-card {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		border-radius: 0.75rem;
		background: var(--surface-card);
		border: 1px solid var(--border);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.doc-card:hover,
	.doc-card:focus-visible {
		border-color: var(--brand);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
	}
	.doc-card__title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.doc-card__blurb {
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
</style>
