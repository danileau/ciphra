import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { IN_APP_DOCS } from './src/lib/docs-manifest';

// CIPH-pi20-LB-6 — default 5000 → 5050: macOS AirPlay/AirTunes listens
// on :5000 by default, which silently 403'd against our API in local
// dev (FULL_REVIEW 2026-05-05 P1.3). 5050 is collision-free across
// macOS/Linux/Windows. Override via VITE_API_URL when needed.
const apiTarget = process.env.VITE_API_URL || 'http://localhost:5050';

/**
 * ciphra-docs — exposes the repository's documentation to the app as the
 * virtual module `virtual:ciphra-docs`, powering the `/docs` route.
 *
 * The docs live above the SvelteKit project root, so a browser-side
 * `import.meta.glob` cannot reach them. This plugin reads them with Node
 * `fs` at dev/build time and watches them for hot reload — editing a
 * `.md` updates `/docs` directly.
 *
 * WHICH docs is an explicit allowlist: `src/lib/docs-manifest.ts`.
 *
 * Path resolution covers two environments; `docRoot` is whichever holds
 * a `docs/` subdirectory:
 *   - Dockerised dev: the frontend container only mounts `./frontend`,
 *     so docker-compose bind-mounts the doc sources under `/docs-src`.
 *   - Host-side `vite build` / `npm run dev`: the repo root is one up.
 */
function ciphraDocs(): Plugin {
	const VIRTUAL = 'virtual:ciphra-docs';
	const RESOLVED = '\0' + VIRTUAL;
	const docRoot = ['/docs-src', resolve(process.cwd(), '..')].find((d) =>
		existsSync(join(d, 'docs')),
	);

	// Explicit allowlist, not "everything in docs/". The old glob shipped
	// the operator runbook and the product backlog to patients and grew
	// the bundle on every new doc — see src/lib/docs-manifest.ts, which
	// also carries the test that keeps this set a decision.
	const mdFiles = (): string[] =>
		docRoot
			? IN_APP_DOCS.map((rel: string) => join(docRoot, rel)).filter((p: string) =>
					existsSync(p),
				)
			: [];

	const collect = (): Record<string, string> => {
		const out: Record<string, string> = {};
		for (const abs of mdFiles()) {
			const key = abs.slice(abs.lastIndexOf('/') + 1); // 'ARCHITECTURE.md'
			try {
				out[key] = readFileSync(abs, 'utf8');
			} catch {
				/* a file may be momentarily absent during an edit — skip it */
			}
		}
		return out;
	};

	return {
		name: 'ciphra-docs',
		resolveId(id) {
			return id === VIRTUAL ? RESOLVED : null;
		},
		load(id) {
			if (id === RESOLVED) return `export const docs = ${JSON.stringify(collect())};`;
			return null;
		},
		configureServer(server) {
			for (const f of mdFiles()) server.watcher.add(f);
			server.watcher.on('change', (file: string) => {
				if (!file.endsWith('.md')) return;
				const mod = server.moduleGraph.getModuleById(RESOLVED);
				if (mod) {
					server.moduleGraph.invalidateModule(mod);
					server.ws.send({ type: 'full-reload' });
				}
			});
		},
	};
}

export default defineConfig({
	plugins: [ciphraDocs(), sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5173,
		// DEV_HTTPS=1 serves the dev server over self-signed HTTPS so the Web
		// Crypto APIs (secure-context only) work when testing from a phone over
		// the LAN IP. Cert lives in .devcerts/ (gitignored). Not used otherwise.
		...(process.env.DEV_HTTPS
			? {
					https: {
						key: readFileSync(resolve('.devcerts/dev.key')),
						cert: readFileSync(resolve('.devcerts/dev.crt')),
					},
				}
			: {}),
		hmr: {
			// When accessed through nginx (:8080), HMR WebSocket must connect to the right place
			clientPort: parseInt(process.env.VITE_HMR_PORT || '5173'),
		},
		proxy: {
			'/api': apiTarget,
			'/health': apiTarget
		}
	}
});
