/**
 * Locale-aware date helpers.
 *
 * Used by: calendar/+page.svelte, reports/+page.svelte (day-coverage strip,
 * year heatmap). Don't hardcode weekday letters — Mon/Tue/etc. differ across
 * DE/FR/IT/EN, and starting weekday differs across locales too (we render
 * Monday-first; locale formatting handles the LETTER, not the order).
 */

/**
 * Returns 7 narrow weekday labels (e.g. "M", "Di", "Lu") for the active locale,
 * Monday-first. `style: 'short'` gives 2–3 chars depending on locale; `style:
 * 'narrow'` gives single-letter. Default is 'short'.
 */
export function weekdayLabels(
	locale: string,
	style: 'short' | 'narrow' = 'short',
): string[] {
	return Array.from({ length: 7 }, (_, i) => {
		// Jan 1 2024 is Monday — calendar/reports both render Monday-first.
		const d = new Date(2024, 0, i + 1);
		return d.toLocaleDateString(locale, { weekday: style });
	});
}
