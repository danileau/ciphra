/**
 * Vitest setup — jsdom gaps that Svelte 5 runtime expects.
 *
 * Svelte 5 transitions/animations call `Element.animate()`, which jsdom
 * does not implement — without this stub every component carrying a
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

export {};
