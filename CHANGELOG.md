# Changelog

What changed in ciphra, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[SemVer](https://semver.org) — see [`docs/VERSIONING.md`](docs/VERSIONING.md)
for what MAJOR / MINOR / PATCH mean here.

This file is written for the people who use ciphra: what's new, what's fixed,
and — for the rare breaking change — what you need to do. It is readable in the
app at **/docs → Changelog** and here on the public repo.

## [Unreleased]

<!-- Nothing yet. Add lines here as you work; they become the next release. -->

## [1.3.0] — 2026-08-30

The first release under the 1.x line. ciphra has been serving real users since
0.1.0 in June; the version now says so. From here the SemVer rules in
[`docs/VERSIONING.md`](docs/VERSIONING.md) apply in full — in particular, a
breaking change bumps MAJOR rather than MINOR.

### Added
- ciphra is now published under the **GNU Affero General Public License v3.0**.
  You may run, study, change and share it. If you run a modified copy as a
  service, §13 obliges you to offer your own users its source.
- Every screen now links to the source code of the version you are actually
  looking at (footer → "Quellcode"). Operators of a modified copy point it at
  their own repository with `PUBLIC_SOURCE_URL`; unset, it links here.
- **You now choose what a family invitation may see.** When you create one, pick
  "everything except the diary" — which stays the default — or "everything,
  diary included". Some people want a relative to see the whole picture; others
  keep the diary to themselves, and both are now a choice rather than an
  assumption. You can change it later on any invitation you have already sent.
  The limit is enforced by the server, so an entry outside the scope is never
  sent to the other person at all. Narrowing an invitation stops further access;
  as with revoking, it cannot take back what was already downloaded.

### Fixed
- The account switcher in the header ("Ansicht") opened a dropdown that looked
  broken and, in dark mode, was close to unreadable. It now opens a proper
  ciphra menu that looks the same in both themes. If someone has shared their
  account with you, this is the control you use to switch between their data
  and your own.
- **Someone you gave family access to could read your diary and your locked
  entries.** The app said they couldn't — the banner on their screen even said
  how many entries were being kept back — but nothing was filtering them. Family
  access now shows only what you share: the diary and any entry you locked stay
  with you. If you have given someone access, their copy of those entries is
  removed from their device the next time they open ciphra.
- The diary offered a "private" switch that did nothing. Diary entries are never
  exported, whichever way it was set, while the switch claimed the entry would
  appear in the export for your doctor. The switch is gone from diary entries and
  says plainly that they stay private; it still works as before on day entries
  and note markers.

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

[Unreleased]: https://github.com/danileau/ciphra/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/danileau/ciphra/releases/tag/v1.3.0
[0.1.0]: https://github.com/danileau/ciphra/releases/tag/v0.1.0
