const CACHE_VERSION = 'ciphra-v1';

self.addEventListener('install', (event) => {
	self.skipWaiting();
});

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

	// API requests: network only (encrypted data handled by IndexedDB)
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) {
		event.respondWith(fetch(request));
		return;
	}

	// Navigation requests: network first, cache fallback
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const clone = response.clone();
					caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
					return response;
				})
				.catch(() => caches.match(request))
		);
		return;
	}

	// Static assets: cache first, network fallback
	event.respondWith(
		caches.match(request).then(
			(cached) =>
				cached ||
				fetch(request).then((response) => {
					const clone = response.clone();
					caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
					return response;
				})
		)
	);
});
