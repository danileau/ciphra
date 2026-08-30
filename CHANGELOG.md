# Changelog

What changed in ciphra, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[SemVer](https://semver.org) — see [`docs/VERSIONING.md`](docs/VERSIONING.md)
for what MAJOR / MINOR / PATCH mean here.

This file is written for the people who use ciphra: what's new, what's fixed,
and — for the rare breaking change — what you need to do. It is readable in the
app at **/docs → Changelog** and here on the public repo.

## [Unreleased]

### Added
- ciphra is now published under the **GNU Affero General Public License v3.0**.
  You may run, study, change and share it. If you run a modified copy as a
  service, §13 obliges you to offer your own users its source.
- Every screen now links to the source code of the version you are actually
  looking at (footer → "Quellcode"). Operators of a modified copy point it at
  their own repository with `PUBLIC_SOURCE_URL`; unset, it links here.

### Fixed
- The account switcher in the header ("Ansicht") opened a dropdown that looked
  broken and, in dark mode, was close to unreadable. It now opens a proper
  ciphra menu that looks the same in both themes. If someone has shared their
  account with you, this is the control you use to switch between their data
  and your own.

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
