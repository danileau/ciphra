<script lang="ts">
	export let type: 'text' | 'password' | 'email' = 'text';
	export let placeholder: string = '';
	export let value: string = '';
	export let label: string | undefined = undefined;
	export let error: string | undefined = undefined;

	const id = `input-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class="input-wrapper">
	{#if label}
		<label for={id} class="input-label">{label}</label>
	{/if}
	{#if type === 'password'}
		<input {id} type="password" {placeholder} bind:value class="input-field" class:input-error={error}
			aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined}
			on:blur on:focus on:input />
	{:else if type === 'email'}
		<input {id} type="email" {placeholder} bind:value class="input-field" class:input-error={error}
			aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined}
			on:blur on:focus on:input />
	{:else}
		<input {id} type="text" {placeholder} bind:value class="input-field" class:input-error={error}
			aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined}
			on:blur on:focus on:input />
	{/if}
	{#if error}
		<p id="{id}-error" class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style>
	.input-wrapper {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
	}

	.input-label {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.input-field {
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		background: var(--surface-muted);
		border: 1px solid var(--border);
		border-radius: 12px;
		font-size: 16px;
		color: var(--text-primary);
		transition: border-color 200ms ease-out, box-shadow 200ms ease-out;
		outline: none;
	}

	.input-field::placeholder {
		color: var(--text-muted);
	}

	.input-field:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px rgba(178, 60, 44, 0.15);
	}

	.input-error {
		border-color: var(--danger);
	}

	.input-error:focus {
		border-color: var(--danger);
		box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
	}

	.error-message {
		font-size: 12px;
		color: var(--danger);
		margin: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.input-field {
			transition: none;
		}
	}
</style>
