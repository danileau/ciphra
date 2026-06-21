import { describe, it, expect } from 'vitest';
import { migrationClientKey } from './migrationKey';

describe('migrationClientKey (bulk-import idempotency)', () => {
	it('is deterministic for the same (username, sourceId)', async () => {
		const a = await migrationClientKey('anna', 'seizure-42');
		const b = await migrationClientKey('anna', 'seizure-42');
		expect(a).toBe(b);
	});

	it('is case-insensitive on username (matches server normalization)', async () => {
		expect(await migrationClientKey('Anna', 'x')).toBe(await migrationClientKey('anna', 'x'));
	});

	it('differs across sourceIds and across users', async () => {
		const a1 = await migrationClientKey('anna', 'a');
		const a2 = await migrationClientKey('anna', 'b');
		const b1 = await migrationClientKey('bob', 'a');
		expect(a1).not.toBe(a2);
		expect(a1).not.toBe(b1);
	});

	it('is versioned + URL-safe base64 (no +/= chars)', async () => {
		const k = await migrationClientKey('anna', 'seizure-42');
		expect(k.startsWith('v1:')).toBe(true);
		expect(k.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('does not embed the raw sourceId (opaque / non-reversible)', async () => {
		const k = await migrationClientKey('anna', 'super-secret-record-id');
		expect(k.includes('super-secret-record-id')).toBe(false);
	});
});
