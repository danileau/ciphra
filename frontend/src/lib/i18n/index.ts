import { writable, derived } from 'svelte/store';
import de from './de';
import en from './en';
import fr from './fr';
import it from './it';

export type Locale = 'de' | 'en' | 'fr' | 'it';
export const locales: Locale[] = ['de', 'en', 'fr', 'it'];
export const localeNames: Record<Locale, string> = { de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano' };

const translations: Record<Locale, Record<string, string>> = { de, en, fr, it };

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
});

export const locale = {
	subscribe: _locale.subscribe,
	set(val: string) {
		if (locales.includes(val as Locale)) _locale.set(val as Locale);
	}
};

export const t = derived(locale, ($locale) => {
	const dict = translations[$locale] || translations.de;
	return (key: string, params?: Record<string, string | number>): string => {
		let str = dict[key] || translations.de[key] || key;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				str = str.replace(`{${k}}`, String(v));
			}
		}
		return str;
	};
});
