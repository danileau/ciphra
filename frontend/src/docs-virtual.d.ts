/**
 * Type for the `virtual:ciphra-docs` module provided by the `ciphraDocs`
 * Vite plugin (see vite.config.ts). Keys are repo-relative paths
 * (`README.md`, `docs/ARCHITECTURE.md`, …); values are the raw markdown.
 */
declare module 'virtual:ciphra-docs' {
	export const docs: Record<string, string>;
}
