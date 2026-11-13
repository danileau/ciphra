/**
 * Vitest setup - jsdom gaps that Svelte 5 runtime expects.
 *
 * Svelte 5 transitions/animations call `Element.animate()`, which jsdom
 * does not implement - without this stub every component carrying a
 * transition dies with "element.animate is not a function" on render.
 * The stub returns a minimal Animation-like object that resolves
 * immediately; tests assert on state, not on motion.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.animate !== 'function') {
	Element.prototype.animate = function animate(): Animation {
		const anim = {
			finished: Promise.resolve(),
			currentTime: 0,
			playState: 'finished',
			cancel() {},
			finish() {},
			pause() {},
			play() {},
			reverse() {},
			addEventListener() {},
			removeEventListener() {},
			onfinish: null as (() => void) | null,
			oncancel: null as (() => void) | null,
		};
		// Svelte awaits onfinish to tear the transition down.
		queueMicrotask(() => anim.onfinish?.());
		return anim as unknown as Animation;
	};
}

/**
 * `$app/env/public` is generated from src/env.ts and populated by the
 * SvelteKit runtime when the app starts. Under vitest nothing populates it
 * and importing it throws, which takes down every test that reaches
 * lib/source.ts. Stub it for all test files - see
 * src/lib/testing/app-env-public.ts.
 */
import { vi } from 'vitest';
vi.mock('$app/env/public', () => import('./lib/testing/app-env-public.ts'));

export {};
