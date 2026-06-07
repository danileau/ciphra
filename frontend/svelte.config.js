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
		adapter: adapter()
	}
};

export default config;
