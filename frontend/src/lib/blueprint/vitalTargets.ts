import type { Blueprint } from './types';

/**
 * Personal vital targets (a blood-pressure goal, an HbA1c target) — where they
 * live.
 *
 * The setup wizard used to write them to `localStorage.ciphra_vital_targets:
 * <username>`, in plaintext, outside the encrypted blueprint. A target says
 * what is being treated, so that was health data at rest on the device, and
 * it neither followed the user to another device nor survived clearing site
 * data. They now live on the blueprint (`vitalTargets`), encrypted like
 * everything else. The old key is read once, folded into the blueprint, and
 * removed only after that save succeeded — removing it any earlier (e.g. on
 * the logout that runs when a closed browser is reopened) would lose targets
 * that were never migrated.
 */

const LEGACY_PREFIX = 'ciphra_vital_targets:';

export function legacyVitalTargetsKey(username: string): string {
	return `${LEGACY_PREFIX}${username}`;
}

function cleanTargets(raw: unknown): Record<string, number> | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const out: Record<string, number> = {};
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		const n = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(n) && n !== 0) out[id] = n;
	}
	return Object.keys(out).length > 0 ? out : null;
}

/** Targets still in the pre-migration localStorage key, or null. */
export function readLegacyVitalTargets(username: string | null | undefined): Record<string, number> | null {
	if (!username || typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(legacyVitalTargetsKey(username));
		return raw ? cleanTargets(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

export function clearLegacyVitalTargets(username: string | null | undefined): void {
	if (!username) return;
	try {
		localStorage.removeItem(legacyVitalTargetsKey(username));
	} catch {
		/* storage blocked — nothing to remove */
	}
}

/** The targets that apply to a blueprint: its own, or — for a blueprint not
 *  yet migrated — the legacy key for `legacyUsername` ('' = none, e.g. a
 *  caregiver viewing a patient, whose device-local targets are their own). */
export function effectiveVitalTargets(
	bp: Blueprint,
	legacyUsername: string,
): Record<string, number> | null {
	return cleanTargets(bp.vitalTargets) ?? (legacyUsername ? readLegacyVitalTargets(legacyUsername) : null);
}

/** The blueprint with legacy targets folded in, or null when there is nothing
 *  to migrate (no legacy key, or the blueprint already carries targets — the
 *  encrypted copy wins). Pure apart from the localStorage read; the caller
 *  saves and then calls `clearLegacyVitalTargets`. */
export function migrateLegacyVitalTargets(bp: Blueprint | null, username: string | null | undefined): Blueprint | null {
	if (!bp || cleanTargets(bp.vitalTargets)) return null;
	const legacy = readLegacyVitalTargets(username);
	if (!legacy) return null;
	return { ...bp, vitalTargets: legacy };
}
