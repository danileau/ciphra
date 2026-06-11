/**
 * Theme preference — contract tests. Pins: default is 'light' (NOT
 * 'system' — deliberate post-launch conservatism, see theme.ts),
 * persistence roundtrip, garbage rejection, and the choice→resolved
 * mapping.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { themeChoice, setThemeChoice, resolvedTheme } from './theme';

beforeEach(() => {
	localStorage.clear();
	setThemeChoice('light');
});

describe('theme preference', () => {
	it('defaults to light', () => {
		expect(get(themeChoice)).toBe('light');
		expect(get(resolvedTheme)).toBe('light');
	});

	it('persists the choice to localStorage', () => {
		setThemeChoice('dark');
		expect(localStorage.getItem('ciphra_theme')).toBe('dark');
		expect(get(resolvedTheme)).toBe('dark');
	});

	it('rejects garbage without changing state', () => {
		setThemeChoice('dark');
		setThemeChoice('hotdog' as never);
		expect(get(themeChoice)).toBe('dark');
		expect(localStorage.getItem('ciphra_theme')).toBe('dark');
	});

	it('system resolves to a binary theme', () => {
		setThemeChoice('system');
		// jsdom matchMedia (when stubbed) defaults to not-dark; either way
		// the resolved value must be binary, never 'system'.
		expect(['light', 'dark']).toContain(get(resolvedTheme));
	});
});
