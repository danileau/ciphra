// Usernames — the one place a typed or autofilled username is turned into the
// string the server sees.
//
// The server rule (api/server.py USERNAME_RE) is `^[a-z0-9_]{3,64}$` after
// strip().lower(). Every account that exists already satisfies it, so the extra
// cleanup below cannot change what an existing username maps to: NFKC leaves
// ASCII alone, and the characters it removes were never allowed in a username.
//
// What it removes is what phones and password managers add (2026-11-03, iOS
// Brave): zero-width and other invisible format characters (\p{Cf}: U+200B,
// U+200D, U+2060, U+FEFF, the soft hyphen, …), which neither JS trim() nor
// Python strip() touches, and compatibility forms such as fullwidth letters.

export const USERNAME_RE = /^[a-z0-9_]{3,64}$/;

export function canonicalUsername(raw: string): string {
	return raw.normalize('NFKC').replace(/\p{Cf}/gu, '').trim().toLowerCase();
}

export function isValidUsername(canonical: string): boolean {
	return USERNAME_RE.test(canonical);
}

/**
 * What is wrong with a username, for the "technical details" disclosure.
 *
 * Names the length and the code points of the characters that are not
 * allowed — never the value itself. An autofilled "username" can be a saved
 * recovery code, and this text is on screen.
 */
export function describeUsername(canonical: string): string {
	const counts = new Map<string, number>();
	for (const ch of canonical) {
		if (/[a-z0-9_]/.test(ch)) continue;
		const cp = 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
		counts.set(cp, (counts.get(cp) ?? 0) + 1);
	}
	const parts = [`username: ${[...canonical].length} characters`];
	if (counts.size > 0) {
		parts.push('not allowed: ' + [...counts].map(([cp, n]) => (n > 1 ? `${cp} ×${n}` : cp)).join(', '));
	}
	return parts.join('; ');
}
