<!--
  Mobile bottom-tab navigation (CIPH-201).

  5 slots: Today / Calendar / [+ FAB] / Journal / Reports.
  Settings stays in the header (Hiroshi's vote — settings is not a primary
  daily action). Hidden on >=md and on auth/marketing chrome routes.

  The center "+" FAB triggers the existing quick-add bottom sheet that
  lives in +layout.svelte by flipping the global `quickAddOpen` store —
  no UI duplication, single source of truth.
-->
<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { quickAddOpen } from '$lib/stores/quickAdd';

	$: pathname = $page.url.pathname;

	// Hide on auth / marketing / wizard surfaces. /conditions, /privacy,
	// /terms are not hidden here because authenticated users can deep-link
	// to them from inside the app — the layout already gates BottomNav
	// mounting on `$isAuthenticated`, so reaching this component at all
	// means we're in the app chrome branch.
	$: hidden =
		pathname === '/login' ||
		pathname === '/setup' ||
		pathname.startsWith('/join/');

	// CIPH-785 — active state must follow the real current route.
	// "Heute" owns both `/` (dashboard) and any `/log/...` (daily entry).
	// Other tabs match their route prefix. The FAB has no active state.
	function isActive(path: string): boolean {
		if (path === '/') return pathname === '/' || pathname.startsWith('/log');
		return pathname === path || pathname.startsWith(path + '/');
	}

	function openQuickAdd() {
		quickAddOpen.set(true);
	}
</script>

{#if !hidden}
	<nav
		class="md:hidden fixed bottom-0 left-0 right-0 z-50 bottomnav"
		aria-label="Main navigation"
	>
		<div class="max-w-md mx-auto grid grid-cols-5 items-end">
			<!-- Today -->
			<a
				href="/"
				class="bn-tab"
				class:bn-tab--active={isActive('/')}
				aria-current={isActive('/') ? 'page' : undefined}
			>
				<svg class="bn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					<polyline points="9,22 9,12 15,12 15,22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="bn-label">{$t('nav.today')}</span>
			</a>

			<!-- Calendar -->
			<a
				href="/calendar"
				class="bn-tab"
				class:bn-tab--active={isActive('/calendar')}
				aria-current={isActive('/calendar') ? 'page' : undefined}
			>
				<svg class="bn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"/>
					<line x1="16" y1="2" x2="16" y2="6" stroke-width="2" stroke-linecap="round"/>
					<line x1="8" y1="2" x2="8" y2="6" stroke-width="2" stroke-linecap="round"/>
					<line x1="3" y1="10" x2="21" y2="10" stroke-width="2"/>
				</svg>
				<span class="bn-label">{$t('nav.calendar')}</span>
			</a>

			<!-- Center FAB (+) -->
			<div class="flex items-center justify-center">
				<button
					type="button"
					on:click={openQuickAdd}
					data-testid="fab-quickadd"
					class="bn-fab"
					aria-label={$t('nav.add')}
				>
					<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/>
						<line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<!-- Journal -->
			<a
				href="/journal"
				class="bn-tab"
				class:bn-tab--active={isActive('/journal')}
				aria-current={isActive('/journal') ? 'page' : undefined}
			>
				<svg class="bn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="bn-label">{$t('nav.journal')}</span>
			</a>

			<!-- Reports -->
			<a
				href="/reports"
				class="bn-tab"
				class:bn-tab--active={isActive('/reports')}
				aria-current={isActive('/reports') ? 'page' : undefined}
			>
				<svg class="bn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<line x1="18" y1="20" x2="18" y2="10" stroke-width="2" stroke-linecap="round"/>
					<line x1="12" y1="20" x2="12" y2="4" stroke-width="2" stroke-linecap="round"/>
					<line x1="6" y1="20" x2="6" y2="14" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<span class="bn-label">{$t('nav.reports')}</span>
			</a>
		</div>
	</nav>
{/if}

<style>
	.bottomnav {
		background: var(--surface-card);
		border-top: 1px solid var(--border);
		/* iPhone notch / home-indicator safe area (Linus's a11y requirement) */
		padding-bottom: max(8px, env(safe-area-inset-bottom));
		padding-top: 6px;
	}

	.bn-tab {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 8px 4px 6px;
		min-height: 56px;
		color: var(--text-muted);
		transition: color 0.15s ease-out;
	}
	.bn-tab:hover {
		color: var(--text-secondary);
	}
	/* Active tab — three layered cues so it's unmistakable on every theme:
	   1. label + icon switch to brand color
	   2. label becomes bold
	   3. a 3px brand-colored pill sits at the very top of the tab as an
	      indicator (mirrors iOS-style tab affordance) */
	.bn-tab--active {
		color: var(--brand);
	}
	.bn-tab--active .bn-label {
		font-weight: 700;
	}
	.bn-tab--active::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 28px;
		height: 3px;
		background: var(--brand);
		border-radius: 0 0 3px 3px;
	}

	.bn-icon {
		width: 22px;
		height: 22px;
		stroke-width: 2;
		transition: stroke-width 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out;
	}
	.bn-tab--active .bn-icon {
		width: 24px;
		height: 24px;
		stroke-width: 2.4;
	}

	.bn-label {
		font-size: 10px;
		font-weight: 500;
		line-height: 1;
	}

	/* CIPH-201b — Aria's note: the FAB must read as "the +1 way to add from
	   anywhere", not just another tab icon. Solid brand-fill circle, white
	   plus glyph, raised above the bar with a brand-tinted shadow, and ~52px
	   so it visually outweighs the 22px side-tab icons. */
	.bn-fab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border-radius: 9999px;
		background: var(--brand);
		color: #fff;
		box-shadow:
			0 4px 12px rgba(178, 60, 44, 0.3),
			0 0 0 4px var(--surface-card);
		transform: translateY(-14px);
		transition: transform 0.15s ease-out, background 0.15s ease-out, box-shadow 0.15s ease-out;
	}
	.bn-fab :global(svg) {
		width: 26px;
		height: 26px;
		stroke-width: 3;
	}
	.bn-fab:hover {
		background: var(--brand-hover);
		box-shadow:
			0 6px 18px rgba(178, 60, 44, 0.42),
			0 0 0 4px var(--surface-card);
	}
	.bn-fab:active {
		transform: translateY(-14px) scale(0.95);
	}
	.bn-fab:focus-visible,
	.bn-tab:focus-visible {
		outline: 3px solid var(--brand);
		outline-offset: 2px;
		border-radius: 8px;
	}
</style>
