/**
 * Changelog fragments (2026-09-16).
 *
 * Pending entries live in changelog.d/, one file per change, because every PR
 * editing CHANGELOG.md's [Unreleased] block conflicted with every other open
 * PR — and resolving one lost #192's entries. These tests pin the compiler
 * that the release script and the in-app /docs view share.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	SECTION_ORDER,
	UNRELEASED_PLACEHOLDER,
	checkFragment,
	parseEntries,
	pendingEntries,
	releaseChangelog,
	renderSections,
	withPendingFragments,
} from './changelogFragments.js';
import { readFragments } from './changelogFragmentFiles.js';

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

${UNRELEASED_PLACEHOLDER}

## [1.3.0] — 2026-08-30

### Added
- Something old.

[Unreleased]: https://git.example.org/you/ciphra/compare/v1.3.0...HEAD
[1.3.0]: https://git.example.org/you/ciphra/releases/tag/v1.3.0
`;

const doseHistory = {
	name: 'feat-medication-history.md',
	text: `### Added
- **Medication changes now have a history.** When a dose changes, choose
  *Change* on the medication.

### Fixed
- Deleting a medication removed it from your reports.
`,
};
const syncFix = {
	name: 'fix-offline-sync.md',
	text: `### Security
- An entry locked offline synced as shareable.

### Fixed
- A failed save said "Saved".
`,
};

describe('parseEntries', () => {
	it('keeps multi-line entries verbatim, grouped by section', () => {
		const { sections, problems } = parseEntries(doseHistory.text);
		expect(problems).toEqual([]);
		expect(sections.get('Added')).toEqual([
			'- **Medication changes now have a history.** When a dose changes, choose\n  *Change* on the medication.',
		]);
		expect(sections.get('Fixed')).toEqual(['- Deleting a medication removed it from your reports.']);
	});

	it('ignores HTML comments and blank lines', () => {
		const { sections, problems } = parseEntries('<!-- note -->\n\n### Fixed\n\n- One.\n\n- Two.\n');
		expect(problems).toEqual([]);
		expect(sections.get('Fixed')).toEqual(['- One.', '- Two.']);
	});

	it('reports what would otherwise be lost, with line numbers', () => {
		const { problems } = parseEntries('- no heading\n### Improved\n- x\n### Fixed\nstray prose\n## [1.0.0]\n### Added\n', {
			file: 'bad.md',
		});
		expect(problems.map((p) => [p.line, p.message.split(' ')[0]])).toEqual([
			[1, 'Entry'],
			[2, 'Unknown'],
			[3, 'Entry'],
			[5, 'Text'],
			[6, 'Only'],
			[4, '"###'],
			[7, '"###'],
		]);
	});

	it('accepts an intro paragraph only where it is allowed', () => {
		expect(parseEntries('A release note.\n\n### Fixed\n- x\n', { allowIntro: true }).intro).toBe('A release note.');
		expect(parseEntries('A release note.\n\n### Fixed\n- x\n').problems).toHaveLength(1);
	});
});

describe('checkFragment', () => {
	it('accepts a well-formed fragment', () => {
		expect(checkFragment(doseHistory)).toEqual([]);
	});
	it('rejects an empty fragment and a bad file name', () => {
		expect(checkFragment({ name: 'Fix Thing.md', text: '### Fixed\n- x\n' })[0].message).toMatch(/kebab-case/);
		expect(checkFragment({ name: 'empty.md', text: '<!-- nothing -->\n' })[0].message).toMatch(/No entries/);
	});
});

describe('pending entries', () => {
	it('merges [Unreleased] and fragments in section order, fragments sorted by name, duplicates once', () => {
		const withLegacy = CHANGELOG.replace(UNRELEASED_PLACEHOLDER, '### Fixed\n- Legacy fix.\n### Fixed\n- Legacy fix.\n');
		const pending = pendingEntries(withLegacy, [syncFix, doseHistory]);
		expect([...pending.sections.keys()].sort()).toEqual(['Added', 'Fixed', 'Security']);
		expect(pending.sections.get('Fixed')).toEqual([
			'- Legacy fix.',
			'- Deleting a medication removed it from your reports.',
			'- A failed save said "Saved".',
		]);
		const rendered = renderSections(pending.sections);
		const order = SECTION_ORDER.filter((s) => rendered.includes(`### ${s}`));
		expect(order).toEqual(['Added', 'Fixed', 'Security']);
		expect(rendered.indexOf('### Added')).toBeLessThan(rendered.indexOf('### Fixed'));
	});
});

describe('withPendingFragments — the in-app view', () => {
	it('shows fragments under [Unreleased] without touching released sections', () => {
		const out = withPendingFragments(CHANGELOG, [doseHistory]);
		const unreleased = out.slice(out.indexOf('## [Unreleased]'), out.indexOf('## [1.3.0]'));
		expect(unreleased).toContain('Medication changes now have a history');
		expect(unreleased).not.toContain(UNRELEASED_PLACEHOLDER);
		expect(out.slice(out.indexOf('## [1.3.0]'))).toBe(CHANGELOG.slice(CHANGELOG.indexOf('## [1.3.0]')));
	});

	it('leaves an invalid fragment out instead of breaking the page', () => {
		const out = withPendingFragments(CHANGELOG, [{ name: 'broken.md', text: 'oops' }]);
		expect(out).toBe(CHANGELOG);
	});
});

describe('releaseChangelog', () => {
	it('moves everything pending into a dated section and updates the links', () => {
		const out = releaseChangelog(CHANGELOG, [doseHistory, syncFix], '1.4.0', '2026-09-20');
		expect(out).toContain(`## [Unreleased]\n\n${UNRELEASED_PLACEHOLDER}\n\n## [1.4.0] — 2026-09-20\n\n### Added\n`);
		expect(out.indexOf('## [1.4.0]')).toBeLessThan(out.indexOf('## [1.3.0]'));
		expect(out).toContain('[Unreleased]: https://git.example.org/you/ciphra/compare/v1.4.0...HEAD\n[1.4.0]: https://git.example.org/you/ciphra/releases/tag/v1.4.0\n[1.3.0]:');
		// Nothing is dropped.
		for (const line of ['Medication changes now have a history', 'A failed save said', 'locked offline synced']) {
			expect(out).toContain(line);
		}
	});

	it('refuses what would lose or duplicate notes', () => {
		expect(() => releaseChangelog(CHANGELOG, [], '1.4.0', '2026-09-20')).toThrow(/Nothing to release/);
		expect(() => releaseChangelog(CHANGELOG, [doseHistory], '1.3.0', '2026-09-20')).toThrow(/already has/);
		expect(() => releaseChangelog(CHANGELOG, [{ name: 'x.md', text: 'prose' }], '1.4.0', '2026-09-20')).toThrow(/Fix these/);
		expect(() => releaseChangelog(CHANGELOG, [doseHistory], '1.4', '2026-09-20')).toThrow(/X\.Y\.Z/);
	});

	it('a released file can be released again later', () => {
		const once = releaseChangelog(CHANGELOG, [doseHistory], '1.4.0', '2026-09-20');
		const twice = releaseChangelog(once, [syncFix], '1.4.1', '2026-09-25');
		expect(twice.indexOf('## [1.4.1]')).toBeLessThan(twice.indexOf('## [1.4.0]'));
		expect(twice).toContain('compare/v1.4.1...HEAD');
	});
});

describe('the repository itself', () => {
	const root = join(__dirname, '..', '..', '..');

	it('every fragment in changelog.d/ is valid', () => {
		expect(readFragments(join(root, 'changelog.d')).flatMap(checkFragment)).toEqual([]);
	});

	it('the heading guide in CHANGELOG.md lists the sections in the order releases render them', () => {
		const text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
		const guide = /<!--\nPending entries are files in changelog\.d\/[\s\S]*?-->/.exec(text);
		expect(guide, 'the heading guide comment is missing from CHANGELOG.md').toBeTruthy();
		const listed = [...guide![0].matchAll(/^### (\w+)/gm)].map((m) => m[1]);
		expect(listed).toEqual([...SECTION_ORDER]);
	});

	it('CHANGELOG.md [Unreleased] parses without losing anything', () => {
		const text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
		expect(pendingEntries(text, []).problems).toEqual([]);
	});
});
