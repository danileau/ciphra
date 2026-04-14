<!--
	CIPH-857 — Tabs primitive.

	ARIA tab pattern with roving tabindex. Left/Right arrow keys + Home/End
	move focus; Enter/Space (native button click) activates the focused tab.

	Props:
		tabs: array of { id, label } — id is written to the `tab` query param.
		current: the currently active tab id (parent reads from $page.url).
		onSelect: (id) => void — parent navigates; parent owns the URL.
		labelledBy: optional id of a heading describing the tabset (for aria-labelledby).
		ariaLabel: optional fallback label when no heading exists.
-->
<script lang="ts">
	import { tick } from 'svelte';

	export let tabs: Array<{ id: string; label: string }>;
	export let current: string;
	export let onSelect: (id: string) => void;
	export let labelledBy: string | undefined = undefined;
	export let ariaLabel: string | undefined = undefined;

	let buttons: HTMLButtonElement[] = [];

	$: currentIndex = Math.max(
		0,
		tabs.findIndex((t) => t.id === current),
	);

	async function focusTab(i: number) {
		await tick();
		buttons[i]?.focus();
	}

	function onKeydown(e: KeyboardEvent, i: number) {
		let next = i;
		switch (e.key) {
			case 'ArrowRight':
				next = (i + 1) % tabs.length;
				break;
			case 'ArrowLeft':
				next = (i - 1 + tabs.length) % tabs.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = tabs.length - 1;
				break;
			default:
				return;
		}
		e.preventDefault();
		onSelect(tabs[next].id);
		focusTab(next);
	}
</script>

<div
	class="flex gap-1 p-1 rounded-xl"
	role="tablist"
	aria-labelledby={labelledBy}
	aria-label={labelledBy ? undefined : ariaLabel}
	style="background: var(--surface-muted); border: 1px solid var(--border)"
>
	{#each tabs as tab, i (tab.id)}
		{@const active = tab.id === current}
		<button
			type="button"
			role="tab"
			id="tab-{tab.id}"
			aria-selected={active}
			aria-controls="tabpanel-{tab.id}"
			tabindex={active ? 0 : -1}
			bind:this={buttons[i]}
			on:click={() => onSelect(tab.id)}
			on:keydown={(e) => onKeydown(e, i)}
			class="flex-1 px-3 py-2 rounded-lg text-sm font-medium min-h-[40px] transition-colors"
			style={active
				? 'background: var(--surface-card); color: var(--text-primary); box-shadow: 0 1px 2px rgba(44,37,32,0.06)'
				: 'background: transparent; color: var(--text-muted)'}
		>
			{tab.label}
		</button>
	{/each}
</div>
