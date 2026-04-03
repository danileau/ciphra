import { writable } from 'svelte/store';

function createDarkMode() {
	const initial =
		typeof localStorage !== 'undefined'
			? localStorage.getItem('ciphra_dark') === 'true' ||
				(!localStorage.getItem('ciphra_dark') &&
					typeof window !== 'undefined' &&
					window.matchMedia('(prefers-color-scheme: dark)').matches)
			: false;

	const { subscribe, set } = writable(initial);

	function apply(dark: boolean) {
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', dark);
		}
	}

	apply(initial);

	return {
		subscribe,
		toggle() {
			let current: boolean = false;
			subscribe((v) => (current = v))();
			const next = !current;
			set(next);
			apply(next);
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('ciphra_dark', String(next));
			}
		},
		init() {
			let current: boolean = false;
			subscribe((v) => (current = v))();
			apply(current);
		}
	};
}

export const darkMode = createDarkMode();
