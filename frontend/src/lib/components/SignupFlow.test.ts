/**
 * ciphra — SignupFlow component tests (CIPH-741).
 *
 * Ravi's veto: this is the most security-critical new surface and must
 * have tests. We cover:
 *
 *  - password-mismatch error state
 *  - too-short password error state
 *  - server-side register error surfaces the technical detail
 *  - recovery acknowledgment gate: Continue disabled until checkbox ticked;
 *    clicking Continue then fires `signup-complete`
 *  - copy-to-clipboard writes the displayed recovery code
 *
 * The component transitively imports heavy crypto / pdf / api modules. We
 * mock those so the test stays pure; behavior we want to assert is all in
 * the component's own control flow.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// ---- Module mocks (must be declared before importing the component) ----

vi.mock('$lib/api', () => ({
    register: vi.fn(),
    loginInit: vi.fn(),
    login: vi.fn(),
}));

vi.mock('$lib/crypto', () => ({
    createVault: vi.fn(),
    decryptMasterKey: vi.fn(),
    deriveAuthKey: vi.fn(),
}));

vi.mock('$lib/stores/auth', () => ({
    auth: { login: vi.fn() },
}));

vi.mock('$lib/pdf', () => ({
    generateRecoveryPdf: vi.fn(),
}));

vi.mock('$app/environment', () => ({ browser: true }));

import SignupFlow from './SignupFlow.svelte';
import * as api from '$lib/api';
import * as crypto from '$lib/crypto';

// ---- Helpers ----

function fillSignupForm(container: HTMLElement, password: string, confirm: string) {
    const user = container.querySelector('#signup-user') as HTMLInputElement;
    const pass = container.querySelector('#signup-pass') as HTMLInputElement;
    const pass2 = container.querySelector('#signup-pass2') as HTMLInputElement;
    fireEvent.input(user, { target: { value: 'alice' } });
    fireEvent.input(pass, { target: { value: password } });
    fireEvent.input(pass2, { target: { value: confirm } });
}

function submitButton(container: HTMLElement): HTMLButtonElement {
    // The signup form's submit button is the only type="submit" button.
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
}

function errorBlockText(container: HTMLElement): string {
    // The error box uses color var(--danger); find any <p style="color: var(--danger)">
    const ps = Array.from(container.querySelectorAll('p')) as HTMLElement[];
    for (const p of ps) {
        if ((p.getAttribute('style') || '').includes('--danger')) return p.textContent || '';
    }
    return '';
}

// ---- Tests ----

beforeEach(() => {
    vi.clearAllMocks();
});

describe('SignupFlow — error states', () => {
    it('shows password-mismatch error and does not call register', async () => {
        const { container } = render(SignupFlow);
        fillSignupForm(container, 'longenoughpw12', 'differentpw12');
        await fireEvent.click(submitButton(container));
        await waitFor(() => {
            expect(errorBlockText(container).length).toBeGreaterThan(0);
        });
        expect(api.register).not.toHaveBeenCalled();
    });

    it('shows short-password error and does not call register', async () => {
        const { container } = render(SignupFlow);
        fillSignupForm(container, 'short', 'short');
        await fireEvent.click(submitButton(container));
        await waitFor(() => {
            expect(errorBlockText(container).length).toBeGreaterThan(0);
        });
        expect(api.register).not.toHaveBeenCalled();
    });

    it('surfaces server error and hides recovery code screen', async () => {
        vi.mocked(crypto.createVault).mockResolvedValue({
            recovery_code: 'ABCD-EFGH-IJKL',
        } as unknown as Awaited<ReturnType<typeof crypto.createVault>>);
        vi.mocked(api.register).mockResolvedValue({
            ok: false,
            status: 409,
            data: { error: 'username_taken' },
        });

        const { container } = render(SignupFlow);
        fillSignupForm(container, 'longenoughpw12', 'longenoughpw12');
        await fireEvent.click(submitButton(container));

        await waitFor(() => expect(api.register).toHaveBeenCalled());
        // recovery-code-gated screen must NOT be shown (code not rendered)
        expect(container.textContent).not.toContain('ABCD-EFGH-IJKL');
        // error box is shown
        await waitFor(() => {
            expect(errorBlockText(container).length).toBeGreaterThan(0);
        });
    });
});

describe('SignupFlow — recovery-gate screen', () => {
    async function reachRecoveryScreen(events?: Record<string, (e: CustomEvent) => void>) {
        vi.mocked(crypto.createVault).mockResolvedValue({
            recovery_code: 'RECO-1111-2222',
        } as unknown as Awaited<ReturnType<typeof crypto.createVault>>);
        vi.mocked(api.register).mockResolvedValue({ ok: true, status: 200, data: {} });
        vi.mocked(api.loginInit).mockResolvedValue({
            ok: true,
            status: 200,
            data: { auth_params: 'ap' },
        });
        vi.mocked(crypto.deriveAuthKey).mockResolvedValue(new Uint8Array([1, 2, 3]));
        vi.mocked(api.login).mockResolvedValue({
            ok: true,
            status: 200,
            data: {
                token: 't',
                username: 'alice',
                vault: { auth_params: 'ap', vault_params: 'vp', encrypted_master: 'em' },
                is_admin: false,
            },
        });
        vi.mocked(crypto.decryptMasterKey).mockResolvedValue(new Uint8Array([9]));

        const rendered = render(SignupFlow, events ? { events } : undefined);
        fillSignupForm(rendered.container, 'longenoughpw12', 'longenoughpw12');
        await fireEvent.click(submitButton(rendered.container));
        await waitFor(() => {
            expect(rendered.container.textContent).toContain('RECO-1111-2222');
        });
        return rendered;
    }

    it('displays the recovery code after successful register+login', async () => {
        const { container } = await reachRecoveryScreen();
        expect(container.textContent).toContain('RECO-1111-2222');
    });

    it('Continue button is disabled until acknowledgment is ticked', async () => {
        const { container } = await reachRecoveryScreen();
        const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
        const proceed = buttons[buttons.length - 1];
        expect(proceed.disabled).toBe(true);

        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        await fireEvent.click(checkbox);
        expect(proceed.disabled).toBe(false);
    });

    it('emits signup-complete only after Continue is clicked with acknowledgment', async () => {
        const onComplete = vi.fn();
        const { container, component } = await reachRecoveryScreen({
            'signup-complete': onComplete,
        });

        const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
        const proceed = buttons[buttons.length - 1];

        // Click without acknowledging — must be a no-op.
        await fireEvent.click(proceed);
        expect(onComplete).not.toHaveBeenCalled();

        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        await fireEvent.click(checkbox);
        await fireEvent.click(proceed);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('copy-to-clipboard writes the displayed recovery code', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        const { container } = await reachRecoveryScreen();
        const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
        // recovery screen renders: [downloadPdf, copy, proceed]
        const copyBtn = buttons[1];
        await fireEvent.click(copyBtn);
        expect(writeText).toHaveBeenCalledWith('RECO-1111-2222');
    });
});
