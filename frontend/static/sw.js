const CACHE_VERSION = 'ciphra-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
		)
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Only handle http/https
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	// Cross-origin fetches (e.g. epilepc migration bundle) bypass the SW entirely —
	// let the browser handle them natively so real CORS / network errors surface.
	if (url.origin !== self.location.origin) return;

	// API: network only
	if (url.pathname.startsWith('/api') || url.pathname === '/health') {
		event.respondWith(fetch(request).catch(() => new Response('{"error":"offline"}', {
			status: 503, headers: { 'Content-Type': 'application/json' }
		})));
		return;
	}

	// Navigation: network first, cache fallback
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
					}
					return response;
				})
				.catch(() => caches.match(request).then((r) => r || new Response('Offline', { status: 503 })))
		);
		return;
	}

	// Static assets: cache first, network fallback
	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) return cached;
			return fetch(request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
					}
					return response;
				})
				.catch(() => new Response('', { status: 503 }));
		})
	);
});
