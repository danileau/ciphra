/**
 * ciphra — LoginForm vs. autofill (2026-11-03).
 *
 * On iOS Brave a returning user got "wrong username or password" with
 * "Invalid username" in the technical details, while the same credentials
 * worked in a private tab. Two ways a browser gets there, both pinned here:
 *
 *  - autofill sets the field's value without firing `input`, so the bound
 *    copy stays '' (or a typed prefix) and the form sent that;
 *  - a saved login whose username is not one (a recovery code saved by the
 *    pre-#196 recovery form) fills both fields, events and all.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';

vi.mock('$lib/api', () => ({
	loginInit: vi.fn(),
	login: vi.fn(),
}));

vi.mock('$lib/crypto', () => ({
	decryptMasterKey: vi.fn(),
	deriveAuthKey: vi.fn(),
}));

vi.mock('$lib/stores/auth', () => ({
	auth: { login: vi.fn() },
}));

import LoginForm from './LoginForm.svelte';
import * as api from '$lib/api';
import * as crypto from '$lib/crypto';
// jsdom reports navigator.language = en-US, so the form renders English.
import en from '$lib/i18n/en';

const AUTOFILL_MSG = en['auth.error_username_autofill'];

function fields(container: HTMLElement) {
	return {
		user: container.querySelector('#login-user') as HTMLInputElement,
		pass: container.querySelector('#login-pass') as HTMLInputElement,
		form: container.querySelector('form') as HTMLFormElement,
	};
}

beforeEach(() => {
	vi.mocked(api.loginInit).mockReset().mockResolvedValue({ ok: false, status: 400, data: { error: 'stop here' } });
	vi.mocked(api.login).mockReset();
	vi.mocked(crypto.deriveAuthKey).mockReset();
});

describe('LoginForm — what is sent is what the fields show', () => {
	it('sends a username autofilled without an input event', async () => {
		const { container } = render(LoginForm);
		const { user, form } = fields(container);
		user.value = 'alice_01'; // what iOS autofill does: no event
		await fireEvent.submit(form);
		await waitFor(() => expect(api.loginInit).toHaveBeenCalledWith('alice_01'));
	});

	it('sends the completed value when autofill finished a typed prefix silently', async () => {
		const { container } = render(LoginForm);
		const { user, form } = fields(container);
		await fireEvent.input(user, { target: { value: 'al' } });
		user.value = 'alice_01';
		await fireEvent.submit(form);
		await waitFor(() => expect(api.loginInit).toHaveBeenCalledWith('alice_01'));
	});

	it('derives from a password autofilled without an input event', async () => {
		vi.mocked(api.loginInit).mockResolvedValue({ ok: true, status: 200, data: { auth_params: 'p' } });
		vi.mocked(crypto.deriveAuthKey).mockResolvedValue('k');
		vi.mocked(api.login).mockResolvedValue({ ok: false, status: 401, data: { error: 'Invalid credentials' } });
		const { container } = render(LoginForm);
		const { user, pass, form } = fields(container);
		user.value = 'alice_01';
		pass.value = 'correct horse battery';
		await fireEvent.submit(form);
		await waitFor(() => expect(crypto.deriveAuthKey).toHaveBeenCalledWith('correct horse battery', 'p'));
	});

	it('drops invisible characters a keyboard or manager carried in', async () => {
		const { container } = render(LoginForm);
		const { user, form } = fields(container);
		await fireEvent.input(user, { target: { value: '​Alice_01﻿ ' } });
		await fireEvent.submit(form);
		await waitFor(() => expect(api.loginInit).toHaveBeenCalledWith('alice_01'));
	});
});

describe('LoginForm — a username no account can have never reaches the server', () => {
	it('stops a saved recovery code, explains it, and does not print it', async () => {
		const code = 'able acid aged also area army away baby back ball born boss';
		const { container } = render(LoginForm);
		const { getByText } = within(container);
		const { user, form } = fields(container);
		await fireEvent.input(user, { target: { value: code } });
		await fireEvent.submit(form);
		await waitFor(() => getByText(AUTOFILL_MSG));
		expect(api.loginInit).not.toHaveBeenCalled();
		const details = container.querySelector('details')!.textContent!;
		expect(details).toContain('U+0020 ×11');
		expect(details).not.toContain('able');
	});

	it('stops an empty field instead of sending ""', async () => {
		const { container } = render(LoginForm);
		const { getByText } = within(container);
		await fireEvent.submit(fields(container).form);
		await waitFor(() => getByText(AUTOFILL_MSG));
		expect(api.loginInit).not.toHaveBeenCalled();
	});
});
