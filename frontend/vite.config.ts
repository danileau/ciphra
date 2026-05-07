import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };
// CIPH-pi20-LB-6 — default 5000 → 5050: macOS AirPlay/AirTunes listens
// on :5000 by default, which silently 403'd against our API in local
// dev (FULL_REVIEW 2026-05-05 P1.3). 5050 is collision-free across
// macOS/Linux/Windows. Override via VITE_API_URL when needed.
const apiTarget = process.env.VITE_API_URL || 'http://localhost:5050';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5173,
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
