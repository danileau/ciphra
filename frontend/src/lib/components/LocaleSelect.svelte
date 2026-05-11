<!--
	CIPH-pi24-5e — Custom locale switcher.

	A native <select> can be styled at rest (the closed pill), but the
	OPTIONS panel that opens on click is browser chrome the CSS cascade
	cannot reach. This component replaces the native control with a
	role="combobox" button + role="listbox" popover so every visible
	pixel is ours.

	Used on /login and PublicFooter (the only places where the dropdown
	is high-visibility chrome on a marketing-style surface). Form-context
	selects (settings, EntryComposer) keep the native control because
	their option-panel chrome reads as expected in-form.
-->
<script lang="ts">
	import { locale, locales, localeNames, type Locale } from '$lib/i18n';
	import { t } from '$lib/i18n';
	import { onMount, tick } from 'svelte';

	export let buttonClass = '';

	let open = false;
	let trigger: HTMLButtonElement;
	let listbox: HTMLUListElement;
	let activeIdx = -1;
	// CIPH-pi24-5e+ — popover placement. Defaults to 'below' (the form-aware
	// choice: don't cover the field above the trigger on /login). Flips to
	// 'above' only when there genuinely isn't room below — most relevant
	// on PublicFooter where the trigger sits near the viewport bottom on
	// short windows / mobile.
	let placement: 'below' | 'above' = 'below';

	$: items = locales.map((l) => ({ id: l, label: localeNames[l] }));
	$: currentLocale = $locale as Locale;
	$: currentLabel = localeNames[currentLocale];
	$: currentIdx = items.findIndex((i) => i.id === currentLocale);

	function updatePlacement() {
		if (!trigger || typeof window === 'undefined') return;
		const rect = trigger.getBoundingClientRect();
		// Estimate: 4 locales × ~36px row + 8px padding ≈ 152px. Add a
		// buffer so we don't flip when there's barely enough — the
		// popover would still touch the viewport edge with no room to
		// breathe.
		const POPOVER_HEIGHT = 160;
		const BUFFER = 24;
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		placement = spaceBelow < POPOVER_HEIGHT + BUFFER && spaceAbove > spaceBelow
			? 'above'
			: 'below';
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
	function pick(l: Locale) {
		locale.set(l);
		close();
	}
	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIdx = (activeIdx + 1) % items.length;
			listbox?.querySelector<HTMLButtonElement>(`[data-i="${activeIdx}"]`)?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIdx = (activeIdx - 1 + items.length) % items.length;
			listbox?.querySelector<HTMLButtonElement>(`[data-i="${activeIdx}"]`)?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			activeIdx = 0;
			listbox?.querySelector<HTMLButtonElement>(`[data-i="${activeIdx}"]`)?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			activeIdx = items.length - 1;
			listbox?.querySelector<HTMLButtonElement>(`[data-i="${activeIdx}"]`)?.focus();
		}
	}
	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (trigger?.contains(t) || listbox?.contains(t)) return;
		open = false;
	}
	function onWindowResize() {
		if (!open) return;
		updatePlacement();
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

<div class="locale-select-root">
	<button
		bind:this={trigger}
		type="button"
		class="locale-select-trigger {buttonClass}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={$t('common.language')}
		on:click={toggle}
	>
		<span>{currentLabel}</span>
		<svg class="locale-select-chevron" class:open viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<polyline points="3,4.5 6,7.5 9,4.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<ul
			bind:this={listbox}
			class="locale-select-listbox placement-{placement}"
			role="listbox"
			aria-label={$t('common.language')}
		>
			{#each items as item, i}
				<li role="presentation">
					<button
						type="button"
						class="locale-select-option"
						class:selected={item.id === currentLocale}
						role="option"
						aria-selected={item.id === currentLocale}
						data-i={i}
						on:click={() => pick(item.id)}
					>
						<span>{item.label}</span>
						{#if item.id === currentLocale}
							<svg class="locale-select-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
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
	.locale-select-root {
		position: relative;
		display: inline-block;
	}
	.locale-select-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		min-height: 36px;
		font-size: 0.75rem;
		line-height: 1.25;
		background-color: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out;
	}
	.locale-select-trigger:hover {
		background-color: var(--surface-card);
		border-color: var(--text-muted);
	}
	.locale-select-trigger:focus-visible {
		outline: none;
		border-color: var(--accent, var(--brand));
		box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 178 60 44), 0.12);
	}
	.locale-select-chevron {
		width: 12px;
		height: 12px;
		opacity: 0.6;
		transition: transform 0.15s ease-out;
	}
	.locale-select-chevron.open {
		transform: rotate(180deg);
	}

	.locale-select-listbox {
		position: absolute;
		right: 0;
		min-width: 10rem;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
		z-index: 50;
	}
	.locale-select-listbox.placement-below {
		top: calc(100% + 6px);
		bottom: auto;
	}
	.locale-select-listbox.placement-above {
		bottom: calc(100% + 6px);
		top: auto;
	}
	.locale-select-option {
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
	.locale-select-option:hover,
	.locale-select-option:focus-visible {
		background: var(--surface-muted);
		color: var(--text-primary);
		outline: none;
	}
	.locale-select-option.selected {
		color: var(--text-primary);
		font-weight: 600;
	}
	.locale-select-check {
		width: 12px;
		height: 12px;
		color: var(--olive);
	}
</style>
