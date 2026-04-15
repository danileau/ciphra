/**
 * CIPH-884 — FAB remembers the last-selected episode type and floats it
 * to the front of the picker. Non-destructive: the full list remains
 * available, only the order shifts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');

describe('CIPH-884 FAB last-used episode', () => {
	it('defines a stable localStorage key', () => {
		expect(LAYOUT).toMatch(/QUICKADD_LAST_EP_KEY = 'ciphra_quickadd_last_episode'/);
	});

	it('persists on selection via selectEpisodeType', () => {
		expect(LAYOUT).toMatch(/lastEpisodeId = id/);
		expect(LAYOUT).toMatch(/localStorage\.setItem\(QUICKADD_LAST_EP_KEY/);
	});

	it('hydrates lastEpisodeId on mount', () => {
		expect(LAYOUT).toMatch(/lastEpisodeId = localStorage\.getItem\(QUICKADD_LAST_EP_KEY\)/);
	});

	it('reorders episodeTypes reactively with the last-used first', () => {
		expect(LAYOUT).toMatch(/\$:\s*episodeTypesOrdered\s*=/);
		expect(LAYOUT).toMatch(/bp\.episodeTypes\.find\(\(e\) => e\.id === lastEpisodeId\)/);
	});

	it('renders the "last" marker only on index 0 when the first chip is the remembered one', () => {
		expect(LAYOUT).toMatch(/epIdx === 0 && lastEpisodeId === ep\.id/);
		expect(LAYOUT).toMatch(/\$t\('quickadd\.last_used'\)/);
	});

	it('hides the marker when there is only one episode type (nothing to reorder)', () => {
		expect(LAYOUT).toMatch(/bp\.episodeTypes\.length > 1/);
	});

	it('template iterates the reordered list, not the raw bp.episodeTypes', () => {
		expect(LAYOUT).toMatch(/#each episodeTypesOrdered as ep/);
	});
});
