/**
 * CIPH-833 — route-shell registry enforcement.
 *
 * For each route that actually exists in `frontend/src/routes/`,
 * assert that `shellFor(path)` returns the expected shell + guards.
 * Adversarial: an unknown new path must fall through to the safe
 * default (authed-app + both guards on).
 */
import { describe, it, expect } from 'vitest';
import { shellFor } from './routeShells';

describe('CIPH-833 — route shell registry', () => {
	const cases: Array<{
		path: string;
		shell: ReturnType<typeof shellFor>['shell'];
		requiresAuth: boolean;
		requiresBlueprint: boolean;
	}> = [
		// Landing — `/` is the public landing for unauthenticated visitors
		// but the authed-app dashboard for logged-in users. requiresBlueprint
		// is true so fresh registrants are redirected to /setup instead of
		// landing on the caregiver-fallback Companion branch.
		{ path: '/', shell: 'landing', requiresAuth: false, requiresBlueprint: true },

		// Auth flow
		{ path: '/login', shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
		{ path: '/login?mode=register', shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
		{ path: '/migrate', shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
		{ path: '/migrate#foo', shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
		{ path: '/stream/abc', shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },

		// Public docs / catalogue
		{ path: '/privacy', shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
		{ path: '/terms', shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
		{ path: '/protocol', shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
		{ path: '/conditions', shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
		{ path: '/conditions/epilepsy', shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },

		// Family-claim
		{ path: '/join/abc123', shell: 'family-claim', requiresAuth: false, requiresBlueprint: false },

		// Admin
		{ path: '/admin', shell: 'admin', requiresAuth: true, requiresBlueprint: false },

		// Setup + settings require auth but not a blueprint.
		{ path: '/setup', shell: 'authed-app', requiresAuth: true, requiresBlueprint: false },
		{ path: '/settings', shell: 'authed-app', requiresAuth: true, requiresBlueprint: false },

		// Primary authed pages — both guards on.
		{ path: '/log/today', shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
		{ path: '/log/2026-04-14', shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
		{ path: '/journal', shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
		{ path: '/calendar', shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
		{ path: '/reports', shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
	];

	for (const c of cases) {
		it(`${c.path} → ${c.shell} (auth=${c.requiresAuth}, blueprint=${c.requiresBlueprint})`, () => {
			const info = shellFor(c.path);
			expect(info.shell).toBe(c.shell);
			expect(info.requiresAuth).toBe(c.requiresAuth);
			expect(info.requiresBlueprint).toBe(c.requiresBlueprint);
		});
	}

	it('unknown routes fall through to the safe default (authed-app + both guards)', () => {
		// A future route that nobody added to the registry must fail
		// closed: the user is sent to /login if not authed, /setup if no
		// blueprint, rather than leaking authed chrome or skipping
		// guards.
		const info = shellFor('/some-future-route-nobody-registered');
		expect(info.shell).toBe('authed-app');
		expect(info.requiresAuth).toBe(true);
		expect(info.requiresBlueprint).toBe(true);
	});

	it('handles query strings and fragments on the catch-all', () => {
		const info = shellFor('/mystery?x=1#y');
		expect(info.shell).toBe('authed-app');
		expect(info.requiresAuth).toBe(true);
		expect(info.requiresBlueprint).toBe(true);
	});
});
