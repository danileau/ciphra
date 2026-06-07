<!-- CIPH-887 — PasswordField primitive. Wraps a native password input
	 with an eye-icon toggle that flips `type` between password and text
	 for the current session only (no localStorage persistence — security).
	 Routed through every site that previously used a bare
	 `<input type="password">`: /register, /login, /unlock, the recovery
	 flow, and any future password change form. Source-parse test in
	 PasswordField.test.ts asserts the primitive is the only password
	 input source in the codebase. -->
<script lang="ts">
	import { t } from '$lib/i18n';

	export let id: string = `pwf-${Math.random().toString(36).slice(2, 9)}`;
	export let value: string = '';
	export let placeholder: string = '';
	export let required: boolean = false;
	export let minlength: number | undefined = undefined;
	// 2026-06-07 — Svelte 5 + new HTML types tightened the `autocomplete`
	// attribute to the typed `AutoFill` enum (e.g., "current-password").
	// Narrow the public prop type accordingly so callers get autocomplete-
	// validation at the boundary.
	export let autocomplete: AutoFill | undefined = undefined;
	export let ariaDescribedby: string | undefined = undefined;
	export let ariaInvalid: boolean | undefined = undefined;
	let cls = '';
	export { cls as class };

	let visible = false;

	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		value = target.value;
	}
</script>

<div class="pwf-wrap">
	<!-- Svelte forbids a dynamic `type` attribute with `bind:value`, so we
		 mirror the value via a manual handler. The two-way contract still
		 holds because the parent's `value` prop is updated on every keystroke
		 and the input's `value={value}` reflects that prop back. -->
	<input
		{id}
		type={visible ? 'text' : 'password'}
		{placeholder}
		{required}
		{minlength}
		{autocomplete}
		aria-describedby={ariaDescribedby}
		aria-invalid={ariaInvalid}
		value={value}
		on:input={handleInput}
		on:blur
		on:focus
		class="{cls} pwf-input"
	/>
	<button
		type="button"
		on:click={() => { visible = !visible; }}
		aria-pressed={visible}
		aria-label={visible ? $t('password.hide') : $t('password.show')}
		title={visible ? $t('password.hide') : $t('password.show')}
		class="pwf-toggle"
		tabindex="-1"
	>
		{#if visible}
			<!-- Eye-off — slashed eye icon -->
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
				<line x1="1" y1="1" x2="23" y2="23"/>
			</svg>
		{:else}
			<!-- Eye -->
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
				<circle cx="12" cy="12" r="3"/>
			</svg>
		{/if}
	</button>
</div>

<style>
	.pwf-wrap {
		position: relative;
		display: block;
	}
	.pwf-input {
		/* Reserve room on the right for the toggle button so the eye icon
		   never overlaps a long passphrase. 44px tap target + 4px breathing
		   room. */
		padding-right: 48px;
	}
	.pwf-toggle {
		position: absolute;
		top: 50%;
		right: 4px;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		transition: color 0.15s ease-out, background 0.15s ease-out;
	}
	.pwf-toggle:hover {
		color: var(--text-primary);
		background: var(--surface-muted);
	}
	.pwf-toggle:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
		color: var(--text-primary);
	}
</style>
