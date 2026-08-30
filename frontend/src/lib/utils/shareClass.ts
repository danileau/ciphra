/**
 * ciphra — sharing classes.
 *
 * The server holds ONE bit per document: whether its owner considers it
 * shareable, or personal. It cannot work this out for itself — the document
 * type lives inside the ciphertext — so the client stamps it at write time,
 * and the server uses it to decide what a family invitation may read.
 *
 * Two classes, deliberately. A per-type label would tell the server the type
 * of every document, which is a larger disclosure than was approved. Whether
 * something is "personal" is the only distinction sharing actually turns on.
 *
 * The rule is the same one `isExportable` applies, and that is not a
 * coincidence: a diary entry and a locked entry are the things a person did
 * not write for anybody else, whether the reader is a PDF or a caregiver.
 */
import { isExportable } from './exportable';

export const SHARE_CLASS_SHAREABLE = 1;
export const SHARE_CLASS_PERSONAL = 2;

/** Everything except the diary and locked entries. The default for an invite. */
export const SHARE_MASK_SHARED_ONLY = SHARE_CLASS_SHAREABLE;
/** Everything, the diary included. Only when the owner asks for it. */
export const SHARE_MASK_EVERYTHING = SHARE_CLASS_SHAREABLE | SHARE_CLASS_PERSONAL;

export type ShareMask = typeof SHARE_MASK_SHARED_ONLY | typeof SHARE_MASK_EVERYTHING;

/** Which class a document's plaintext belongs to. */
export function shareClassOf(data: unknown): number {
	return isExportable({ data }) ? SHARE_CLASS_SHAREABLE : SHARE_CLASS_PERSONAL;
}

/** Whether a mask admits a class. Mirrors the server's `share_class & mask`. */
export function maskAdmits(mask: number, shareClass: number | null | undefined): boolean {
	if (shareClass === null || shareClass === undefined) return false;
	return (shareClass & mask) !== 0;
}

/** Whether a document is visible to a caregiver holding `mask`. */
export function isVisibleUnderMask(doc: { data?: unknown } | null | undefined, mask: number): boolean {
	if (!doc?.data) return false;
	return maskAdmits(mask, shareClassOf(doc.data));
}
