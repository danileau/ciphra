/**
 * The privacy hint must follow the state it describes.
 *
 * `private.tooltip` reads "Privater Eintrag — wird nie exportiert oder
 * geteilt." Two surfaces rendered it UNCONDITIONALLY next to a state label
 * that is "Standard" (exportable) by default, so the row directly under the
 * note field read:
 *
 *     Standard — Privater Eintrag — wird nie exportiert oder geteilt.
 *
 * while the note was in fact printed verbatim on the PDF handed to a doctor.
 * That is not a vague hint; it is an affirmative false statement about where
 * health data goes, shown at the moment of authoring.
 *
 * It matters more than a normal copy bug because ciphra's whole promise is
 * about disclosure. SECURITY.md is scoped to the server and the device and
 * says nothing about the export — the one channel where the text genuinely
 * leaves the user's control, by design and by their own action.
 *
 * `EntryPreview.svelte` was already correct: it renders the tooltip inside
 * `{#if isPrivate}`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const SURFACES = [
	['routes/+layout.svelte', 'quickAddPrivate'],
	['routes/journal/+page.svelte', 'momentPrivate'],
] as const;

const DICTS: Array<[string, Record<string, string>]> = [
	['de', de], ['en', en], ['fr', fr], ['it', itDict],
];

describe('the "never exported" hint is gated on the private state', () => {
	for (const [file, flag] of SURFACES) {
		it(`${file} only shows private.tooltip when ${flag} is true`, () => {
			const src = read(file);
			// Every occurrence must sit in a ternary keyed on the private flag.
			const uses = src.match(/\$t\('private\.tooltip'\)/g) ?? [];
			expect(uses.length, 'tooltip should be rendered once here').toBe(1);
			const re = new RegExp(`${flag}\\s*\\?\\s*\\$t\\('private\\.tooltip'\\)`);
			expect(
				src,
				`${file}: private.tooltip is rendered without checking ${flag}. In the ` +
					`default state that tells the user their entry is never exported, ` +
					`while it is printed on the doctor PDF.`,
			).toMatch(re);
		});

		it(`${file} states the truth in the default state`, () => {
			expect(read(file)).toContain("$t('private.state_public_hint')");
		});
	}

	for (const [name, dict] of DICTS) {
		it(`${name}: the default-state hint names the export`, () => {
			const v = dict['private.state_public_hint'];
			expect(v, `${name}: private.state_public_hint missing`).toBeTruthy();
			// It has to name the destination, not just be neutral filler.
			expect(v).toMatch(/export|esporta|Ärztin|médecin|medico|doctor/i);
		});

		it(`${name}: the quick-add hint no longer promises only a chart line`, () => {
			// It used to say only "Creates a vertical line on the trend chart",
			// naming the in-app chart and omitting the doctor export entirely.
			const v = dict['quickadd.mode_event_hint'];
			expect(v, `${name}: hint missing`).toBeTruthy();
			expect(v).toMatch(/export|esporta|Ärztin|médecin|medico|doctor/i);
		});
	}
});

describe('the section hint cannot contradict the toggle', () => {
	it('the quick-add mode hint is gated on the same flag', () => {
		// First pass at this fix left the section hint unconditional, so the
		// private state read "Appears in the trend and in the doctor export"
		// directly above "never exported or shared" — a new instance of the
		// very bug being fixed, two lines apart.
		const src = read('routes/+layout.svelte');
		expect(src).toMatch(
			/quickAddPrivate\s*\?\s*\$t\('quickadd\.mode_event_hint_private'\)\s*:\s*\$t\('quickadd\.mode_event_hint'\)/,
		);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the private variant promises no export and no trend`, () => {
			const v = dict['quickadd.mode_event_hint_private'];
			expect(v, `${name}: private hint missing`).toBeTruthy();
			expect(v).not.toMatch(/doctor export|Export für die Ärztin|export pour le médecin|esportazione per il medico/i);
		});
	}
});

describe('the guard is not vacuous', () => {
	it('private.tooltip still says what it says', () => {
		// If someone "fixes" this by watering down the string instead, the
		// gating above becomes pointless.
		expect(de['private.tooltip']).toMatch(/nie exportiert/i);
		expect(en['private.tooltip']).toMatch(/never exported/i);
	});

	it('EntryPreview keeps its already-correct conditional render', () => {
		const src = read('lib/components/EntryPreview.svelte');
		const idx = src.indexOf("$t('private.tooltip')");
		expect(idx).toBeGreaterThan(0);
		// The nearest preceding block opener is the isPrivate guard.
		expect(src.slice(0, idx)).toMatch(/\{#if isPrivate\}[\s\S]*$/);
	});
});
