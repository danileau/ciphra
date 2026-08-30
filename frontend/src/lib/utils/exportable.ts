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

/**
 * Whether a linked caregiver may see this document.
 *
 * Same rule as the export, because the promise the app makes is about
 * *people*, not about the PDF: `private.tooltip` says "nie exportiert oder
 * **geteilt**", `journal.diary_hint` says the diary is never shared, and the
 * caregiver banner (`family.private_context`) states outright that the
 * patient's personal entries stay private. Until this existed the caregiver's
 * document load filtered only `family_link`, so every one of those sentences
 * was false: a family grant re-wraps the master key, so the linked account
 * decrypted and rendered the diary along with everything else.
 *
 * Kept as its own name rather than calling `isExportable` at the load site —
 * the caller is answering "may this person see it", not "does it go in the
 * PDF", and if the two rules ever diverge this is where they part.
 */
export function isVisibleToCaregiver(
	doc: CiphraDocument | { data?: any } | null | undefined,
): boolean {
	return isExportable(doc);
}
