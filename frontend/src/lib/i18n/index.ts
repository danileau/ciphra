import { writable, derived, get } from 'svelte/store';
import de from './de';

export type Locale = 'de' | 'en' | 'fr' | 'it';
export const locales: Locale[] = ['de', 'en', 'fr', 'it'];
export const localeNames: Record<Locale, string> = { de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano' };

// `de` is the SSR/fallback dict and is bundled eagerly. The other three are
// loaded on demand via dynamic import — splits ~130KB gzip off first paint
// for users whose detected locale is also `de` (the dominant Swiss case).
//
// CIPH-pi24-3 — `translations` is a writable store, not a plain object.
// The previous design wrote `translations[target] = mod.default` inside a
// dynamic-import .then() and tried to nudge the derived `t` store with
// `_locale.update((l) => l)`. That trick fails for primitive locale strings
// because Svelte's writable bails on no-op `set` (`safe_not_equal('en','en')`
// returns false → no notify → derived doesn't re-run → page stays on the DE
// fallback even after the EN dict resolves). Making `translations` a writable
// + deriving `t` from `[locale, translations]` removes the trick entirely.
const translations = writable<Partial<Record<Locale, Record<string, string>>>>({ de });
const inflight: Partial<Record<Locale, Promise<Record<string, string>>>> = {};

const localeLoaders: Record<Exclude<Locale, 'de'>, () => Promise<{ default: Record<string, string> }>> = {
	en: () => import('./en'),
	fr: () => import('./fr'),
	it: () => import('./it'),
};

async function ensureLocale(target: Locale): Promise<void> {
	if (get(translations)[target]) return;
	if (target === 'de') return;
	if (!inflight[target]) {
		inflight[target] = localeLoaders[target as Exclude<Locale, 'de'>]()
			.then((mod) => {
				// Single-step write + notify. derived `t` re-runs with the
				// new dict in scope; no need for the `_locale.update((l)=>l)`
				// trick that was silently broken for primitive locale values.
				translations.update((t) => ({ ...t, [target]: mod.default }));
				return mod.default;
			})
			.catch((err) => {
				// CIPH-pi24-3 — Without this catch a failed import gives a
				// silent perpetual fallback to DE forever (or until reload).
				// Clearing `inflight[target]` lets the user retry by switching
				// away and back.
				console.warn(`[i18n] locale dict failed to load: ${target}`, err);
				delete inflight[target];
				throw err;
			});
	}
	try {
		await inflight[target];
	} catch {
		// Swallow the rejection at this layer; consumers get DE fallback via
		// the derived `t` and can retry. Re-throwing here would force every
		// caller to wrap in try/catch — overkill for an i18n best-effort load.
	}
}

function detectLocale(): Locale {
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem('ciphra_locale') as Locale;
		if (saved && locales.includes(saved)) return saved;
	}
	if (typeof navigator !== 'undefined') {
		const lang = navigator.language.slice(0, 2) as Locale;
		if (locales.includes(lang)) return lang;
	}
	return 'de';
}

const _locale = writable<Locale>(detectLocale());

_locale.subscribe((l) => {
	if (typeof localStorage !== 'undefined') localStorage.setItem('ciphra_locale', l);
	if (typeof document !== 'undefined') document.documentElement.lang = l;
	// Kick off the load if needed; refreshes on resolve via the update() above.
	void ensureLocale(l);
});

export const locale = {
	subscribe: _locale.subscribe,
	set(val: string) {
		if (locales.includes(val as Locale)) _locale.set(val as Locale);
	}
};

export const t = derived([locale, translations], ([$locale, $trans]) => {
	// Prefer the requested locale; fall back to `de` while a pending dict
	// resolves, then to the raw key. Re-derives whenever `translations`
	// updates (i.e., a dynamic-import .then() resolved) — fixes the silent
	// fallback bug at CIPH-pi24-3.
	const dict = $trans[$locale];
	const fallback = $trans.de;
	return (key: string, params?: Record<string, string | number>): string => {
		let str = (dict && dict[key]) || (fallback && fallback[key]) || key;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				str = str.replace(`{${k}}`, String(v));
			}
		}
		return str;
	};
});

/**
 * Translate a vital's unit string if a `vital.unit_<unit>` key exists,
 * else pass the raw unit through. Lets preset units like `'day'`/`'days'`
 * render in the active locale while keeping `kg`, `mmHg`, `%`, etc. as-is.
 */
export function translateUnit(
	translator: (key: string, params?: Record<string, string | number>) => string,
	unit: string | undefined
): string {
	if (!unit) return '';
	const key = `vital.unit_${unit}`;
	const translated = translator(key);
	// t() returns the key verbatim on miss — fall back to the raw unit.
	return translated === key ? unit : translated;
}

/**
 * Plural-aware translator. The dictionary stores singular and plural
 * variants under `<base>_one` and `<base>_other` keys; this helper
 * picks the right form per `Intl.PluralRules` for the active locale.
 *
 * Falls back to the `_other` form when only one variant exists, and
 * to the bare key when neither exists (so missing-key behaviour is
 * the same as `t()`).
 *
 * Example dictionary entries:
 *   'reports.days_logged_one':   '{count} day logged',
 *   'reports.days_logged_other': '{count} days logged',
 *
 * Usage:
 *   {plural($t, $locale, 'reports.days_logged', n)}
 */
export function plural(
	translator: (key: string, params?: Record<string, string | number>) => string,
	currentLocale: Locale,
	baseKey: string,
	count: number,
	extraParams: Record<string, string | number> = {},
): string {
	const rules = new Intl.PluralRules(currentLocale);
	const category = rules.select(count); // 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
	const params = { count, ...extraParams };
	// Try the exact category first, then `_other`, then the bare key.
	const tryKey = (k: string) => {
		const out = translator(k, params);
		return out === k ? null : out;
	};
	return (
		tryKey(`${baseKey}_${category}`) ??
		tryKey(`${baseKey}_other`) ??
		translator(baseKey, params)
	);
}

// Force-load all locales (for tests or for surfaces that switch language
// often, like the public language picker on landing where users will
// click through them).
export async function ensureAllLocales(): Promise<void> {
	await Promise.all(locales.map(ensureLocale));
}

// Re-export for tests that need to reset state.
export { ensureLocale, get };
