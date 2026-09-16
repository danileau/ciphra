# Changelog

What changed in ciphra, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[SemVer](https://semver.org) — see [`docs/VERSIONING.md`](docs/VERSIONING.md)
for what MAJOR / MINOR / PATCH mean here.

This file is written for the people who use ciphra: what's new, what's fixed,
and — for the rare breaking change — what you need to do. It is readable in the
app at **/docs → Changelog** and here on the public repo.

## [Unreleased]

### Fixed
- When the server was briefly unreachable and the connection answered with an
  error page instead, saving an entry failed. It is now kept on your device and
  synced once the server is back, the same as when you are offline.
- **An entry you locked while offline could still be shown to a family member
  after it synced.** It now syncs as private. The next time you open ciphra it
  also corrects any entry whose sharing no longer matches how you marked it.
- Coming back online could save an entry you wrote offline twice.
- If someone removed your access to their account while you still had unsynced
  changes for it, none of your other offline changes synced any more. Your own
  entries now sync regardless; the changes for the account you can no longer
  open are discarded. If an account is full, its offline entries now wait
  without holding up anything else, and ciphra tells you why.
- Editing an entry online right after an offline edit of it could later be
  overwritten by the older offline version.
- Importing a long history with large diary entries could be rejected as too big
  and fall back to a slow one-by-one import.
- Error messages about loading or saving entries were shown in English whatever
  your language.
- **Reloading the page while viewing someone else's account could show your own
  entries under their name** — and a new entry could then be saved to the wrong
  account. Switching between accounts quickly could also leave the previous
  account's entries on screen. The account named in the banner is now always
  the one you see and write to — until it has loaded you see the loading
  indicator — and "Retry" reloads everything that account needs.
- **A save that failed could still say "Saved".** The day view, the quick-add
  sheet and deleting an entry now tell you when something did not go through,
  and keep what you typed so you can try again. (Saving while offline still
  counts as saved — it syncs later, as before.)
- Pressing Enter or Ctrl+S twice in a row could save the same entry twice, and
  Ctrl+S on an empty day saved an empty entry.
- Leaving a day with unsaved changes — including with the arrow keys — threw the
  changes away without asking. ciphra now asks first.
- In someone else's account, the quick-add sheet and the day view offered a
  diary entry and a "private" switch. Those entries disappeared from your view
  after a reload while staying visible to others with access. Both options are
  now only offered in your own account.
- Entries added with the quick-add button between midnight and about 2 a.m.
  were filed under the previous day. The reports page, the journal's time filter
  and the "top triggers" card could be off by a day in the same hours.
- Changing an episode count with + / − in the reports table could be undone the
  next time you saved that day, and clicking quickly could lose clicks or create
  a second entry for the same day.
- Logging out left two health-related settings behind on the device: the target
  values for your vitals from the setup wizard, and the episode type you last
  picked in quick-add. Both are now removed when you log out, so the doctor PDF
  uses the standard reference lines after you log in again. The security
  documentation now lists every setting ciphra keeps in the browser.
- A doctor PDF exported for someone else's account drew their charts against
  your own vital targets. It now uses the standard reference lines.
- **"Revoke all" could fail without telling you** — and so could revoking a
  single invitation. You now see clearly when access was not removed, so you can
  try again. Creating an invitation or changing what it may see also reports a
  failure instead of silently stopping, and if your invitations cannot be
  loaded, ciphra says so rather than showing that there are none.
- Some error messages in Settings and in family sharing were shown in English
  whatever your language, and "last seen" used English abbreviations.
- The quick-add sheet now works with a keyboard and screen readers: it is
  announced as a dialog, keeps focus inside while open, closes with Escape, and
  returns you to the button that opened it.

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
