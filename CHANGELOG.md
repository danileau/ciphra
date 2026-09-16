# Changelog

What changed in ciphra, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[SemVer](https://semver.org) — see [`docs/VERSIONING.md`](docs/VERSIONING.md)
for what MAJOR / MINOR / PATCH mean here.

This file is written for the people who use ciphra: what's new, what's fixed,
and — for the rare breaking change — what you need to do. It is readable in the
app at **/docs → Changelog** and here on the public repo.

## [Unreleased]

### Security
- **A deleted account's sign-ins stop working straight away, on every device.**
  They could still be accepted until they expired, up to a day later. Taking away
  admin rights now also takes effect on the next click rather than the next
  sign-in.
- **If ciphra's database briefly can't be reached, requests are refused, not
  waved through, and you stay signed in.** The server used to skip its sign-in
  check during such an outage — and signed out anyone who had ever changed or
  reset their password. The app now treats it like being offline.
- **An account suspended by an administrator stays suspended.** Signing in with
  the right password, or resetting it with the recovery code, used to lift the
  suspension; it now doesn't, and suspending an account also signs it out on
  every device. The automatic 15-minute lock after too many wrong passwords is
  unchanged: the right password still gets you in.
- **After a lockout has run out, one typo no longer locks you out again.** The
  failed-attempt count used to stay at its maximum, so the very next mistake
  started another 15 minutes. Several wrong attempts at the same moment are now
  also all counted.
- **If someone you share with deletes their ciphra account, their access is
  revoked** instead of the invitation becoming claimable again with the same
  code. Invite them again if they come back.
- **Two people using the same invitation at the same moment** can no longer
  both be told it worked. One gets it; the other is told it is already taken.
- If someone holds two of your invitations with different scopes, the narrower
  one now always applies, rather than whichever the server happened to read.
- Looking up a username's family invitations no longer gives away, through the
  reply alone, whether that person has any. The security model now says plainly
  what can still be learned about whether an account exists: registration tells
  you a name is taken, and a lockout tells you the account is real.
- IP addresses in the audit log are now shortened after 30 days and the entries
  deleted after 90 even while the server keeps running — this used to happen
  only when it restarted. IPv6 addresses are now shortened correctly; some used
  to be garbled instead. The security model also now spells out that the audit
  log records when documents are created, changed and deleted (never their
  content).
- Malformed requests that used to crash the server are refused cleanly, and one
  bad entry in a bulk import no longer fails the whole import.

### Fixed
- Mistyping your current password when changing your password or deleting your
  account signed you out of ciphra. It now just says the password is wrong.
- Signing in to a suspended account now says the account is suspended, instead
  of claiming the password is wrong.

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
