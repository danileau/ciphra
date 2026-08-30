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
 * about disclosure. docs/SECURITY_MODEL.md is scoped to server + device and
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

describe('the diary is not offered a switch it does not have', () => {
	/**
	 * `isExportable` drops every `type: 'diary'` document unconditionally —
	 * there is no toggle, by design. The journal's moment view rendered the
	 * private switch for diary entries anyway, and its default state reads
	 * "Standard — Erscheint im Export für die Ärztin."
	 *
	 * So the surface built for the things people do not want read told them
	 * their entry was on its way to a doctor, and the switch that appeared to
	 * control it did nothing in either position. A user asked us to explain it.
	 */
	const GUARD = "{#if momentDoc.data.type === 'diary'}";
	const TOGGLE = 'bind:checked={momentPrivate}';

	it('the toggle sits in the non-diary branch', () => {
		const src = read('routes/journal/+page.svelte');
		const idx = src.indexOf(TOGGLE);
		expect(idx, 'the private toggle should still exist for entries/markers').toBeGreaterThan(0);

		const before = src.slice(0, idx);
		const lastElse = before.lastIndexOf('{:else}');
		expect(lastElse, 'the toggle is not behind an {:else}').toBeGreaterThan(0);
		expect(
			before.lastIndexOf(GUARD, lastElse),
			'the {:else} the toggle sits in does not belong to a diary check',
		).toBeGreaterThan(0);
		expect(
			before.slice(lastElse).includes('{/if}'),
			'the diary branch closes before the toggle, so the toggle is unguarded',
		).toBe(false);
	});

	it('the diary branch states the truth instead', () => {
		const src = read('routes/journal/+page.svelte');
		const idx = src.indexOf(TOGGLE);
		const diaryBranch = src.slice(src.lastIndexOf(GUARD, idx), idx);
		expect(diaryBranch).toContain("$t('journal.diary_hint')");
	});

	it('a diary entry keeps the flag when saved', () => {
		// Belt-and-suspenders: the type alone excludes it, but a doc whose flag
		// was cleared while the toggle was still offered gets repaired.
		const src = read('routes/journal/+page.svelte');
		expect(src).toMatch(
			/if \(momentPrivate \|\| momentDoc\.data\.type === 'diary'\) updated\.private = true;/,
		);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the diary hint promises no export`, () => {
			const v = dict['journal.diary_hint'];
			expect(v, `${name}: journal.diary_hint missing`).toBeTruthy();
			expect(v).not.toMatch(
				/Export für die Ärztin|export pour le médecin|esportazione per il medico|doctor export/i,
			);
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
