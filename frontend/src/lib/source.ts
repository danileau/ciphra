/**
 * AGPL-3.0 §13 — the source offer of *this* deployment.
 *
 * ciphra is network software: users interact with it remotely, so §13
 * obliges whoever operates it to offer THEIR users the Corresponding
 * Source of the version actually running. A fork that keeps pointing at
 * the upstream repository does not satisfy that — it advertises someone
 * else's code as if it were the code being served. That is worse than no
 * link at all, because it looks like compliance.
 *
 * So the URL is a runtime setting, not a constant:
 *
 *   PUBLIC_SOURCE_URL=https://git.example.org/you/ciphra
 *
 * It is read through `$env/dynamic/public`, not `$env/static/public`, on
 * purpose: the published container images are built once by our CI, and a
 * self-hoster pulls them rather than rebuilding. A static (build-time)
 * variable would be baked into the image and unchangeable without a
 * rebuild — which would make the setting useless for exactly the people
 * who need it.
 *
 * Unset, it falls back to upstream. That is the correct value for an
 * unmodified deployment and the wrong one for every other deployment;
 * `.env.example` and the README say so in those words.
 */
import { env } from '$env/dynamic/public';

/**
 * Upstream ciphra. The single place this URL is written down — every
 * surface renders `sourceUrl`, and `no-hardcoded-source.test.ts` fails
 * the build if a component hardcodes a repository link again.
 */
export const UPSTREAM_SOURCE_URL = 'https://github.com/danileau/ciphra';

/**
 * Normalise an operator-supplied source URL.
 *
 * Anything that is not an absolute http(s) URL falls back to upstream:
 * a typo must not render a dead link, and `javascript:` must not become
 * an anchor href on a page that handles a decryption key.
 */
export function resolveSourceUrl(raw: string | undefined | null): string {
	const value = (raw ?? '').trim();
	if (value === '') return UPSTREAM_SOURCE_URL;

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return UPSTREAM_SOURCE_URL;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		return UPSTREAM_SOURCE_URL;
	}
	return parsed.href.replace(/\/+$/, '');
}

/**
 * Display form: host + path, no scheme, no trailing slash — what the
 * landing page prints next to "verify our claims yourself". Showing the
 * real host is the point: on a fork it must read as the fork.
 */
export function sourceLabel(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
	} catch {
		return url;
	}
}

/** The source URL this instance offers its users. */
export const sourceUrl: string = resolveSourceUrl(env.PUBLIC_SOURCE_URL);
