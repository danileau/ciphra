# Changelog

What changed in ciphra, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[SemVer](https://semver.org) — see [`docs/VERSIONING.md`](docs/VERSIONING.md)
for what MAJOR / MINOR / PATCH mean here.

This file is written for the people who use ciphra: what's new, what's fixed,
and — for the rare breaking change — what you need to do. It is readable in the
app at **/docs → Changelog** and here on the public repo.

## [Unreleased]

### Changed
- The in-app documentation at **/docs** now shows only what's written for you:
  the security model, features, architecture, the changelog and the developer
  guide. The operator runbook, incident playbook and product backlog were being
  published there too — they're written for whoever runs the server, and they
  now live only in the repository. The security model moved from `/docs/security`
  to `/docs/security_model`; `/docs/security` is now the vulnerability-reporting
  policy.

<!--
Add lines under the relevant heading (omit empty headings):

### Added        — new capability (→ MINOR)
### Changed      — behaviour of something that already existed (→ MINOR/PATCH)
### Fixed        — a bug is gone (→ PATCH)
### Security     — a hardening or vulnerability fix (→ PATCH, or MAJOR if it changes the data contract)
### Deprecated   — still works, going away
### Removed      — gone (often → MAJOR)

Write for a user, not a commit log: "Reports export now offers a period
picker", not "add exportPeriods.ts".
-->

## [0.1.0] — 2026-06-11

Baseline: the first version tracked under this changelog. ciphra went live for
its first users on this date. Earlier history lives in the git log and the
`docs/` records; from here on, every user-visible change lands in a section
above.

### Added
- Zero-knowledge health tracking: client-side encryption, condition blueprints,
  daily logging, cohort-aware dashboard / calendar / journal / reports, the
  doctor PDF and CSV export, family sharing, recovery codes, epilepc migration,
  and the admin surface. (Established feature set — see
  [`docs/FEATURES.md`](docs/FEATURES.md).)

[Unreleased]: https://github.com/danileau/ciphra/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/danileau/ciphra/releases/tag/v0.1.0
