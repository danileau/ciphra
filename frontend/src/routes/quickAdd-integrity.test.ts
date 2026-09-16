/**
 * FAB quick-add + /log/[date] — a save that did not happen must not look
 * like one, a double press must not write twice, and "today" is local.
 *
 * Source-parse, like quickAdd-merge.test.ts: the runtime paths live in
 * +layout.svelte and the /log route and are exercised by the browser smoke
 * matrix. The composer half is mounted in EntryComposer.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');
const LOG = readFileSync(join(__dirname, 'log', '[date]', '+page.svelte'), 'utf8');

const quickAddSave = LAYOUT.slice(
	LAYOUT.indexOf('async function quickAddSave('),
	LAYOUT.indexOf('function quickAddReset('),
);

describe('quick-add save results', () => {
	it('every write in quickAddSave feeds its result into quickAddFinish', () => {
		const writes = quickAddSave.match(/await documents\.(save|updateDoc)\(/g) || [];
		const captured = quickAddSave.match(/(?:const ok =|ok =) await documents\.(save|updateDoc)\(/g) || [];
		expect(writes.length).toBeGreaterThan(0);
		expect(captured.length).toBe(writes.length);
		expect(quickAddSave.match(/quickAddFinish\(ok,/g)?.length).toBe(3);
	});

	it('a failed save keeps the sheet open with the input and shows an error', () => {
		const finish = LAYOUT.slice(LAYOUT.indexOf('function quickAddFinish('), LAYOUT.indexOf('async function quickAddSave('));
		expect(finish).toMatch(/if \(!ok\) \{\s*quickAddError = true;\s*return;/);
		// The reset (which clears the input) only runs on success.
		expect(finish.indexOf('reset()')).toBeGreaterThan(finish.indexOf('if (!ok)'));
		expect(LAYOUT).toMatch(/\{#if quickAddError\}[\s\S]{0,300}\$t\('quickadd\.save_failed'\)/);
	});

	it('a save already running ignores another press — button, Enter, whatever', () => {
		expect(quickAddSave).toMatch(/^async function quickAddSave\(\) \{[\s\S]{0,200}if \(quickAddSaving\) return;/);
		expect(LAYOUT).toMatch(/e\.key === 'Enter' && !quickAddSaving/);
	});

	it('stamps the LOCAL date, not the UTC one', () => {
		expect(quickAddSave).toMatch(/const todayStr = toLocalISODate\(now\)/);
		expect(quickAddSave).not.toMatch(/toISOString/);
	});
});

describe('quick-add in someone else\'s vault', () => {
	it('offers neither the diary nor the private toggle there', () => {
		expect(LAYOUT).toMatch(/\$: quickAddLinked = \$activeVault !== null/);
		expect(LAYOUT).toMatch(/\{#if !quickAddLinked\}\s*<button[\s\S]{0,200}quickAddMode = 'diary'/);
		expect(LAYOUT).toMatch(/\{#if quickAddLinked\}[\s\S]{0,400}quickadd\.linked_hint[\s\S]{0,300}\{:else\}\s*<label[\s\S]{0,300}bind:checked=\{quickAddPrivate\}/);
	});

	it('never writes a private or diary document there, even from remembered state', () => {
		expect(LAYOUT).toMatch(/\$: if \(quickAddLinked && quickAddMode === 'diary'\) quickAddMode = 'log'/);
		expect(quickAddSave).toMatch(/const privateFlag = !quickAddLinked && quickAddPrivate \? true : undefined/);
		expect(quickAddSave).not.toMatch(/private: quickAddPrivate/);
		expect(quickAddSave).toMatch(/if \(!diaryText\.trim\(\) \|\| quickAddLinked\) return;/);
	});
});

describe('/log/[date] adapter', () => {
	it('handleSave returns whether the write happened', () => {
		expect(LOG).toMatch(/async function handleSave\(data: EntryData\): Promise<boolean>/);
		expect(LOG).toMatch(/const ok = existing\s*\? await documents\.updateDoc\(existing\.id, data\)\s*: await documents\.save\(data\);\s*if \(!ok\) return false;/);
	});

	it('handleDelete only leaves the page when the delete worked', () => {
		const fn = LOG.slice(LOG.indexOf('async function handleDelete('), LOG.indexOf('function handleDateChange('));
		expect(fn).toMatch(/if \(!\(await documents\.remove\(existingDoc\.id\)\)\) return false;[\s\S]*history\.back\(\)/);
	});

	it('asks before navigation discards unsaved edits', () => {
		expect(LOG).toMatch(/beforeNavigate\(\(nav\) => \{[\s\S]{0,500}confirm\(\$t\('protocol\.unsaved_confirm'\)\)[\s\S]{0,40}nav\.cancel\(\)/);
		expect(LOG).toMatch(/onDirtyChange=\{\(d\) => \(dirty = d\)\}/);
	});
});
