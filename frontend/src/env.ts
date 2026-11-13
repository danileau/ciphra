import { defineEnvVars } from '@sveltejs/kit/env';

// Environment variables the app reads, made available through
// `$app/env/public` (public: true) and `$app/env/private`.
export const variables = defineEnvVars({
	// AGPL-3.0 §13 source offer - see src/lib/source.ts. Public (the browser
	// renders the link) and NOT static: the published images are built once by
	// CI and a self-hoster sets this at runtime, so it must not be baked into
	// the bundle. Optional: unset (or empty) falls back to upstream in
	// resolveSourceUrl(), so the schema passes the raw value through.
	PUBLIC_SOURCE_URL: {
		public: true,
		static: false,
		schema: (value) => value
	}
});
