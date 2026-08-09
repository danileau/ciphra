/**
 * INC-001 — Cloudflare apex emulator.
 *
 * Reproduces the one piece of production behaviour that neither the epilepc
 * container nor the ciphra dev server can produce on its own: the edge
 * redirect that sits in front of `epilepc.ch`.
 *
 * Measured against production on 2026-08-09:
 *
 *     $ curl -sI -H 'Origin: https://ciphra.ch' https://epilepc.ch/de/login
 *     HTTP/2 301
 *     location: https://www.epilepc.ch/de/login     ← path preserved
 *     server: cloudflare
 *     (no access-control-* headers at all)
 *
 * That missing `Access-Control-Allow-Origin` is the whole incident. Per the
 * Fetch spec, every response in a redirect chain of a `mode: 'cors'` request
 * must itself pass the CORS check *before* the browser will follow it. It
 * doesn't, so the browser aborts with `TypeError: Failed to fetch` and the
 * request to the redirect target is NEVER ISSUED — which is why epilepc's
 * `prod.log` has no export entry and `migration_token.used_at` stayed NULL.
 *
 * `mode` lets the same server stand in for both the broken edge and each
 * candidate fix, so the regression test can prove the fix actually works
 * rather than just asserting the happy path still passes.
 */
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';

export type ApexMode =
	/** Production today: 301, path preserved, no CORS headers. Kills the fetch. */
	| 'redirect-no-cors'
	/** Candidate fix B: same 301, but the edge emits CORS headers on it. */
	| 'redirect-with-cors'
	/** Candidate fix A: the machine endpoints are exempted from the redirect. */
	| 'passthrough-api';

export interface ApexEmulator {
	/** Host:port to hand to ciphra as the migration `source`. */
	readonly host: string;
	/** Every path this emulator was asked for, in order. */
	readonly hits: readonly string[];
	close(): Promise<void>;
}

/** Paths the real epilepc exposes as anonymous machine endpoints. */
const API_PREFIXES = ['/api/ciphra-export/', '/api/migration-complete/'];

/**
 * Start an emulator on an ephemeral port that redirects to `targetHost`
 * (`host:port` of the origin that actually serves, i.e. the "www" side).
 */
export async function startApexEmulator(
	targetHost: string,
	mode: ApexMode = 'redirect-no-cors',
): Promise<ApexEmulator> {
	const hits: string[] = [];
	const sockets = new Set<Socket>();

	const server: Server = createServer(async (req, res) => {
		const path = req.url || '/';
		hits.push(path);
		const origin = req.headers.origin;
		const isApiPath = API_PREFIXES.some((p) => path.startsWith(p));

		// Fix A — the edge stops redirecting the machine endpoints and proxies
		// them straight through, so no redirect ever enters the CORS chain.
		if (mode === 'passthrough-api' && isApiPath) {
			await proxy(targetHost, req, res);
			return;
		}

		const headers: Record<string, string> = {
			Location: `http://${targetHost}${path}`,
		};

		// Fix B — keep the redirect but let it survive the CORS preflight check.
		if (mode === 'redirect-with-cors' && origin) {
			headers['Access-Control-Allow-Origin'] = origin;
			headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
			headers['Access-Control-Allow-Headers'] = 'Content-Type';
			headers['Vary'] = 'Origin';
		}

		// `redirect-no-cors` deliberately emits NOTHING else — that is production.
		res.writeHead(301, headers);
		res.end();
	});

	// Track sockets so close() can't hang. ciphra tries `https://` first, and a
	// TLS ClientHello into a plain HTTP server leaves a half-open connection
	// that keeps server.close() waiting forever.
	server.on('connection', (s: Socket) => {
		sockets.add(s);
		s.on('close', () => sockets.delete(s));
	});
	server.on('clientError', (_err, s) => {
		hits.push('<non-http bytes: likely a TLS handshake attempt>');
		(s as Socket).destroy();
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const addr = server.address();
	if (!addr || typeof addr === 'string') throw new Error('apex emulator: no port');

	return {
		host: `127.0.0.1:${addr.port}`,
		hits,
		close: () =>
			new Promise<void>((resolve) => {
				for (const s of sockets) s.destroy();
				sockets.clear();
				server.close(() => resolve());
			}),
	};
}

/** Minimal pass-through so `passthrough-api` returns the real bundle + CORS. */
async function proxy(
	targetHost: string,
	req: import('node:http').IncomingMessage,
	res: import('node:http').ServerResponse,
): Promise<void> {
	try {
		const upstream = await fetch(`http://${targetHost}${req.url || '/'}`, {
			method: req.method,
			headers: req.headers.origin ? { Origin: req.headers.origin } : undefined,
			redirect: 'manual',
		});
		const body = Buffer.from(await upstream.arrayBuffer());
		const out: Record<string, string> = {};
		upstream.headers.forEach((v, k) => {
			// hop-by-hop headers would confuse the client
			if (k !== 'content-encoding' && k !== 'transfer-encoding') out[k] = v;
		});
		res.writeHead(upstream.status, out);
		res.end(body);
	} catch (e) {
		res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'apex_proxy_failed', detail: String(e) }));
	}
}
