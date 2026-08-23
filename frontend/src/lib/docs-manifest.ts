/**
 * Which repository documents the app ships to users at `/docs`.
 *
 * This used to be "README + SECURITY + CHANGELOG, plus every top-level
 * `docs/*.md`" — a rule that quietly grew a patient-facing docs section
 * every time someone added a file to `docs/`. By 2026-08 the production
 * bundle at ciphra.ch was serving people living with epilepsy the
 * operator runbook (rclone backup targets, the deploy timer, the
 * Cloudflare WAF setup) and the forward-looking product backlog.
 *
 * Nothing secret leaked — the repository is public and holds no
 * credentials — but it was never a decision, and every one of those
 * files is dead weight in a bundle a phone has to download.
 *
 * So the set is explicit. `docs-manifest.test.ts` fails if a new
 * `docs/*.md` is neither listed here nor named in `NOT_IN_APP`: adding
 * documentation now forces a deliberate answer to "should a patient see
 * this?" instead of defaulting to yes.
 *
 * Paths are relative to the repository root.
 */
export const IN_APP_DOCS = [
	'README.md',
	'CHANGELOG.md',
	'SECURITY.md',
	'docs/SECURITY_MODEL.md',
	'docs/FEATURES.md',
	'docs/ARCHITECTURE.md',
	'docs/DEVELOPING.md',
] as const;

/**
 * Deliberately not shipped to the app — written for operators and
 * contributors, who read them in the repository.
 *
 * Listing them (rather than just omitting them) is what makes the test
 * able to tell "decided against" apart from "forgotten".
 */
export const NOT_IN_APP = [
	'docs/OPERATIONS.md', // production runbook: backups, deploys, WAF
	'docs/INCIDENT_RESPONSE.md', // incident playbook, on-call shaped
	'docs/THREAT_MODEL.md', // engineering companion to the security model
	'docs/VERSIONING.md', // release process, contributor-facing
	'docs/backlog.md', // unbuilt plans — not promises to users
] as const;
