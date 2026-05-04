<script lang="ts">
	/**
	 * Scroll-triggered visualization of how a health entry becomes an opaque
	 * ciphertext. Real WebCrypto AES-256-GCM runs at the end; the plaintext,
	 * derived-key, and ciphertext each reveal with a distinct animation so
	 * the transformation is legible instead of instant.
	 *
	 * Argon2 is represented symbolically (pulsing circle + scrambling hex)
	 * because a real derivation takes ~1.5s and would stall the flow. The
	 * caveat copy is explicit about this.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	// Inlined to keep this landing-page component out of $lib/crypto's import
	// graph, which drags in BIP39 wordlist + recovery-code generator (~7KB).
	function bytesToB64(bytes: Uint8Array): string {
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		return btoa(bin);
	}

	let rootEl: HTMLDivElement;
	let step = 0; // 0 idle, 1 plaintext, 2 derive, 3 encrypt, 4 done
	let plaintextJson = '';          // full localized sample
	let plaintextRevealed = '';      // typewriter progress
	let vaultKeyHex = '';            // live-scrambling during derive
	let vaultKeySettled = '';        // final key shown at step 4
	let ciphertext = '';             // final b64
	let ciphertextRevealed = '';     // typewriter progress
	let scrambleTimer: number | null = null;
	let observer: IntersectionObserver | null = null;
	let running = false;

	const HEX = '0123456789abcdef';

	function bytesToHex(bytes: Uint8Array): string {
		return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
	}

	function randomHex(len: number): string {
		let out = '';
		for (let i = 0; i < len; i++) {
			out += HEX[Math.floor(Math.random() * 16)];
		}
		return out;
	}

	function stopScramble() {
		if (scrambleTimer !== null) {
			clearInterval(scrambleTimer);
			scrambleTimer = null;
		}
	}

	async function typewriter(full: string, setter: (v: string) => void, durationMs: number) {
		const frames = Math.min(full.length, 60);
		const chunkSize = Math.ceil(full.length / frames);
		const interval = durationMs / frames;
		for (let i = 0; i < frames; i++) {
			setter(full.slice(0, (i + 1) * chunkSize));
			await wait(interval);
		}
		setter(full);
	}

	async function runDemo() {
		if (running) return;
		running = true;

		// Reset
		plaintextJson = $t('tech.demo_sample_json');
		plaintextRevealed = '';
		vaultKeyHex = '';
		vaultKeySettled = '';
		ciphertext = '';
		ciphertextRevealed = '';

		// --- Step 1: plaintext types out ---
		step = 1;
		await typewriter(plaintextJson, v => (plaintextRevealed = v), 1100);
		await wait(250);

		// --- Step 2: key derivation — hex scrambles for ~1.4s ---
		step = 2;
		const keyBytes = crypto.getRandomValues(new Uint8Array(32));
		const finalKeyHex = bytesToHex(keyBytes);
		scrambleTimer = window.setInterval(() => { vaultKeyHex = randomHex(64); }, 55);
		await wait(1400);
		stopScramble();
		vaultKeyHex = finalKeyHex;
		vaultKeySettled = finalKeyHex;
		await wait(350);

		// --- Step 3: real AES-GCM encryption + ciphertext types out ---
		step = 3;
		const cryptoKey = await crypto.subtle.importKey(
			'raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']
		);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = new TextEncoder().encode(plaintextJson);
		const encrypted = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv }, cryptoKey, encoded as BufferSource
		);
		const encArr = new Uint8Array(encrypted);
		const out = new Uint8Array(12 + encArr.length);
		out.set(iv, 0);
		out.set(encArr, 12);
		ciphertext = bytesToB64(out);
		await typewriter(ciphertext, v => (ciphertextRevealed = v), 1200);
		await wait(200);

		step = 4;
		running = false;
	}

	function replay() {
		stopScramble();
		step = 0;
		running = false;
		setTimeout(runDemo, 60);
	}

	function wait(ms: number) {
		return new Promise(r => setTimeout(r, ms));
	}

	onMount(() => {
		if (!rootEl || typeof IntersectionObserver === 'undefined') return;
		observer = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting && step === 0 && !running) {
				runDemo();
			}
		}, { threshold: 0.25 });
		observer.observe(rootEl);
	});

	onDestroy(() => {
		stopScramble();
		observer?.disconnect();
	});

</script>

<div bind:this={rootEl} class="space-y-6">
	<div class="max-w-2xl">
		<h3 class="text-2xl md:text-3xl font-bold tracking-tight mb-2" style="color: var(--text-primary)">{$t('tech.demo_title')}</h3>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('tech.demo_subtitle')}</p>
	</div>

	<!-- Before / pipeline / after -->
	<div class="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr] gap-4 items-stretch">
		<!-- Plaintext card -->
		<div
			class="card rounded-2xl p-5 transition-all duration-500"
			style="border-left: 4px solid var(--ochre);
			       transform: scale({step === 1 ? 1.02 : 1});
			       box-shadow: {step === 1 ? '0 8px 24px rgba(159,99,11,0.15)' : 'none'};
			       opacity: {step >= 1 ? 1 : 0.45};"
		>
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--ochre)"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/></svg>
					<span class="text-xs font-semibold uppercase tracking-widest" style="color: var(--ochre)">{$t('tech.demo_plaintext')}</span>
				</div>
				<span class="text-[10px] font-mono" style="color: var(--text-muted)">JSON</span>
			</div>
			<pre class="text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed" style="color: var(--text-primary); min-height: 220px">{plaintextRevealed || (step === 0 ? $t('tech.demo_waiting') : '')}<span class="inline-block w-[6px] h-[13px] align-middle {step === 1 ? 'typing-cursor' : ''}" style="background: {step === 1 ? 'var(--ochre)' : 'transparent'};"></span></pre>
		</div>

		<!-- Middle pipeline -->
		<div class="flex md:flex-col items-center justify-center gap-3 md:gap-5 py-2">
			<!-- Arrow into the pipeline -->
			<svg class="w-5 h-5 md:rotate-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {step >= 1 ? 'var(--ochre)' : 'var(--text-muted)'}; transition: color 300ms;"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

			<!-- Derive badge -->
			<div class="flex flex-col items-center gap-1">
				<div
					class="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-white"
					style="border-color: {step === 2 ? 'var(--brand)' : step > 2 ? 'var(--olive)' : 'var(--border)'};
					       background: {step === 2 ? 'rgba(178,60,44,0.06)' : step > 2 ? 'rgba(127,130,27,0.06)' : 'white'};
					       {step === 2 ? 'animation: pulse-ring 0.9s ease-in-out infinite;' : ''}"
				>
					{#if step > 2}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive)"><polyline points="20,6 9,17 4,12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else}
						<span class="text-xs font-mono font-bold" style="color: {step === 2 ? 'var(--brand)' : 'var(--text-muted)'}">A2id</span>
					{/if}
				</div>
				<span class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">{$t('tech.demo_step_derive')}</span>
			</div>

			<!-- Mid arrow: between Derive and Encrypt -->
			<svg class="w-5 h-5 md:rotate-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {step >= 2 ? 'var(--brand)' : 'var(--text-muted)'}; transition: color 300ms;"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

			<!-- Encrypt badge -->
			<div class="flex flex-col items-center gap-1">
				<div
					class="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-white"
					style="border-color: {step === 3 ? 'var(--brand)' : step > 3 ? 'var(--olive)' : 'var(--border)'};
					       background: {step === 3 ? 'rgba(178,60,44,0.06)' : step > 3 ? 'rgba(127,130,27,0.06)' : 'white'};
					       {step === 3 ? 'animation: pulse-ring 0.6s ease-in-out infinite;' : ''}"
				>
					{#if step > 3}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive)"><rect x="5" y="11" width="14" height="10" rx="2" stroke-width="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke-width="2"/></svg>
					{:else}
						<svg class="w-5 h-5 {step === 3 ? 'lock-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {step >= 3 ? 'var(--brand)' : 'var(--text-muted)'}"><rect x="5" y="11" width="14" height="10" rx="2" stroke-width="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke-width="2"/></svg>
					{/if}
				</div>
				<span class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">{$t('tech.demo_step_encrypt')}</span>
			</div>

			<!-- Arrow out of the pipeline -->
			<svg class="w-5 h-5 md:rotate-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {step >= 3 ? 'var(--brand)' : 'var(--text-muted)'}; transition: color 300ms;"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</div>

		<!-- Ciphertext card -->
		<div
			class="card rounded-2xl p-5 transition-all duration-500"
			style="border-left: 4px solid var(--brand);
			       transform: scale({step >= 3 ? 1.02 : 1});
			       box-shadow: {step >= 3 ? '0 8px 24px rgba(178,60,44,0.15)' : 'none'};
			       opacity: {step >= 3 ? 1 : 0.45};"
		>
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand)"><rect x="3" y="11" width="18" height="11" rx="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"/></svg>
					<span class="text-xs font-semibold uppercase tracking-widest" style="color: var(--brand)">{$t('tech.demo_ciphertext')}</span>
				</div>
				<span class="text-[10px] font-mono" style="color: var(--text-muted)">BASE64</span>
			</div>
			<p class="text-[10px] font-mono break-all leading-relaxed" style="color: var(--text-primary); min-height: 220px">{ciphertextRevealed}<span class="inline-block w-[6px] h-[11px] align-middle {step === 3 ? 'typing-cursor' : ''}" style="background: {step === 3 ? 'var(--brand)' : 'transparent'};"></span></p>
			{#if step === 4}
				<p class="text-xs mt-3" style="color: var(--text-muted)">{$t('tech.demo_byte_count', { bytes: String(Math.floor((ciphertext.length * 3) / 4)) })}</p>
			{/if}
		</div>
	</div>

	<!-- Vault key strip — shows scrambling during derive, settled hex after -->
	{#if step >= 2}
		<div
			class="rounded-xl p-4 transition-all duration-500"
			style="background: {step === 2 ? 'rgba(178,60,44,0.04)' : 'var(--surface-muted)'};
			       border: 1px solid {step === 2 ? 'rgba(178,60,44,0.25)' : 'var(--border)'};"
		>
			<div class="flex items-center justify-between gap-3 mb-2">
				<span class="text-xs font-semibold uppercase tracking-widest" style="color: {step === 2 ? 'var(--brand)' : 'var(--text-muted)'}">{$t('tech.demo_vault_key')}</span>
				<span class="text-[10px] font-mono" style="color: var(--text-muted)">
					{#if step === 2}{$t('tech.demo_deriving')}…{:else}32 bytes · 256 bits{/if}
				</span>
			</div>
			<p class="text-[11px] font-mono break-all tracking-wide" style="color: var(--text-primary); filter: {step === 2 ? 'blur(0.5px)' : 'none'};">{vaultKeyHex}</p>
			{#if step >= 3}
				<p class="text-xs mt-2" style="color: var(--text-muted)">{$t('tech.demo_vault_key_note')}</p>
			{/if}
		</div>
	{/if}

	<!-- Footer: caveat + replay -->
	<div class="flex items-center justify-between gap-3 flex-wrap pt-2">
		<p class="text-xs max-w-xl" style="color: var(--text-muted)">{$t('tech.demo_caveat')}</p>
		{#if step === 4}
			<button
				type="button"
				on:click={replay}
				class="btn-secondary text-sm px-4 min-h-[40px] flex items-center gap-2 shrink-0"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="1,4 1,10 7,10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{$t('tech.demo_replay')}
			</button>
		{/if}
	</div>
</div>

<style>
	@keyframes pulse-ring {
		0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(178,60,44,0.35); }
		50%      { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(178,60,44,0); }
	}
	@keyframes typing-blink {
		0%, 49% { opacity: 1; }
		50%, 100% { opacity: 0; }
	}
	.typing-cursor {
		animation: typing-blink 0.9s step-end infinite;
	}
	@keyframes lock-spin {
		0%, 100% { transform: rotate(0deg); }
		25%      { transform: rotate(-8deg); }
		75%      { transform: rotate(8deg); }
	}
	.lock-spin {
		animation: lock-spin 0.4s ease-in-out infinite;
	}
</style>
