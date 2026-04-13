import { writable } from 'svelte/store';

/**
 * Global open-state for the quick-add bottom sheet.
 *
 * The actual sheet UI lives in +layout.svelte (where it has always lived).
 * This store exists so the bottom-nav center FAB (CIPH-201) can trigger
 * the same modal without duplicating the sheet markup or hoisting the
 * existing FAB state into a context.
 */
export const quickAddOpen = writable(false);
