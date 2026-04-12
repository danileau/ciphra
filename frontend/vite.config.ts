import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };
const apiTarget = process.env.VITE_API_URL || 'http://localhost:5000';

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
