/**
 * Track-3 3.4 — bulk-import idempotency key.
 *
 * The server is zero-knowledge: it can't read the epilepc `source_id` inside a
 * document's ciphertext, so the CLIENT supplies an opaque, deterministic,
 * non-reversible token per blob. The batch endpoint stores it under a partial
 * unique index `(user_id, client_key)`, so a resumed/retried migration re-sends
 * the same key and gets `skipped` instead of duplicating the document.
 *
 * Properties this guarantees:
 *  - deterministic: same (username, sourceId) → same key, across retries AND
 *    devices (the durable idempotency guarantee, not just localStorage).
 *  - opaque / server-blind: sha256 → the server can't recover the source_id,
 *    so no epilepc-record metadata leaks (preserves zero-knowledge posture).
 *  - URL/JSON-safe: base64url, no padding.
 *
 * The `v1:` prefix versions the scheme so the derivation can change later
 * without colliding with already-stored keys.
 */
export async function migrationClientKey(username: string, sourceId: string): Promise<string> {
	const input = `${(username || '').toLowerCase()}:${sourceId}`;
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	const bytes = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `v1:${b64url}`;
}
