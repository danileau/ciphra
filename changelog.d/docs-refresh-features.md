### Changed
- **The pages that describe ciphra now match what it does.** The landing page
  said the server stores a username, an auth-hash, encrypted blobs and
  timestamps — "that is the entire list" — which stopped being true when
  per-invite sharing added one bit per entry, and imports added a key that
  stops a repeated import duplicating your history. Both are named now, as is
  the audit log. `/docs → Security model` always listed them; the rest of the
  app now says the same thing.
- The feature documentation covers what shipped since: dose history backwards
  in time, the treatment-history export, the before-and-after shading on the
  reports charts, and — for family sharing — that a caregiver sees the
  medication list including the reason a medication was changed or stopped.
