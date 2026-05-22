<script lang="ts">
	import { docList } from '$lib/docs';
</script>

<svelte:head>
	<title>Documentation — ciphra</title>
</svelte:head>

<main id="main-content" class="max-w-3xl mx-auto px-4 py-8 space-y-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold" style="color: var(--text-primary)">Documentation</h1>
		<p class="text-sm" style="color: var(--text-muted)">
			ciphra's documentation, rendered straight from the repository.
		</p>
	</header>

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
