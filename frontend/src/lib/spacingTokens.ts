/**
 * CIPH-830 — spacing token discipline.
 *
 * This list defines the allowed Tailwind spacing values for any
 * `gap-*`, `p-*`, `m-*`, `space-x-*`, `space-y-*` utility in
 * `frontend/src/**`. Enforced by `spacingTokens.test.ts`.
 *
 * Rhythm: Tailwind's default 4px-step scale up to 6 (24px), then
 * jumps to 8/10/12/16/20/24 for layout gaps, and 28/32/40/48 for
 * hero sections, page padding, and bottom-nav clearance. Half-steps
 * (2.5, 3.5) and odd integers (7, 9, 11, 13, 14, 15, 17, 18, 19)
 * are intentionally disallowed — they were the patchwork PI v9 set
 * out to remove. If you need one, pick the visually closer allowed
 * value. If you genuinely need a new value, amend this file and
 * document the reason in the README — don't add ad-hoc arbitrary
 * values.
 */
export const ALLOWED_SPACING = [
	'0',
	'0.5',
	'1',
	'1.5',
	'2',
	'3',
	'4',
	'5',
	'6',
	'8',
	'10',
	'12',
	'16',
	'20',
	'24',
	'28',
	'32',
	'40',
	'48',
	'px', // Tailwind's `p-px` = 1px; allowed for hairline offsets.
	'auto', // `m-auto`, `mx-auto`, etc.
	'full', // `w-full`-style, not spacing — but `m-full` etc. wouldn't ever be used; kept for regex generality.
] as const;

/**
 * Bracket-form spacing values permitted as exceptions to the token
 * rule. Add here only with a comment explaining why a standard
 * token does not work.
 *
 * Note: this list covers `gap-[…]`, `p*-[…]`, `m*-[…]`,
 * `space-{x,y}-[…]` only. It does NOT cover `min-h-[44px]` etc —
 * those are outside the spacing-utility regex scope.
 */
export const ALLOWED_BRACKET_SPACING = [
	'calc(2rem+env(safe-area-inset-bottom,0px))', // iOS safe-area-aware bottom padding for scrollable modals.
] as const;

export type AllowedSpacing = (typeof ALLOWED_SPACING)[number];
