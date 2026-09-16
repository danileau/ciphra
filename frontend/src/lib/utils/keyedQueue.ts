/**
 * Run async tasks one at a time per key; different keys do not wait for each
 * other.
 *
 * For read-modify-write edits of one document: without it, rapid edits all
 * read the same stale copy and the last write wins over the others. A task
 * that throws does not stop the ones queued behind it — the returned promise
 * always resolves.
 */
export function createKeyedQueue(): (key: string, task: () => Promise<unknown>) => Promise<void> {
	const tails = new Map<string, Promise<void>>();
	return (key, task) => {
		const run = (tails.get(key) ?? Promise.resolve())
			.then(task)
			.then(() => {}, () => {});
		tails.set(key, run);
		void run.then(() => {
			if (tails.get(key) === run) tails.delete(key);
		});
		return run;
	};
}
