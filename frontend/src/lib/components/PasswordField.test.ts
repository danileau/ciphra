/**
 * CIPH-887 — PasswordField primitive contract + audit guard.
 *
 * The primitive wraps a native input + an eye-icon toggle. Tap flips the
 * input's `type` between `password` and `text` for the current session
 * only — visibility never persists to localStorage (security: a user
 * who hands the device to someone shouldn't have a previously toggled
 * state leak across logins).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import PasswordField from './PasswordField.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('CIPH-887 PasswordField runtime contract', () => {
	it('renders type=password by default', () => {
		const { container } = render(PasswordField, { props: { id: 'p1', value: '' } });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('password');
	});

	it('toggle button has aria-pressed=false initially', () => {
		const { container } = render(PasswordField, { props: { id: 'p1', value: '' } });
		const btn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
		expect(btn).toBeTruthy();
		expect(btn.getAttribute('aria-pressed')).toBe('false');
	});

	it('clicking the toggle flips type to text and aria-pressed to true', async () => {
		const { container } = render(PasswordField, { props: { id: 'p1', value: 'secret' } });
		const btn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
		await fireEvent.click(btn);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('text');
		expect(btn.getAttribute('aria-pressed')).toBe('true');
	});

	it('clicking the toggle twice returns to password', async () => {
		const { container } = render(PasswordField, { props: { id: 'p1', value: 'secret' } });
		const btn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
		await fireEvent.click(btn);
		await fireEvent.click(btn);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('password');
	});

	it('does not persist visibility state to localStorage', async () => {
		const setSpy = vi.spyOn(window.localStorage, 'setItem');
		const { container } = render(PasswordField, { props: { id: 'p1', value: 's' } });
		await fireEvent.click(container.querySelector('button[aria-pressed]') as HTMLButtonElement);
		// No localStorage write should reference password / visibility / pwf
		const writes = setSpy.mock.calls.map((c) => String(c[0]).toLowerCase());
		for (const key of writes) {
			expect(key).not.toMatch(/password|pwf|visible/);
		}
	});

	it('forwards on:blur to the parent', async () => {
		let blurred = false;
		const { container, component } = render(PasswordField, { props: { id: 'p1', value: '' } });
		(component as any).$on('blur', () => { blurred = true; });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.blur(input);
		expect(blurred).toBe(true);
	});

	it('passes through id, placeholder, required, autocomplete, minlength', () => {
		const { container } = render(PasswordField, {
			props: {
				id: 'sig',
				value: '',
				placeholder: 'pwd',
				required: true,
				autocomplete: 'new-password',
				minlength: 8,
			},
		});
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.id).toBe('sig');
		expect(input.placeholder).toBe('pwd');
		expect(input.required).toBe(true);
		expect(input.getAttribute('autocomplete')).toBe('new-password');
		expect(input.getAttribute('minlength')).toBe('8');
	});
});

// ---- Audit guard: the only `<input type="password">` source in the
// codebase is PasswordField itself. Every other site routes through the
// primitive.
function walk(dir: string, ignore: Set<string>): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (ignore.has(entry)) continue;
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			out.push(...walk(full, ignore));
		} else if (entry.endsWith('.svelte')) {
			out.push(full);
		}
	}
	return out;
}

describe('CIPH-887 PasswordField audit guard', () => {
	it('no .svelte outside PasswordField renders <input type="password">', () => {
		const root = resolve(__dirname, '..', '..');
		const files = walk(root, new Set(['node_modules', '.svelte-kit']));
		const offenders: string[] = [];
		for (const f of files) {
			if (f.endsWith('PasswordField.svelte')) continue;
			const src = readFileSync(f, 'utf8');
			if (/<input[^>]*type=['"]password['"]/.test(src)) {
				offenders.push(f.replace(root + '/', ''));
			}
		}
		expect(
			offenders,
			`These files render a bare <input type="password">. Route them through ` +
				`<PasswordField> from $lib/components/PasswordField.svelte so the ` +
				`show/hide toggle is available everywhere.`,
		).toEqual([]);
	});
});
