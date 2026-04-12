/**
 * ciphra — API client
 */

const API_BASE = '/api';

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
	const data = await res.json();
	return { ok: res.ok, status: res.status, data };
}

import type { RegistrationBundle } from './crypto';

export async function register(bundle: RegistrationBundle) {
	// Server receives only hashes + encrypted blobs — never the password or recovery_code.
	const { recovery_code: _drop, ...payload } = bundle;
	return request('/register', {
		method: 'POST',
		body: JSON.stringify(payload)
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
