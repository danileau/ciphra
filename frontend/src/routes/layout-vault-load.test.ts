/**
 * Linked-vault loading in the app shell.
 *
 * Two bugs put one account's data under another account's banner:
 *
 *  1. A reload inside a linked vault restores `activeVault` from
 *     sessionStorage, but the patient's key lives in the family links. The
 *     shell loaded documents and links in parallel; the documents load won,
 *     found no link, fell back to the caregiver's OWN vault and rendered it
 *     under the patient's banner — and the next write went there too.
 *  2. The vault-switch reactive only reloaded when `docsLoaded` was true but
 *     always recorded `lastVault`, so a switch during a load was dropped:
 *     A→B→C showed B under C, and a revoke snap-back mid-load was lost. Retry
 *     reloaded documents but not the blueprint.
 *
 * The store half (no silent fallback, a superseded load does not render) is
 * covered in lib/stores/documents.sync-integrity.test.ts. The shell's
 * orchestration is exercised by the browser smoke matrix; this pins its shape
 * the way quickAdd-merge.test.ts does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');

function body(name: string): string {
	const start = LAYOUT.indexOf(`async function ${name}(`);
	expect(start, `${name} not found`).toBeGreaterThan(-1);
	// Up to the next top-level declaration in the script block.
	const rest = LAYOUT.slice(start);
	const end = rest.search(/\n\t(?:async function|function|let|\$:|\/\/ )/);
	return rest.slice(0, end > 0 ? end : undefined);
}

describe('linked-vault initial load', () => {
	it('loads the family links BEFORE the documents when a vault is active', () => {
		const fn = body('loadInitialDocs');
		const linked = fn.slice(fn.indexOf('if (vault !== null)'), fn.indexOf('} else {'));
		expect(linked).toMatch(/await familyLinks\.load\(\)[\s\S]*snapToKnownVault\(\)[\s\S]*await documents\.load\(\)/);
	});

	it('starts over when the active vault changed while it was loading', () => {
		const fn = body('loadInitialDocs');
		expect(fn).toMatch(/if \(get\(activeVault\) !== vault\)[\s\S]{0,200}return loadInitialDocs\(attempt\)/);
	});

	it('drops an active vault the loaded links do not grant', () => {
		expect(LAYOUT).toMatch(/linksLoaded && !\$familyLinks\.some\(l => l\.sourceUserId === \$activeVault\)/);
	});
});

describe('vault switches', () => {
	it('the switch reactive is not gated on docsLoaded any more', () => {
		const block = LAYOUT.slice(LAYOUT.indexOf('let lastVault'), LAYOUT.indexOf('lastVault = v;'));
		expect(block).not.toMatch(/docsLoaded/);
		expect(block).toMatch(/reloadVault\(\)/);
	});

	it('a superseded reload leaves the blueprint and docsLoaded alone', () => {
		const fn = body('reloadVault');
		expect(fn).toMatch(/const seq = \+\+vaultLoadSeq/);
		expect(fn).toMatch(/if \(seq !== vaultLoadSeq\) return;[\s\S]*blueprint\.loadFromDocuments\(\)/);
	});

	it('Retry reloads through reloadVault (documents + blueprint), not documents.load() alone', () => {
		const retry = LAYOUT.slice(LAYOUT.indexOf("{$t('common.retry')}") - 400, LAYOUT.indexOf("{$t('common.retry')}"));
		expect(retry).toMatch(/reloadVault\(\{ keepShown: true \}\)/);
		expect(retry).not.toMatch(/documents\.load\(\)/);
	});
});
