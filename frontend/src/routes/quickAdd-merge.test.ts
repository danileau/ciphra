/**
 * CIPH-875 — FAB quick-add must merge into today's existing `type:'entry'`
 * instead of creating a parallel row.
 *
 * This is a source-parse test — it pins the three behaviors that caused the
 * original bug: we searched `$documents` for today's entry, we called
 * `updateDoc` on the merge path, and we incremented (not overwrote) the
 * episode count. The runtime logic lives in `+layout.svelte` and is
 * exercised by the browser smoke matrix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');

describe('FAB quick-add merge (CIPH-875)', () => {
	it('looks up today\'s existing entry before saving', () => {
		expect(LAYOUT).toMatch(/d\.data\?\.type === 'entry'.*d\.data\?\.date === todayStr/s);
	});

	it('calls updateDoc when an existing entry is found', () => {
		expect(LAYOUT).toMatch(/if \(existing\)[\s\S]{0,400}documents\.updateDoc\(existing\.id/);
	});

	it('increments the episode count rather than overwriting it', () => {
		expect(LAYOUT).toMatch(/prevCount \+ 1/);
	});

	it('preserves the first-seen episode time on merge', () => {
		expect(LAYOUT).toMatch(/cur\.episodeTimes\?\.\[quickAddSelectedEpisode\] \|\| nowTime/);
	});

	it('appends — does not replace — per-episode notes on merge', () => {
		expect(LAYOUT).toMatch(/prevNote \? `\$\{prevNote\}\\n/);
	});

	it('still mints a fresh entry when no entry for today exists', () => {
		expect(LAYOUT).toMatch(/} else \{[\s\S]{0,200}documents\.save\(\{[\s\S]{0,200}type: 'entry'/);
	});
});
