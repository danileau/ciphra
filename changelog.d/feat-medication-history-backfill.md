### Added
- **Your medication history can now reach back before ciphra.** Under a
  medication in Settings, *Add an earlier dose* records what you took before
  the app knew about it — 12 mg, then 10 mg, then the 8 mg it has on record.
  Days you already logged stay exactly as they are. You give a month rather
  than a day, and "I don't remember" is an answer: nobody recalls that a dose
  changed on a Tuesday three years ago.
- **Medications you no longer take can be added.** *Add a medication from the
  past* records a drug that was tried and stopped, with the period, the dose
  and — from a short list — why it ended. It appears under "Stopped" and in
  your reports, without claiming anything about the days it covers.
- **A treatment-history export for a first consultation.** Next to Month and
  Year there is now a *Treatment history* report: every medication you have
  recorded, oldest first, with its dose periods and how each one ended, over
  the whole span rather than one window. It holds no symptom or episode data —
  it answers "what has been tried", nothing else.
- `/reports` lists the medications you took previously under the current ones,
  and points at Settings when a medication has no recorded start.

### Changed
- History you fill in afterwards never counts as a missed dose. It shows the
  dose that applied, but those days were never logged, so they stay out of
  every adherence figure and out of the day view's medication list.

### Fixed
- A report exported while you were looking at a family member's account
  carried **your** name in the header and the file name, not theirs. The
  document a doctor reads now names whose record it is.
