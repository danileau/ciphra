### Fixed
- **ciphra no longer fails to load right after an update.** Opening ciphra
  for the first time after a new version went out could leave you with a
  blank page, because the server turned away part of the app's files as if
  they were too many requests. Those files now have their own, larger
  allowance. The limits that protect sign-in and your data are unchanged.
