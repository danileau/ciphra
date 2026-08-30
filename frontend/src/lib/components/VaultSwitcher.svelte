<!--
	Vault switcher — "Ansicht: <account>" in the app header.

	Was a native <select> with `bg-transparent`. That is the trap app.css
	documents at ═══ STYLED SELECT ═══ and the one LocaleSelect was built for:
	a <select> can be styled at rest, but the OPTIONS PANEL is browser chrome
	the cascade cannot reach. With no background of its own the panel fell back
	to UA defaults — worst in dark mode, where the options rendered light
	chrome under near-white text and the whole thing read as broken.

	So it follows LocaleSelect: a role="combobox" trigger plus a role="listbox"
	popover, every pixel ours and identical in both themes. The README's rule
	for when to do this — custom listbox for high-visibility chrome, native
	<select> only in form context — puts the switcher here: it is header
	chrome, and it is the caregiver's primary mode control.

	Third listbox in the codebase after LocaleSelect and ExportPeriodPopover.
	Extracting the shared mechanics into one primitive is the natural
	follow-up; it is deliberately not done here, mid-incident.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { activeVault, type FamilyLink } from '$lib/stores/familyLinks';
	import { onMount, tick } from 'svelte';

	/** Non-revoked links the caregiver may switch into. */
	export let links: FamilyLink[] = [];

	let open = false;
	let trigger: HTMLButtonElement;
	let listbox: HTMLUListElement;
	let activeIdx = -1;
	let placement: 'below' | 'above' = 'below';

	// `null` is the caregiver's own vault and is always the first row, so the
	// way back is never buried under the accounts they were given.
	$: items = [
		{ id: null as number | null, label: $t('family.switcher_self') },
		...links.map((l) => ({ id: l.sourceUserId as number | null, label: l.sourceUsername })),
	];
	$: currentIdx = items.findIndex((i) => i.id === $activeVault);
	$: currentLabel = items[currentIdx]?.label ?? $t('family.switcher_self');

	function updatePlacement() {
		if (!trigger || typeof window === 'undefined') return;
		const rect = trigger.getBoundingClientRect();
		// One row ≈ 36px plus padding. The header sits at the top of the
		// viewport, so 'below' is nearly always right; the flip is here for
		// the short-window case rather than as a real expectation.
		const height = Math.min(items.length, 6) * 36 + 16;
		const spaceBelow = window.innerHeight - rect.bottom;
		placement = spaceBelow < height + 24 && rect.top > spaceBelow ? 'above' : 'below';
	}

	function toggle() {
		open = !open;
		if (open) {
			updatePlacement();
			activeIdx = currentIdx >= 0 ? currentIdx : 0;
			tick().then(() => listbox?.querySelector<HTMLButtonElement>(`[data-i="${activeIdx}"]`)?.focus());
		}
	}
	function close() {
		open = false;
		trigger?.focus();
	}
	function pick(id: number | null) {
		activeVault.set(id);
		close();
	}
	function focusIdx(i: number) {
		activeIdx = i;
		listbox?.querySelector<HTMLButtonElement>(`[data-i="${i}"]`)?.focus();
	}
	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusIdx((activeIdx + 1) % items.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx((activeIdx - 1 + items.length) % items.length);
		} else if (e.key === 'Home') {
			e.preventDefault();
			focusIdx(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			focusIdx(items.length - 1);
		}
	}
	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (trigger?.contains(target) || listbox?.contains(target)) return;
		open = false;
	}
	function onWindowResize() {
		if (open) updatePlacement();
	}
	onMount(() => {
		window.addEventListener('click', onWindowClick);
		window.addEventListener('resize', onWindowResize);
		return () => {
			window.removeEventListener('click', onWindowClick);
			window.removeEventListener('resize', onWindowResize);
		};
	});
</script>

<svelte:window on:keydown={onKey} />

