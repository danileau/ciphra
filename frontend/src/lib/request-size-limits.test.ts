/**
 * Edge body caps must not exceed the API's own cap.
 *
 * nginx allowed 10m on /api/documents/batch while Flask's MAX_CONTENT_LENGTH
 * was 2 MiB, so a 3-10 MB batch passed the edge and was refused by the API
 * with a 413 — a limit the edge advertised and the app never honoured. Nothing
 * pinned the two together; this does. Lives in the frontend suite because it
 * is the one that already reads files across the repo (see security-doc.test.ts).
 *
 * If you need a bigger body somewhere, raise MAX_CONTENT_LENGTH (and the
 * MAX_REQUEST_BYTES the deploy passes) in the same change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const NGINX = readFileSync(join(REPO_ROOT, 'nginx', 'ciphra.conf'), 'utf8');
const SERVER = readFileSync(join(REPO_ROOT, 'api', 'server.py'), 'utf8');

const UNIT: Record<string, number> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

function nginxLimits(): { line: string; bytes: number }[] {
	return [...NGINX.matchAll(/^\s*client_max_body_size\s+(\d+)([kmg]?)\s*;/gim)].map((m) => ({
		line: m[0].trim(),
		bytes: Number(m[1]) * UNIT[m[2].toLowerCase()]
	}));
}

function flaskDefaultCap(): number {
	const m = SERVER.match(
		/MAX_CONTENT_LENGTH'\]\s*=\s*int\(\s*os\.environ\.get\(\s*'MAX_REQUEST_BYTES',\s*([\d\s*]+)\)/
	);
	if (!m) throw new Error("could not find app.config['MAX_CONTENT_LENGTH'] in api/server.py");
	return m[1].split('*').reduce((acc, n) => acc * Number(n.trim()), 1);
}

describe('request body limits', () => {
	it('finds the limits it is guarding', () => {
		expect(nginxLimits().length).toBeGreaterThan(0);
		expect(flaskDefaultCap()).toBe(2 * 1024 * 1024);
	});

	it('no nginx client_max_body_size exceeds the API cap', () => {
		const cap = flaskDefaultCap();
		for (const { line, bytes } of nginxLimits()) {
			expect(bytes, `${line} lets through bodies the API refuses (cap ${cap} bytes)`).toBeLessThanOrEqual(cap);
		}
	});
});
