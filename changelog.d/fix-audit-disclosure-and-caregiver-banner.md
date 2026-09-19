### Fixed
- **The privacy policy now describes the whole audit log.** It said the server
  logs authentication events; it also records every time a document is
  created, changed or deleted, along with family-sharing and admin actions.
  The page says so, and adds the one category it was missing: the bookkeeping
  about your account and your invitations — including that the name you give
  an invitation is stored as plain text. What the log has never held is what
  you wrote.
- **A family member now sees how much is being kept back from them.** The line
  under the "you are viewing someone's record" banner has counted zero since
  per-invite sharing scopes arrived, because it counted private entries the
  server no longer sends. It now uses the number the server withholds, and
  both halves of the sentence read correctly for a single entry.
