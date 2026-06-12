/**
 * Canonical-origin helpers — contract tests.
 *
 * Pins the /migrate trust-gate semantics: ciphra.ch family over https
 * is canonical, loopback is dev (e2e + local), everything else is a
 * mismatch that hard-stops the transfer. `hostOf` pins the P2
 * normalization debt closed: hostname-only and full-URL inputs resolve
 * to the same host, deep links never pass as a source.
 */
import { describe, it, expect } from 'vitest';
import { CIPHRA_CANONICAL_HOST, originStatus, hostOf } from './origin';

describe('originStatus', () => {
	it('accepts the canonical www host and the apex over https', () => {
		expect(originStatus('https://www.ciphra.ch')).toBe('canonical');
		expect(originStatus('https://ciphra.ch')).toBe('canonical');
	});

	it('classifies loopback as dev regardless of scheme/port', () => {
		expect(originStatus('http://localhost:5050')).toBe('dev');
		expect(originStatus('http://127.0.0.1:4173')).toBe('dev');
		expect(originStatus('https://localhost')).toBe('dev');
	});

	it('hard-stops lookalikes, http-downgrade, and garbage', () => {
		expect(originStatus('https://ciphra-login.example')).toBe('mismatch');
		expect(originStatus('https://ciphra.ch.evil.example')).toBe('mismatch');
		expect(originStatus('https://wwwciphra.ch')).toBe('mismatch');
		expect(originStatus('http://www.ciphra.ch')).toBe('mismatch');
		expect(originStatus('not an origin')).toBe('mismatch');
		expect(originStatus('')).toBe('mismatch');
	});

	it('exports the one host cross-origin fetches must use', () => {
		// feedback_apex_www_redirect_breaks_cors: the apex 301 carries no
		// CORS headers — fetch URLs use www, always.
		expect(CIPHRA_CANONICAL_HOST).toBe('www.ciphra.ch');
	});
});

describe('hostOf — source normalization (P2 debt)', () => {
	it('hostname-only and full-URL inputs resolve identically', () => {
		expect(hostOf('epilepc.ch')).toBe('epilepc.ch');
		expect(hostOf('https://epilepc.ch')).toBe('epilepc.ch');
		expect(hostOf('https://epilepc.ch/')).toBe('epilepc.ch');
		expect(hostOf('EPILEPC.CH')).toBe('epilepc.ch');
	});

	it('keeps explicit ports (dev epilepc runs on :8080)', () => {
		expect(hostOf('localhost:8080')).toBe('localhost:8080');
		expect(hostOf('http://localhost:8080')).toBe('localhost:8080');
	});

	it('rejects deep links, credentials, exotic schemes, and junk', () => {
		expect(hostOf('epilepc.ch/api/export')).toBeNull();
		expect(hostOf('https://epilepc.ch/path?x=1')).toBeNull();
		expect(hostOf('https://epilepc.ch#frag')).toBeNull();
		expect(hostOf('https://user:pw@epilepc.ch')).toBeNull();
		expect(hostOf('javascript:alert(1)')).toBeNull();
		expect(hostOf('ftp://epilepc.ch')).toBeNull();
		expect(hostOf('ho st.example')).toBeNull();
		expect(hostOf('')).toBeNull();
	});
});
