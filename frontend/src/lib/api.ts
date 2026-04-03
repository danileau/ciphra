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

export async function register(username: string, password: string, enableRecovery = true) {
	return request('/register', {
		method: 'POST',
		body: JSON.stringify({ username, password, enable_recovery: enableRecovery })
	});
}

export async function login(username: string, password: string) {
	return request('/login', {
		method: 'POST',
		body: JSON.stringify({ username, password })
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

export async function validateRecovery(code: string) {
	return request('/validate-recovery', {
		method: 'POST',
		body: JSON.stringify({ recovery_code: code })
	});
}
