#!/usr/bin/env node
// changelog — pending changelog entries live in changelog.d/, one file per
// change; this compiles them.
//
//   node scripts/changelog.mjs check              validate every fragment (CI runs this)
//   node scripts/changelog.mjs preview            print what the next release would say
//   node scripts/changelog.mjs release X.Y.Z [--date YYYY-MM-DD]
//
// `release` is the release PR's one step: it moves CHANGELOG.md's
// [Unreleased] entries plus every fragment into a dated `## [X.Y.Z]` section,
// resets [Unreleased], updates the link references, deletes the fragments and
// sets VERSION + frontend/package.json. Choosing X.Y.Z stays a judgement —
// `scripts/version-next.sh` suggests one (docs/VERSIONING.md).
//
// Why fragments: see changelog.d/README.md. The parsing and rendering live in
// frontend/src/lib/changelogFragments.js, shared with the in-app /docs view.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	checkFragment,
	pendingEntries,
	releaseChangelog,
	renderSections,
} from '../frontend/src/lib/changelogFragments.js';
import { readFragments } from '../frontend/src/lib/changelogFragmentFiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT_DIR = join(ROOT, 'changelog.d');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');

const fragments = () => readFragments(FRAGMENT_DIR);

function fail(message) {
	console.error(`❌ changelog: ${message}`);
	process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

if (command === 'check') {
	const list = fragments();
	const problems = list.flatMap(checkFragment);
	if (problems.length > 0) {
		for (const p of problems) {
			console.error(`❌ changelog.d/${p.file}${p.line ? `:${p.line}` : ''} — ${p.message}`);
		}
		console.error('\nFormat: changelog.d/README.md');
		process.exit(1);
	}
	console.log(`✅ changelog: ${list.length} fragment${list.length === 1 ? '' : 's'} valid.`);
} else if (command === 'preview') {
	const pending = pendingEntries(readFileSync(CHANGELOG, 'utf8'), fragments());
	for (const p of pending.problems) console.error(`⚠️  ${p.file}${p.line ? `:${p.line}` : ''} — ${p.message}`);
	const body = (pending.intro ? `${pending.intro}\n\n` : '') + renderSections(pending.sections);
	process.stdout.write(body || '(nothing pending)\n');
} else if (command === 'release') {
	const version = args[0];
	if (!version) fail('usage: node scripts/changelog.mjs release X.Y.Z [--date YYYY-MM-DD]');
	const dateFlag = args.indexOf('--date');
	const date = dateFlag >= 0 ? args[dateFlag + 1] : new Date().toLocaleDateString('sv-SE');
	const list = fragments();
	let next;
	try {
		next = releaseChangelog(readFileSync(CHANGELOG, 'utf8'), list, version, date);
	} catch (e) {
		fail(e instanceof Error ? e.message : String(e));
	}
	writeFileSync(CHANGELOG, next);
	writeFileSync(join(ROOT, 'VERSION'), `${version}\n`);
	const pkgPath = join(ROOT, 'frontend', 'package.json');
	const pkg = readFileSync(pkgPath, 'utf8');
	// Edit the one field in place rather than re-serialising, so the file's
	// formatting (and the diff) stays exactly as it was.
	const bumped = pkg.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
	if (bumped === pkg && !pkg.includes(`"version": "${version}"`)) fail('could not find "version" in frontend/package.json.');
	writeFileSync(pkgPath, bumped);
	for (const f of list) rmSync(join(FRAGMENT_DIR, f.name));
	console.log(`✅ changelog: released ${version} (${date}) — ${list.length} fragment${list.length === 1 ? '' : 's'} folded in.`);
	console.log('   CHANGELOG.md, VERSION and frontend/package.json updated; fragments removed.');
	console.log('   Review the new section (add a short intro if the release deserves one), then run scripts/version-guard.sh.');
} else {
	fail('usage: node scripts/changelog.mjs check | preview | release X.Y.Z [--date YYYY-MM-DD]');
}
