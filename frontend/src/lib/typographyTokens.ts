/**
 * CIPH-831 — typography token discipline.
 *
 * Allowed `text-{size}` utilities across `frontend/src/**`.
 * Enforced by `typographyTokens.test.ts`.
 *
 * Scale (semantic guidance):
 *   text-xs   — captions, helpers, dense metadata.
 *   text-sm   — default body on information-dense pages (journal rows, tables).
 *   text-base — default body on landing / marketing sections.
 *   text-lg   — large body, card lead-in.
 *   text-xl   — section h2.
 *   text-2xl  — page h1.
 *   text-3xl  — landing display (mobile).
 *   text-4xl  — landing display (sm breakpoint).
 *   text-5xl  — landing display (md breakpoint, responsive hero only).
 *   text-6xl  — landing display (lg breakpoint, responsive hero only).
 *
 * Never invent new sizes. If a design genuinely needs a size not
 * in this list, amend this file and document why.
 */
export const ALLOWED_TEXT_SIZES = [
	'text-xs',
	'text-sm',
	'text-base',
	'text-lg',
	'text-xl',
	'text-2xl',
	'text-3xl',
	'text-4xl',
	'text-5xl',
	'text-6xl',
] as const;

/**
 * Bracket-form text sizes permitted as micro-caption exceptions.
 * These are documented below-`text-xs` sizes used for dense badges
 * and tiny meta labels where `text-xs` (12px) is still too large.
 */
export const ALLOWED_TEXT_BRACKETS = ['text-[11px]', 'text-[10px]'] as const;

export type AllowedTextSize = (typeof ALLOWED_TEXT_SIZES)[number];
