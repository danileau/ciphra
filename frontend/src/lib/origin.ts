/**
 * Canonical-origin helpers (design review 2026-06-11).
 *
 * Two jobs:
 *
 * 1. `originStatus()` — classify the origin the app is actually running
 *    on, so /migrate can verify "you are on ciphra.ch" for the user
 *    instead of leaving the whole phishing check to a human comparing
 *    strings. Returns 'canonical' (ciphra.ch family over https), 'dev'
 *    (localhost / loopback, any scheme — e2e + local dev), or
 *    'mismatch' (anything else → hard-stop the transfer).
 *
 * 2. `hostOf()` — normalize an origin-ish input (bare hostname,
 *    host:port, or full URL) to a plain host. Closes the P2 tech-debt
 *    where EPILEPC_ORIGIN was hostname-only while CIPHRA_ORIGIN was a
 *    full URL — that asymmetry caused the apex/www CORS bug during the
 *    first migration test (2026-06-08). Anything ciphra receives as a
 *    "source" goes through this normalizer.
 *
 * Production serves on the APEX `ciphra.ch` directly (verified 2026-06-12:
 * apex → 200, no redirect; `www.ciphra.ch` is not configured / NXDOMAIN).
 * `www` is kept in the accepted-host set defensively in case it is ever
 * pointed at the origin, but the canonical host cross-origin callers must
 * use is the apex. (Earlier notes had this reversed — corrected here and
 * in feedback_apex_www_redirect_breaks_cors.)
 */

/** The one host cross-origin callers must use. Apex — www is unconfigured. */
export const CIPHRA_CANONICAL_HOST = 'ciphra.ch';

const CIPHRA_HOSTS: ReadonlySet<string> = new Set(['ciphra.ch', 'www.ciphra.ch']);
const DEV_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export type OriginStatus = 'canonical' | 'dev' | 'mismatch';

/** Classify the origin the app is running on. Accepts the value of
 *  `window.location.origin`. Unparseable input → 'mismatch'. */
export function originStatus(origin: string): OriginStatus {
	let u: URL;
	try {
		u = new URL(origin);
	} catch {
		return 'mismatch';
	}
	if (DEV_HOSTNAMES.has(u.hostname)) return 'dev';
	if (u.protocol !== 'https:') return 'mismatch';
	return CIPHRA_HOSTS.has(u.hostname) ? 'canonical' : 'mismatch';
}

/** Normalize an origin-ish input to a plain host (`host` or
 *  `host:port`). Accepts `epilepc.ch`, `epilepc.ch:8080`,
 *  `https://epilepc.ch`, `https://epilepc.ch/`. Rejects (returns null):
 *  empty input, whitespace, credentials, non-http(s) schemes, and
 *  anything carrying a path / query / fragment — a migration source is
 *  a host, never a deep link. */
export function hostOf(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed || /\s/.test(trimmed)) return null;
	const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
	let u: URL;
	try {
		u = new URL(candidate);
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.username || u.password) return null;
	if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
	return u.host;
}
