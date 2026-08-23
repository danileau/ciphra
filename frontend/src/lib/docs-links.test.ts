/**
 * The in-app docs renderer rewrites links; this pins what it does with
 * the three kinds it meets.
 *
 * The case that motivated the test: narrowing the shipped doc set
 * (docs-manifest.ts) meant the README's documentation table suddenly
 * referenced documents the app no longer carries. Nothing would have
 * broken loudly — the links would simply have resolved to nothing, in a
 * page whose whole subject is that ciphra's claims are checkable.
 */
import { describe, it, expect } from 'vitest';
import { rewriteDocLinks } from '$lib/docs-links';

const KNOWN = new Set(['readme', 'architecture', 'security_model']);
const rw = (html: string) => rewriteDocLinks(html, KNOWN);

describe('rewriteDocLinks — documents the app ships', () => {
	it('rewrites a sibling .md link to its /docs route', () => {
		expect(rw('<a href="ARCHITECTURE.md">Arch</a>')).toBe('<a href="/docs/architecture">Arch</a>');
	});

	it('rewrites a parent-relative link', () => {
		expect(rw('<a href="../SECURITY_MODEL.md">Model</a>')).toBe(
			'<a href="/docs/security_model">Model</a>',
		);
	});

	it('rewrites a docs/-prefixed link', () => {
		expect(rw('<a href="docs/ARCHITECTURE.md">Arch</a>')).toBe(
			'<a href="/docs/architecture">Arch</a>',
		);
	});

	it('keeps the fragment when rewriting', () => {
		expect(rw('<a href="../SECURITY_MODEL.md#hardening">H</a>')).toBe(
			'<a href="/docs/security_model#hardening">H</a>',
		);
	});
});

describe('rewriteDocLinks — documents the app does not ship', () => {
	it('un-links them instead of leaving a link that goes nowhere', () => {
		const out = rw('<a href="docs/OPERATIONS.md">Operations</a>');
		expect(out).not.toMatch(/<a /);
		expect(out).toContain('Operations');
		expect(out).toContain('doc-offsite');
	});

	it('keeps the link text verbatim, so the reader still learns it exists', () => {
		expect(rw('<a href="docs/backlog.md">the forward-looking backlog</a>')).toContain(
			'the forward-looking backlog',
		);
	});

	it('handles several on one line (the README documentation table)', () => {
		const table =
			'<a href="docs/OPERATIONS.md">Ops</a> | <a href="ARCHITECTURE.md">Arch</a> | <a href="docs/backlog.md">Backlog</a>';
		const out = rw(table);
		expect(out).toContain('<a href="/docs/architecture">Arch</a>');
		expect(out.match(/<a /g) ?? []).toHaveLength(1);
		expect(out).toContain('>Ops<');
		expect(out).toContain('>Backlog<');
	});
});

describe('rewriteDocLinks — everything else is left alone', () => {
	it('does not touch external links', () => {
		const ext = '<a href="https://example.org/x.md">ext</a>';
		expect(rw(ext)).toBe(ext);
	});

	it('does not touch mailto:', () => {
		const m = '<a href="mailto:security@ciphra.ch">mail</a>';
		expect(rw(m)).toBe(m);
	});

	it('does not touch in-app routes or anchors', () => {
		expect(rw('<a href="/privacy">P</a>')).toBe('<a href="/privacy">P</a>');
		expect(rw('<a href="#section">S</a>')).toBe('<a href="#section">S</a>');
	});

	it('leaves links to repository source files as repo references', () => {
		const src = '<a href="frontend/src/lib/crypto.ts">crypto.ts</a>';
		expect(rw(src)).toBe(src);
	});
});
