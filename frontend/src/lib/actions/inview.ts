/**
 * CIPH-895 — `inview` Svelte action.
 *
 * Adds an `in-view` class to the host element the first time it
 * scrolls into the viewport. Lets a route opt sections into a
 * "fade-in on scroll" treatment via CSS without any JS-driven
 * animation library — we use the platform's `IntersectionObserver`
 * + a 200-ms transition declared in the host's `<style>` block.
 *
 * Honours `prefers-reduced-motion`: when the user has reduced motion,
 * the class is added immediately on mount so content is visible
 * without animation.
 *
 * Usage:
 *   ```svelte
 *   <section class="reveal" use:inview>...</section>
 *   ```
 *   ```css
 *   .reveal {
 *     opacity: 0;
 *     transform: translateY(12px);
 *     transition: opacity 0.5s ease-out, transform 0.5s ease-out;
 *   }
 *   .reveal.in-view {
 *     opacity: 1;
 *     transform: none;
 *   }
 *   @media (prefers-reduced-motion: reduce) {
 *     .reveal { opacity: 1; transform: none; transition: none; }
 *   }
 *   ```
 */

export interface InviewOptions {
	/** IntersectionObserver `rootMargin`. Default `'0px 0px -10% 0px'`
	 *  fires the action slightly before the element fully enters view. */
	rootMargin?: string;
	/** Threshold 0..1. Default 0.1 — 10% visible triggers the reveal. */
	threshold?: number;
	/** When true, the class is removed when the element leaves view
	 *  (re-triggers next time). Default false — once revealed, stays. */
	once?: boolean;
}

export function inview(node: HTMLElement, options: InviewOptions = {}) {
	const { rootMargin = '0px 0px -10% 0px', threshold = 0.1, once = true } = options;

	// SSR / no-IO fallback: immediately reveal so content isn't trapped
	// in opacity-0.
	if (typeof IntersectionObserver === 'undefined') {
		node.classList.add('in-view');
		return { destroy() {} };
	}

	const reduced =
		typeof window !== 'undefined' &&
		window.matchMedia &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduced) {
		node.classList.add('in-view');
		return { destroy() {} };
	}

	const obs = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					node.classList.add('in-view');
					if (once) obs.unobserve(node);
				} else if (!once) {
					node.classList.remove('in-view');
				}
			}
		},
		{ rootMargin, threshold },
	);
	obs.observe(node);

	return {
		destroy() {
			obs.disconnect();
		},
	};
}
