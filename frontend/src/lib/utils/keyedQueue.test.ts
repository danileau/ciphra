/**
 * createKeyedQueue — serialises the /reports grid's read-modify-write edits
 * per day. Rapid "+" clicks used to read the same stale entry: two clicks,
 * one increment; on an empty day, one new entry per click.
 */
import { describe, it, expect } from 'vitest';
import { createKeyedQueue } from './keyedQueue';

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

describe('createKeyedQueue', () => {
	it('same key: each task sees what the previous one wrote', async () => {
		const enqueue = createKeyedQueue();
		const store = { count: 0 };
		const increment = async () => {
			const read = store.count; // read …
			await tick();             // … a write round-trip …
			store.count = read + 1;   // … write back
		};
		await Promise.all([enqueue('2026-09-01', increment), enqueue('2026-09-01', increment), enqueue('2026-09-01', increment)]);
		expect(store.count).toBe(3);
	});

	it('different keys do not wait for each other', async () => {
		const enqueue = createKeyedQueue();
		const order: string[] = [];
		let release!: () => void;
		const slow = enqueue('a', () => new Promise<void>((r) => { release = () => { order.push('a'); r(); }; }));
		await enqueue('b', async () => { order.push('b'); });
		expect(order).toEqual(['b']);
		release();
		await slow;
		expect(order).toEqual(['b', 'a']);
	});

	it('a failing task does not block the next one', async () => {
		const enqueue = createKeyedQueue();
		let ran = false;
		await Promise.all([
			enqueue('k', async () => { throw new Error('write failed'); }),
			enqueue('k', async () => { ran = true; }),
		]);
		expect(ran).toBe(true);
	});
});
