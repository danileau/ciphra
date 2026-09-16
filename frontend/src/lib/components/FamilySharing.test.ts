/**
 * FamilySharing — failures are said out loud, in the user's language.
 *
 * `revoke` and `revokeAll` ignored `!res.ok`: the panic button could fail and
 * look like it worked. `createInvite` had no catch, so an offline attempt just
 * stopped spinning. A failed grant list rendered "no invitations" and hid the
 * revoke buttons. Errors that did show were the server's English text, and the
 * "last seen" ages were hard-coded English units.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import de from '$lib/i18n/de';
import { locale } from '$lib/i18n';

const api = vi.hoisted(() => ({
	familyGrantList: vi.fn(),
	familyGrantCreate: vi.fn(),
	familyGrantRescope: vi.fn(),
	familyGrantRevoke: vi.fn(),
	familyGrantRevokeAll: vi.fn(),
}));

vi.mock('$lib/api', () => api);
vi.mock('$lib/crypto', () => ({
	createFamilyGrant: vi.fn(async () => ({ grant_params: 'p', grant_auth: 'a', wrapped_master: 'w', family_code: 'eins zwei drei vier fünf sechs' })),
	encryptData: vi.fn(async (s: string) => `enc:${s}`),
	decryptData: vi.fn(async (s: string) => s.replace(/^enc:/, '')),
}));
vi.mock('$lib/stores/auth', () => ({
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: new Uint8Array(32), username: 'eva' }); return () => {}; } },
}));

import FamilySharing from './FamilySharing.svelte';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const grant = (id: number, extra: Record<string, unknown> = {}) => ({
	id, label: `enc:Grant ${id}`, created_at: '2026-09-01T10:00:00Z', claimed_at: null,
	claimed_by_username: 'hans', last_access_at: null, share_mask: 1, ...extra,
});

beforeEach(() => {
	vi.clearAllMocks();
	locale.set('de');
	vi.stubGlobal('confirm', vi.fn(() => true));
	api.familyGrantList.mockResolvedValue({ ok: true, status: 200, data: { grants: [grant(1), grant(2)] } });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('FamilySharing failures', () => {
	it('a failed "revoke all" says access was not removed', async () => {
		api.familyGrantRevokeAll.mockResolvedValue({ ok: false, status: 500, data: { error: 'Failed to revoke' } });
		const { getByText, findByTestId } = render(FamilySharing);
		await fireEvent.click(await waitFor(() => getByText(de['family.revoke_all'])));
		const err = await findByTestId('family-revoke-error');
		expect(err.textContent).toBe(de['family.error_revoke_all']);
		expect(err.textContent).not.toContain('Failed');
	});

	it('a revoke that throws (offline) says so too', async () => {
		api.familyGrantRevoke.mockRejectedValue(new TypeError('Failed to fetch'));
		const { getAllByText, findByTestId } = render(FamilySharing);
		const buttons = await waitFor(() => getAllByText(de['family.revoke']));
		await fireEvent.click(buttons[0]);
		expect((await findByTestId('family-revoke-error')).textContent).toBe(de['family.error_revoke']);
	});

	it('a failed list load is an error with a retry, not "no invitations"', async () => {
		api.familyGrantList.mockResolvedValueOnce({ ok: false, status: 502, data: {} });
		const { findByText, queryByText, getByText } = render(FamilySharing);
		await findByText(de['family.error_load']);
		expect(queryByText(de['family.no_grants'])).toBeNull();
		await fireEvent.click(getByText(de['common.retry']));
		await findByText('Grant 1');
	});

	it('a failed invite shows the translated message, never the server text', async () => {
		api.familyGrantCreate.mockResolvedValue({ ok: false, status: 400, data: { error: 'Invalid share_mask' } });
		const { getByText, container, findByText } = render(FamilySharing);
		await fireEvent.click(getByText(de['family.create_invite']));
		const input = container.querySelector('input[type="text"]') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Mama' } });
		await fireEvent.submit(input.closest('form') as HTMLFormElement);
		await findByText(de['family.error_create']);
		expect(container.textContent).not.toContain('Invalid share_mask');
	});

	it('an invite attempt that throws ends in an error, not a silent stop', async () => {
		api.familyGrantCreate.mockRejectedValue(new TypeError('Failed to fetch'));
		const { getByText, container, findByText } = render(FamilySharing);
		await fireEvent.click(getByText(de['family.create_invite']));
		const input = container.querySelector('input[type="text"]') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Mama' } });
		await fireEvent.submit(input.closest('form') as HTMLFormElement);
		await findByText(de['family.error_create']);
	});
});

describe('no raw server error text on screen', () => {
	it('FamilySharing and Settings never show the API\'s `error` string', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const family = readFileSync(join(__dirname, 'FamilySharing.svelte'), 'utf8');
		const settings = readFileSync(join(__dirname, '..', '..', 'routes', 'settings', '+page.svelte'), 'utf8');
		for (const src of [family, settings]) {
			expect(src).not.toMatch(/data\??\.error/);
			expect(src).not.toMatch(/\|\| 'Failed'/);
		}
		expect(settings).toMatch(/passwordError = credentialCheckError\(res\.status\)/);
		expect(settings).toMatch(/deleteError = credentialCheckError\(res\.status\)/);
	});
});

describe('FamilySharing "last seen"', () => {
	it('uses translated, pluralised units', async () => {
		api.familyGrantList.mockResolvedValue({
			ok: true, status: 200,
			data: { grants: [
				grant(1, { last_access_at: minutesAgo(5) }),
				grant(2, { last_access_at: minutesAgo(60 * 3) }),
				grant(3, { last_access_at: minutesAgo(60 * 24) }),
			] },
		});
		const { findByText, container } = render(FamilySharing);
		await findByText('Zuletzt gesehen vor 5 Minuten');
		await findByText('Zuletzt gesehen vor 3 Stunden');
		await findByText('Zuletzt gesehen vor 1 Tag');
		expect(container.textContent).not.toMatch(/\d+ (min|h|d)\b/);
	});
});
