import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// 2026-06-07 — switched from adapter-auto to adapter-node so the
		// Docker prod build (golive/frontend/Dockerfile.prod) produces a
		// build/index.js the runtime stage can `node build/index.js`.
		// adapter-auto only handles Vercel/Netlify/CF Pages/Azure SWA —
		// for generic Linux Docker it produced no build/ output.
		adapter: adapter(),
		// Track 3 P0 (3.1) — drop `'unsafe-inline'` from script-src. SvelteKit
		// emits a per-response CSP header and hashes its own inline hydration
		// scripts (mode: 'hash'), so the blanket script-src unsafe-inline (the
		// launch-night tactical) is no longer needed. This REPLACES the nginx
		// CSP header (removed in nginx/ciphra.conf) — the script hashes are
		// per-build, so only SvelteKit can keep them in sync.
		//
		// style-src KEEPS 'unsafe-inline': the app uses ~970 dynamic inline
		// `style="..."` attributes (per-render values like `color: {accentHex}`)
		// that CSP hashes cannot cover. script-src is the XSS-critical directive;
		// hardening it is the win here.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				// SvelteKit auto-adds the hash of its own inline hydration
				// bootstrap. The two hashes below are the static author scripts
				// in src/app.html (dark-mode pre-paint init + SW registration) —
				// SvelteKit does NOT hash author scripts in app.html. If you edit
				// either inline script, update these; the test
				// src/app-html-csp.test.ts pins them so drift fails CI.
				'script-src': [
					'self',
					'wasm-unsafe-eval',
					'https://static.cloudflareinsights.com',
					'sha256-qzKuFldrMK4qs/LEi+vQNxNT89C5GJlYyW9a0hZWtVg=',
					'sha256-UIFddJohPrhXh+k9VkPCsy4Sgp1nZ+HUzlxHUoZm484='
				],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://cloudflareinsights.com',
					'https://www.epilepc.ch',
					'https://epilepc.ch',
					'https://direct.epilepc.ch'
				],
				'font-src': ['self', 'data:'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
