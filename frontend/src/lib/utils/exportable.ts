/**
 * ciphra — export-eligibility predicate (CIPH-710 / CIPH-713).
 *
 * Two reasons a document must NEVER appear in any export surface
 * (PDF, CSV, doctor-share link, reports aggregations, EntryPreview
 * when rendered in an export context):
 *
 *  1. `type === 'diary'` — the private diary primitive. Always private,
 *     no user toggle. Belt-and-suspenders: also gets `private: true`
 *     when written, but the type alone is sufficient to exclude.
 *  2. `data.private === true` — per-entry lock toggle on Entry/Event.
 *
 * Use this everywhere instead of inlining the check, so future export
 * paths (epilepc bundle export, public share link, …) can't drift.
 */
import type { CiphraDocument } from '$lib/stores/documents';

export function isExportable(doc: CiphraDocument | { data?: any } | null | undefined): boolean {
	const data = doc?.data;
	if (!data) return false;
	if (data.type === 'diary') return false;
	if (data.private === true) return false;
	return true;
}
