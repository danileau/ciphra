/**
 * Theme preference (design review 2026-06-11 — dark mode, Phase 7).
 *
 * Three-way choice: 'light' | 'dark' | 'system'. Resolved to a binary
 * theme and applied as `data-theme` on <html> by `+layout.svelte`;
 * `app.html` carries a tiny inline pre-hydration script that mirrors
 * this logic so OS-dark users don't get a white flash before the app
 * boots (keep the two in sync).
 *
 * Default is 'system' (flipped from 'light' 2026-06-12 after the dark
 * theme passed its visual pass): the app follows the OS, so the 2am
 * photophobic-logging case gets dark without discovering any control.
 * Users who explicitly chose a theme keep their stored choice.
 *
 * localStorage (not sessionStorage): a durable preference like locale,
 * and not health data. The doctor PDF ignores the theme on purpose —
 * print media stays light.
 */
import { writable, readable, derived, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'ciphra_theme';
const CHOICES: ReadonlySet<string> = new Set(['light', 'dark', 'system']);

function initialChoice(): ThemeChoice {
	if (!browser) return 'system';
	try {
		const v = localStorage.getItem(KEY);
		return v && CHOICES.has(v) ? (v as ThemeChoice) : 'system';
	} catch {
		return 'system';
	}
}

export const themeChoice = writable<ThemeChoice>(initialChoice());

export function setThemeChoice(choice: ThemeChoice): void {
	if (!CHOICES.has(choice)) return;
	themeChoice.set(choice);
	try {
		localStorage.setItem(KEY, choice);
	} catch {
		/* storage blocked — preference lives for the session only */
	}
}

/** OS-level preference, live (reacts to system theme changes). */
const systemPrefersDark: Readable<boolean> = readable(false, (set) => {
	if (!browser || typeof window.matchMedia !== 'function') return;
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	set(mq.matches);
	const handler = (e: MediaQueryListEvent) => set(e.matches);
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
});

/** The binary theme surfaces actually render. */
export const resolvedTheme: Readable<ResolvedTheme> = derived(
	[themeChoice, systemPrefersDark],
	([choice, sysDark]) => (choice === 'system' ? (sysDark ? 'dark' : 'light') : choice),
);
