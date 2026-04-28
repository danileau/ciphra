/**
 * CIPH-883 — Guided custom-preset wizard guard.
 *
 * The standard wizard's symptom/trigger/vital toggle screens are empty
 * for users picking the `custom` preset (the preset has no items to
 * opt out of). PI v13's guided flow detects that case and rewrites
 * step 2 + step 3 with narrative copy + auto-opens `CustomItemModal`
 * for the relevant kind so users build their blueprint by adding
 * rather than toggling.
 *
 * This test source-parses `setup/+page.svelte` to lock the four
 * invariants the guided flow depends on.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-883 — guided custom-preset wizard', () => {
	it('declares isCustomPreset reactive based on conditionId', () => {
		expect(SRC).toMatch(/isCustomPreset\s*=\s*working\?\.conditionId\s*===\s*['"]custom['"]/);
	});

	it('auto-opens the symptom modal on step 2 when custom + no symptoms yet', () => {
		// Look for the reactive guard that fires only once per step entry.
		expect(SRC).toMatch(/isCustomPreset\s*&&\s*step\s*===\s*2[\s\S]*?openCustomModal\(['"]symptom['"]\)/);
	});

	it('auto-opens the trigger modal on step 3 when custom + no triggers yet', () => {
		expect(SRC).toMatch(/isCustomPreset\s*&&\s*step\s*===\s*3[\s\S]*?openCustomModal\(['"]trigger['"]\)/);
	});

	it('shows narrative copy in step 2 + step 3 when custom preset', () => {
		expect(SRC).toContain('setup.guided_symptoms_title');
		expect(SRC).toContain('setup.guided_triggers_title');
	});
});
