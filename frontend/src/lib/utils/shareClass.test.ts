/**
 * Sharing classes — the one bit the server is allowed to learn.
 *
 * The class is derived from the plaintext on the client, because the server
 * cannot: the document type lives inside the ciphertext. Two things have to
 * hold or the feature is a lie in one direction or the other:
 *
 *   - the class matches `isExportable`, so "personal" means the same thing to
 *     the doctor PDF and to a family invitation;
 *   - an unclassified document is admitted by NO mask, so a document written
 *     before this existed is withheld rather than shared by accident.
 */
import { describe, it, expect } from 'vitest';
import {
	SHARE_CLASS_SHAREABLE,
	SHARE_CLASS_PERSONAL,
	SHARE_MASK_SHARED_ONLY,
	SHARE_MASK_EVERYTHING,
	shareClassOf,
	maskAdmits,
	isVisibleUnderMask,
} from './shareClass';

const entry = { type: 'entry', date: '2026-08-01' };
const lockedEntry = { type: 'entry', date: '2026-08-02', private: true };
const diary = { type: 'diary', date: '2026-08-03', text: 'x', private: true };
const marker = { type: 'event', date: '2026-08-04', title: 'Dose raised' };
const blueprint = { type: 'blueprint', conditionId: 'epilepsy' };

describe('what counts as personal', () => {
	it('a diary entry is personal', () => {
		expect(shareClassOf(diary)).toBe(SHARE_CLASS_PERSONAL);
	});

	it('a locked entry is personal', () => {
		expect(shareClassOf(lockedEntry)).toBe(SHARE_CLASS_PERSONAL);
	});

	it('a diary entry stays personal even with the flag cleared', () => {
		// The type decides, not the flag — same rule the export applies.
		expect(shareClassOf({ ...diary, private: false })).toBe(SHARE_CLASS_PERSONAL);
	});

	it('ordinary entries, markers and the blueprint are shareable', () => {
		for (const doc of [entry, marker, blueprint]) {
			expect(shareClassOf(doc)).toBe(SHARE_CLASS_SHAREABLE);
		}
	});
});

describe('what a mask admits', () => {
	it('the narrow scope takes shareable and refuses personal', () => {
		expect(maskAdmits(SHARE_MASK_SHARED_ONLY, SHARE_CLASS_SHAREABLE)).toBe(true);
		expect(maskAdmits(SHARE_MASK_SHARED_ONLY, SHARE_CLASS_PERSONAL)).toBe(false);
	});

	it('the wide scope takes both', () => {
		expect(maskAdmits(SHARE_MASK_EVERYTHING, SHARE_CLASS_SHAREABLE)).toBe(true);
		expect(maskAdmits(SHARE_MASK_EVERYTHING, SHARE_CLASS_PERSONAL)).toBe(true);
	});

	it('no mask admits an unclassified document', () => {
		// Fail closed. This is every document written before the column
		// existed; admitting them would re-release the whole diary history.
		for (const mask of [SHARE_MASK_SHARED_ONLY, SHARE_MASK_EVERYTHING]) {
			expect(maskAdmits(mask, null)).toBe(false);
			expect(maskAdmits(mask, undefined)).toBe(false);
		}
	});
});

describe('document visibility under a grant', () => {
	it('a narrow grant hides the diary', () => {
		expect(isVisibleUnderMask({ data: diary }, SHARE_MASK_SHARED_ONLY)).toBe(false);
		expect(isVisibleUnderMask({ data: lockedEntry }, SHARE_MASK_SHARED_ONLY)).toBe(false);
		expect(isVisibleUnderMask({ data: entry }, SHARE_MASK_SHARED_ONLY)).toBe(true);
	});

	it('a wide grant shows the diary — the whole point of the feature', () => {
		expect(isVisibleUnderMask({ data: diary }, SHARE_MASK_EVERYTHING)).toBe(true);
		expect(isVisibleUnderMask({ data: lockedEntry }, SHARE_MASK_EVERYTHING)).toBe(true);
	});

	it('a document with no data is visible to nobody', () => {
		expect(isVisibleUnderMask(null, SHARE_MASK_EVERYTHING)).toBe(false);
		expect(isVisibleUnderMask({}, SHARE_MASK_EVERYTHING)).toBe(false);
	});
});

describe('the masks are the two the product offers', () => {
	it('narrow is shareable-only, wide is both', () => {
		expect(SHARE_MASK_SHARED_ONLY).toBe(1);
		expect(SHARE_MASK_EVERYTHING).toBe(3);
	});
});
