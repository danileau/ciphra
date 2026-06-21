/**
 * Native-validation-bubble guard.
 *
 * The auth forms have repeatedly leaked the browser's NATIVE validation UI —
 * un-styled, browser-locale (usually English) popups like "Please match the
 * requested format" (`pattern`) or "Please fill out this field" (`required`) —
 * which contradicts the app's own styled, i18n'd error messages.
 *
 * Root cause each time: a `<form>` without `novalidate`, so the browser runs
 * constraint validation on submit before the app's JS handler. Fix: every auth
 * form is `novalidate` and owns validation in JS with styled errors.
 *
 * This test pins that: any auth form missing `novalidate` fails CI, so the
 * bug class can't return a fourth time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');

const AUTH_FORM_FILES = [
	'lib/components/SignupFlow.svelte',
	'lib/components/LoginForm.svelte',
	'routes/login/+page.svelte',
];

describe('auth forms suppress native validation bubbles', () => {
	for (const rel of AUTH_FORM_FILES) {
		const src = readFileSync(resolve(SRC, rel), 'utf8');
		const formTags = src.match(/<form\b[^>]*>/g) || [];

		it(`${rel} has at least one <form>`, () => {
			expect(formTags.length).toBeGreaterThan(0);
		});

		it(`${rel} — every <form> is novalidate`, () => {
			for (const tag of formTags) {
				expect(
					/\bnovalidate\b/.test(tag),
					`A <form> in ${rel} is missing \`novalidate\`, so the browser will ` +
						`show native validation bubbles (un-styled, browser-locale) instead ` +
						`of the app's styled i18n errors. Add novalidate + validate in JS.\n  ${tag}`,
				).toBe(true);
			}
		});
	}
});
