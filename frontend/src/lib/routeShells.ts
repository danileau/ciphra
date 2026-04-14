/**
 * CIPH-833 — route-shell registry.
 *
 * One place to answer three questions per route:
 *   1. Which layout shell wraps it?
 *   2. Does it require auth (redirect to /login if not signed in)?
 *   3. Does it require a blueprint (redirect to /setup if empty)?
 *
 * Before this module, `+layout.svelte` had a long `currentPath !== …`
 * chain for every redirect guard. Each new route meant patching the
 * chain in several reactive blocks, and we kept forgetting one —
 * `/migrate` had to be added to the auth allow-list, the blueprint
 * allow-list, and the public-chrome match separately.
 *
 * When adding a new route, add a pattern to `ROUTE_SHELLS` (or confirm
 * one of the existing catch-alls already covers it) and re-run
 * `routeShells.test.ts`. That is the single touchpoint.
 *
 * Shell types:
 *   - `landing`      — public marketing shell (/).
 *   - `auth-flow`    — login / migrate / stream join. Centred card,
 *                      public top-nav, no bottom nav.
 *   - `authed-app`   — the signed-in app: top header + optional
 *                      bottom nav + main slot.
 *   - `public-doc`   — public reading pages (privacy, terms,
 *                      conditions catalogue).
 *   - `admin`        — authed-app variant for /admin.
 *   - `family-claim` — /join/* family-code claim flow (public,
 *                      transitions to authed after claim).
 *
 * `requiresAuth` and `requiresBlueprint` drive the redirect guards
 * in `+layout.svelte`, not the shell choice. A route can be
 * `authed-app` shell without requiring a blueprint yet (e.g.
 * `/setup` itself).
 */

export type ShellType =
	| 'landing'
	| 'auth-flow'
	| 'authed-app'
	| 'public-doc'
	| 'admin'
	| 'family-claim';

export interface RouteShellRule {
	pattern: RegExp;
	shell: ShellType;
	requiresAuth: boolean;
	requiresBlueprint: boolean;
}

/**
 * Order matters — the first matching pattern wins. Put narrow
 * patterns before broader catch-alls.
 *
 * The catch-all at the bottom (`/^\//`) resolves to a safe default
 * (authed-app, requires both) so an unknown new route fails closed
 * rather than leaking past auth/blueprint guards.
 */
export const ROUTE_SHELLS: RouteShellRule[] = [
	// Landing — public marketing page at exactly "/".
	{ pattern: /^\/$/, shell: 'landing', requiresAuth: false, requiresBlueprint: false },

	// Auth flow: login + migrate (cross-origin import) + stream (family
	// invite link handoff). All render a centred card on the public
	// chrome; none require auth or a blueprint.
	{ pattern: /^\/login(\/|$)/, shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
	{ pattern: /^\/migrate(\/|$)/, shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },
	{ pattern: /^\/stream(\/|$)/, shell: 'auth-flow', requiresAuth: false, requiresBlueprint: false },

	// Public reading / catalogue. No auth, no blueprint.
	{ pattern: /^\/privacy(\/|$)/, shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
	{ pattern: /^\/terms(\/|$)/, shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
	{ pattern: /^\/protocol(\/|$)/, shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },
	{ pattern: /^\/conditions(\/|$)/, shell: 'public-doc', requiresAuth: false, requiresBlueprint: false },

	// Family-claim flow. Public: the invitee might not have an account
	// yet. Auth + blueprint redirects happen inside the page itself
	// post-claim.
	{ pattern: /^\/join(\/|$)/, shell: 'family-claim', requiresAuth: false, requiresBlueprint: false },

	// Admin. Requires auth; no blueprint required (an admin caregiver
	// might never have set one up for themselves).
	{ pattern: /^\/admin(\/|$)/, shell: 'admin', requiresAuth: true, requiresBlueprint: false },

	// Setup wizard itself is authed-shell but must not require a
	// blueprint — that is what it is creating.
	{ pattern: /^\/setup(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: false },

	// Settings also does not require a blueprint — caregivers linked
	// to another vault may never set up their own.
	{ pattern: /^\/settings(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: false },

	// Primary authed app pages. Require both auth and a blueprint.
	{ pattern: /^\/log(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
	{ pattern: /^\/journal(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
	{ pattern: /^\/calendar(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
	{ pattern: /^\/reports(\/|$)/, shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },

	// Safe default: authed-app shell + both guards. An unrecognised
	// route therefore fails closed (signed-out user is sent to /login;
	// blueprint-less user is sent to /setup) rather than rendering
	// authed chrome to the public.
	{ pattern: /^\//, shell: 'authed-app', requiresAuth: true, requiresBlueprint: true },
];

export interface RouteShellInfo {
	shell: ShellType;
	requiresAuth: boolean;
	requiresBlueprint: boolean;
}

/**
 * Resolve the shell + guards for a given pathname. Strips any
 * search / hash tails so the caller can pass the raw URL pathname
 * directly.
 */
export function shellFor(pathname: string): RouteShellInfo {
	// Normalise: keep only the path portion (caller may pass
	// `/migrate#foo` or `/login?next=/` by accident).
	const path = pathname.split('#')[0].split('?')[0] || '/';
	for (const rule of ROUTE_SHELLS) {
		if (rule.pattern.test(path)) {
			return {
				shell: rule.shell,
				requiresAuth: rule.requiresAuth,
				requiresBlueprint: rule.requiresBlueprint,
			};
		}
	}
	// Unreachable given the `/^\//` catch-all, but keep a hard default.
	return { shell: 'authed-app', requiresAuth: true, requiresBlueprint: true };
}
