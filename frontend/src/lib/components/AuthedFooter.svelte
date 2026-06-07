<!--
	CIPH-903 — Minimal authed footer.

	Watermark + shorthand links only, per the brand-voice rule "trust apps
	don't sparkle." Settings / locale / admin live in the navigation; this
	footer carries (a) the unchanging trust signal that used to live at the
	bottom of the dashboard (Asterisk + encryption.badge) and (b) one-line
	access to legal/security pages from any authed surface.

	Hidden on focus surfaces (/log/[date] and /setup) where chrome would
	compete with the active form.
-->
<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';

	$: pathname = $page.url.pathname;
	// Focus surfaces: a sticky save bar / wizard chrome already owns the
	// bottom of the screen. The footer would sit underneath them and read
	// as visual debris, not as a closing signature.
	// Admin is also hidden — operators don't need a patient-facing
	// "Ende-zu-Ende verschlüsselt" reassurance line on an ops console;
	// it reads as duplicate of the admin page's own zero-knowledge note
	// (which is itself dropped — see admin/+page.svelte).
	// 2026-06-07 — /setup removed from the hidden list. The wizard is
	// the first thing a freshly-registered authed user sees; without
	// the footer (and without the header's wordmark, which is added in
	// parallel via the layout shell) the page reads as logged-out chrome.
	$: hidden =
		pathname.startsWith('/log/') ||
		pathname === '/login' ||
		pathname === '/migrate' ||
		pathname.startsWith('/migrate/') ||
		pathname === '/admin' ||
		pathname.startsWith('/admin/');
</script>

{#if !hidden}
	<footer class="authed-footer" aria-label={$t('footer.aria_label')}>
		<div class="authed-footer-row">
			<a href="/" class="authed-footer-mark" aria-label="ciphra">
				<Wordmark size={20} />
			</a>
			<nav class="authed-footer-links" aria-label={$t('footer.links_aria')}>
				<a href="/privacy">{$t('privacy.title')}</a>
				<a href="/terms">{$t('terms.title')}</a>
				<!-- CIPH-912 — `/#security` removed: routes to the public
					 landing's #security anchor, but authed users land on the
					 Companion dashboard so the anchor never resolves.
					 Privacy + Terms cover the legal/info needs. -->
			</nav>
		</div>
		<div class="authed-footer-trust">
			<Asterisk size={12} color="muted" />
			<span>{$t('encryption.badge')}</span>
		</div>
	</footer>
{/if}

<style>
	.authed-footer {
		max-width: 1280px;
		margin-left: auto;
		margin-right: auto;
		/* Mobile: clear the fixed BottomNav (md:hidden, ~70px). Desktop:
		   nav is hidden, so just safe-area. */
		margin-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
		padding: 16px 16px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		/* CIPH-912 — bumped from 6px to 12px so the trust line
		   ("✱ Ende-zu-Ende verschlüsselt") doesn't crowd the
		   wordmark+links row when content wraps on narrow widths. */
		gap: 12px;
		color: var(--text-muted);
		font-size: 11px;
	}
	@media (min-width: 768px) {
		.authed-footer {
			padding: 20px 24px;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			margin-bottom: env(safe-area-inset-bottom, 0px);
		}
	}

	.authed-footer-row {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.authed-footer-mark {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.authed-footer-links {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.authed-footer-links a {
		color: var(--text-muted);
		text-decoration: none;
		transition: color 0.15s ease-out;
	}
	.authed-footer-links a:hover,
	.authed-footer-links a:focus-visible {
		color: var(--accent);
		text-decoration: underline;
	}

	.authed-footer-trust {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
