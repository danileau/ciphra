/**
 * The nginx scanner-noise sink (`location ~ ... { return 444; }` in
 * nginx/ciphra.conf) must never swallow a path ciphra really serves.
 *
 * The sink closes the connection without a response. On a medical app a false
 * 444 on a real route is worse than letting a harmless probe through, so every
 * sink pattern is checked here against what the app serves: each route under
 * src/routes, each file in static/, and the build/API paths nginx proxies.
 * Lives in the frontend suite because it already reads files across the repo
 * (see request-size-limits.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const NGINX = readFileSync(join(REPO_ROOT, 'nginx', 'ciphra.conf'), 'utf8');
const ROUTES = join(REPO_ROOT, 'frontend', 'src', 'routes');
const STATIC = join(REPO_ROOT, 'frontend', 'static');

/** `location ~ <re> { return 444; }` / `location ~* ...` → JS RegExp. */
function sinkPatterns(): { line: string; re: RegExp }[] {
	return [...NGINX.matchAll(/^\s*location\s+(~\*?)\s+(\S+)\s*\{\s*return\s+444;\s*\}/gm)].map((m) => ({
		line: m[0].trim(),
		re: new RegExp(m[2], m[1] === '~*' ? 'i' : '')
	}));
}

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? [p, ...walk(p)] : [p];
	});
}

/** Every page route, with `[param]` segments filled by a sample value. */
function routePaths(): string[] {
	return walk(ROUTES)
		.filter((p) => statSync(p).isDirectory())
		.map((p) => '/' + relative(ROUTES, p).split(sep).join('/'))
		.map((p) => p.replace(/\[[^\]]+\]/g, 'sample'))
		.concat('/');
}

function staticPaths(): string[] {
	return walk(STATIC)
		.filter((p) => !statSync(p).isDirectory())
		.map((p) => '/' + relative(STATIC, p).split(sep).join('/'));
}

const FIXED = [
	'/_app/version.json',
	'/_app/env.js',
	'/_app/immutable/entry/start.abc123.js',
	'/_app/immutable/chunks/app.abc123.js',
	'/_app/immutable/assets/app.abc123.css',
	'/health',
	'/sitemap.xml',
	'/.well-known/security.txt',
	'/api/documents',
	'/api/documents/batch',
	'/api/login',
	'/api/config',
	'/docs/changelog',
	'/settings?tab=tracking'
];

describe('nginx scanner sink', () => {
	it('finds the sink rules it is guarding', () => {
		expect(sinkPatterns().length).toBeGreaterThan(3);
	});

	it('finds the routes and static files it checks against', () => {
		expect(routePaths()).toContain('/docs');
		expect(staticPaths()).toContain('/sw.js');
	});

	it('sinks none of the paths ciphra serves', () => {
		const served = [...routePaths(), ...staticPaths(), ...FIXED];
		const hits = sinkPatterns().flatMap(({ line, re }) =>
			served.filter((path) => re.test(path.split('?')[0])).map((path) => `${path}  <-  ${line}`)
		);
		expect(hits).toEqual([]);
	});

	it('sinks the probes it was written for', () => {
		const probes = [
			'/.env',
			'/.git/config',
			'/wp-login.php',
			'/.next/routes-manifest.json',
			'/.netlify/state.json',
			'/.output/nitro.json',
			'/account/_payload.json',
			'/prisma/schema.prisma',
			'/nuxt.config.js',
			'/env.json',
			'/firebase-config.json',
			'/swagger.json',
			'/openapi.json',
			'/debug/vars',
			'/manage/env',
			'/console'
		];
		const missed = probes.filter((p) => !sinkPatterns().some(({ re }) => re.test(p)));
		expect(missed).toEqual([]);
	});
});

describe('nginx rate-limit status', () => {
	it('keeps 503 on the /api/ zones (the auth screens read 429 as a lockout)', () => {
		const apiBlocks = [...NGINX.matchAll(/location\s+[^{]*\/api\/[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
		expect(apiBlocks.length).toBeGreaterThan(0);
		for (const body of apiBlocks) expect(body).not.toMatch(/limit_req_status/);
	});

	it('answers 429 on the page and asset zones', () => {
		for (const zone of ['public', 'assets']) {
			const block = NGINX.match(new RegExp(`limit_req zone=${zone}[^;]*;\\s*limit_req_status (\\d+);`));
			expect(block?.[1], zone).toBe('429');
		}
	});
});