<div class="vault-root">
	<button
		bind:this={trigger}
		type="button"
		class="vault-trigger"
		class:linked={$activeVault !== null}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={$t('family.switcher_label')}
		on:click={toggle}
	>
		<svg class="vault-eye" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2" />
			<circle cx="12" cy="12" r="3" stroke-width="2" />
		</svg>
		<span class="vault-viewing">{$t('family.switcher_viewing')}</span>
		<span class="vault-current">{currentLabel}</span>
		<svg class="vault-chevron" class:open viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<polyline points="3,4.5 6,7.5 9,4.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<ul
			bind:this={listbox}
			class="vault-listbox placement-{placement}"
			role="listbox"
			aria-label={$t('family.switcher_label')}
		>
			{#each items as item, i (item.id ?? 'self')}
				<li role="presentation">
					<button
						type="button"
						class="vault-option"
						class:selected={item.id === $activeVault}
						role="option"
						aria-selected={item.id === $activeVault}
						data-i={i}
						on:click={() => pick(item.id)}
					>
						<span>{item.label}</span>
						{#if item.id === $activeVault}
							<svg class="vault-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
								<polyline points="2.5,6.5 5,9 9.5,3.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.vault-root {
		position: relative;
		display: inline-block;
	}

	/* Trigger — the closed pill. Same shape as before; the colours now come
	   from tokens in both themes rather than a hardcoded light-ochre tint. */
	.vault-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		min-height: 36px;
		font-size: 0.875rem;
		line-height: 1.25;
		background-color: var(--surface-muted);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		transition: background-color 0.15s ease-out, border-color 0.15s ease-out;
	}
	.vault-trigger:hover {
		background-color: var(--surface-card);
		border-color: var(--text-muted);
	}
	.vault-trigger:focus-visible {
		outline: none;
		border-color: var(--accent, var(--brand));
		box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 178 60 44), 0.12);
	}
	/* Viewing someone else's vault. `--ochre-rgb` is redefined per theme
	   (app.css:95 / :250), so the tint follows dark mode instead of painting
	   the light-theme ochre onto a dark surface. */
	.vault-trigger.linked {
		background-color: rgba(var(--ochre-rgb), 0.12);
		border-color: var(--ochre);
		color: var(--ochre);
	}
	.vault-trigger.linked:hover {
		background-color: rgba(var(--ochre-rgb), 0.18);
		border-color: var(--ochre);
	}

	.vault-eye {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: var(--text-muted);
	}
	.vault-trigger.linked .vault-eye {
		color: var(--ochre);
	}
	.vault-viewing {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.vault-trigger.linked .vault-viewing {
		color: var(--ochre);
	}
	.vault-current {
		font-weight: 500;
	}
	.vault-chevron {
		width: 12px;
		height: 12px;
		opacity: 0.6;
		flex-shrink: 0;
		transition: transform 0.15s ease-out;
	}
	.vault-chevron.open {
		transform: rotate(180deg);
	}

	/* The label is the first thing to go when the header gets tight — the
	   account name and the eye icon still say what this is. */
	@media (max-width: 639px) {
		.vault-viewing {
			display: none;
		}
	}

	/* Panel — ours, not the browser's. Every colour is a token, so it is
	   correct in both themes by construction. */
	.vault-listbox {
		position: absolute;
		right: 0;
		min-width: 11rem;
		max-height: 60vh;
		overflow-y: auto;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
		z-index: 50;
	}
	.vault-listbox.placement-below {
		top: calc(100% + 6px);
		bottom: auto;
	}
	.vault-listbox.placement-above {
		bottom: calc(100% + 6px);
		top: auto;
	}
	.vault-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 8px 12px;
		font-size: 0.8125rem;
		text-align: left;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.12s ease-out, color 0.12s ease-out;
	}
	.vault-option:hover,
	.vault-option:focus-visible {
		background: var(--surface-muted);
		color: var(--text-primary);
		outline: none;
	}
	.vault-option.selected {
		color: var(--text-primary);
		font-weight: 600;
	}
	.vault-check {
		width: 12px;
		height: 12px;
		color: var(--olive);
	}
</style>
