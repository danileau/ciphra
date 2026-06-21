/**
 * ciphra — API client
 */

const API_BASE = '/api';

// Endpoints where a 401 means "bad credentials" (handled by the caller), NOT
// "your session expired" — so the global session-expiry catch must skip them.
const AUTH_ENDPOINTS = ['/login', '/register', '/recover'];
function isAuthEndpoint(path: string): boolean {
	return AUTH_ENDPOINTS.some((p) => path === p || path.startsWith(p + '/'));
}

async function request(
	path: string,
	options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
	let token: string | null = null;
	if (typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem('ciphra_auth');
			if (raw) token = JSON.parse(raw).token || null;
		} catch { /* ignore */ }
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string>)
	};
	if (token) headers['Authorization'] = `Bearer ${token}`;

	const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

	// Central session-expiry catch: a 401 on an AUTHENTICATED request (we sent a
	// token) to a non-auth endpoint means the session is dead (expired/revoked).
	// Notify the app shell to clear auth + redirect to /login, instead of letting
	// the failed load render as a stale-looking "no profile yet" / caregiver view.
	if (res.status === 401 && token && !isAuthEndpoint(path) && typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('ciphra:unauthorized'));
	}

	// A 403 on a linked patient's vault means the grant was revoked while the
	// caregiver was viewing it. Distinct from 401 (own session is fine) — tell
	// the shell to reconcile family links + snap back to the caregiver's own
	// vault, instead of leaving a stuck switcher + generic "load failed" error.
	if (res.status === 403 && token && path.startsWith('/family/documents') && typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('ciphra:family-revoked'));
	}

	const data = await res.json();
	return { ok: res.ok, status: res.status, data };
}

import type { RegistrationBundle } from './crypto';

export async function register(bundle: RegistrationBundle, source?: 'web' | 'migrate') {
	// Server receives only hashes + encrypted blobs — never the password or recovery_code.
	// `source` is a metadata-only bit ('web' default, 'migrate' for the epilepc
	// off-ramp) so /admin can count migrations vs organic signups.
	const { recovery_code: _drop, ...payload } = bundle;
	const body = source ? { ...payload, source } : payload;
	return request('/register', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export async function loginInit(username: string) {
	return request('/login/init', {
		method: 'POST',
		body: JSON.stringify({ username })
	});
}

export async function login(username: string, authKeyB64: string) {
	return request('/login', {
		method: 'POST',
		body: JSON.stringify({ username, auth_key: authKeyB64 })
	});
}

export async function storeDocument(encryptedData: string) {
	return request('/documents', {
		method: 'POST',
		body: JSON.stringify({ encrypted_data: encryptedData })
	});
}

// Track-3 3.4 — bulk import (used by /migrate). Up to 100 encrypted docs per
// round-trip. `client_key` (opaque, optional) makes each blob idempotent so a
// resumed migration re-sends the same batch without duplicating. Response:
// { results: [{client_key, status: 'created'|'skipped'|'error', id?, error?}],
//   created, skipped, errored }.
export async function storeDocumentsBatch(
	documents: { client_key?: string; encrypted_data: string }[]
) {
	return request('/documents/batch', {
		method: 'POST',
		body: JSON.stringify({ documents })
	});
}

export async function getDocuments() {
	return request('/documents');
}

export async function updateDocument(id: number, encryptedData: string) {
	return request(`/documents/${id}`, {
		method: 'PUT',
		body: JSON.stringify({ encrypted_data: encryptedData })
	});
}

export async function deleteDocument(id: number) {
	return request(`/documents/${id}`, { method: 'DELETE' });
}

export async function recoverInit(username: string) {
	return request('/recover/init', {
		method: 'POST',
		body: JSON.stringify({ username })
	});
}

export async function recover(payload: {
	username: string;
	recovery_key: string;
	auth_hash: string;
	auth_params: string;
	vault_params: string;
	encrypted_master: string;
}) {
	return request('/recover', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

// --- Admin API ---

export async function adminGetStats() {
	return request('/admin/stats');
}

export async function adminGetTimeseries() {
	return request('/admin/stats/timeseries');
}

export async function adminGetUsers() {
	return request('/admin/users');
}

export async function adminLockUser(userId: number) {
	return request(`/admin/users/${userId}/lock`, { method: 'POST' });
}

export async function adminUnlockUser(userId: number) {
	return request(`/admin/users/${userId}/unlock`, { method: 'POST' });
}

export async function adminDeleteUser(userId: number) {
	return request(`/admin/users/${userId}`, { method: 'DELETE' });
}

export async function adminGetAudit() {
	return request('/admin/audit');
}

export async function adminPromoteUser(userId: number) {
	return request(`/admin/users/${userId}/promote`, { method: 'POST' });
}

export async function adminDemoteUser(userId: number) {
	return request(`/admin/users/${userId}/demote`, { method: 'POST' });
}

export async function changePassword(payload: {
	current_auth_key: string;
	auth_hash: string;
	auth_params: string;
	vault_params: string;
	encrypted_master: string;
}) {
	return request('/change-password', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

// --- Family sharing (Approach C) ---

export async function familyGrantCreate(payload: {
	label: string;
	grant_params: string;
	grant_auth: string;
	wrapped_master: string;
}) {
	return request('/family/grants', { method: 'POST', body: JSON.stringify(payload) });
}

export async function familyGrantList() {
	return request('/family/grants');
}

export async function familyGrantRevoke(id: number) {
	return request(`/family/grants/${id}`, { method: 'DELETE' });
}

export async function familyGrantRevokeAll() {
	return request('/family/grants/revoke-all', { method: 'POST' });
}

export async function familyClaimedList() {
	return request('/family/claimed');
}

export async function familyGrantClaimInit(sourceUsername: string) {
	return request('/family/grants/claim/init', {
		method: 'POST',
		body: JSON.stringify({ source_username: sourceUsername }),
	});
}

export async function familyGrantClaim(grantId: number, familyKeyB64: string) {
	return request('/family/grants/claim', {
		method: 'POST',
		body: JSON.stringify({ grant_id: grantId, proof: familyKeyB64 }),
	});
}

export async function familyDocuments(sourceUserId: number) {
	return request(`/family/documents?source_user_id=${sourceUserId}`);
}

export async function familyDocumentCreate(sourceUserId: number, encryptedData: string) {
	return request('/family/documents', {
		method: 'POST',
		body: JSON.stringify({ source_user_id: sourceUserId, encrypted_data: encryptedData }),
	});
}

export async function familyDocumentUpdate(sourceUserId: number, docId: number, encryptedData: string) {
	return request(`/family/documents/${docId}`, {
		method: 'PUT',
		body: JSON.stringify({ source_user_id: sourceUserId, encrypted_data: encryptedData }),
	});
}

export async function familyDocumentDelete(sourceUserId: number, docId: number) {
	return request(`/family/documents/${docId}?source_user_id=${sourceUserId}`, {
		method: 'DELETE',
	});
}

export async function deleteAccount(authKeyB64: string) {
	return request('/delete-account', {
		method: 'POST',
		body: JSON.stringify({ auth_key: authKeyB64 })
	});
}
