# /admin surface audit — pi24-5b

Open-lens dry-run, **2026-05-12.** Persona: Danilo-as-operator (the
only real admin user today; `seed_common.py:106-110` documents the
bootstrap `UPDATE users SET is_admin = TRUE` flip).

## Honest score: 3.85 / 5

Up from a baseline of **3.7** after pi24-5b shipped the today-lens.
This is **not** a 4.7+ surface and should not be sold as one. Admin
is a maintenance tool — no cohort has it as a primary surface
(`blueprint/cohort.ts:67`), and the open-lens rule caps non-primary
surfaces accordingly.

| | Pre-pi24-5b | Post-pi24-5b |
|---|---|---|
| Verdict | "Counters, no signal layer" | "Counters with a today-lens; still no anomaly affordance" |
| Daily-check intent | Probably skip | Worth a 10s glance for today-row |
| Score | 3.7 | 3.85 |

The score lifts modestly because the today-row turns red when
something actually happened today. That's the smallest possible
signal layer. It is **not** anomaly detection, alerting, or
operator workflow.

## Surface inventory (post-pi24-5b)

**Row 1 — footprint + moderation outcomes (5 cards):**
- Total users
- Active users (30d)
- Total documents
- Lockouts (30d) + lockouts today
- Deletions (30d) + deletions today &larr; *new in pi24-5b*

**Row 2 — recent activity (4 cards):**
- Active users (7d)
- New users (7d) + new today &larr; *today sub-line new in pi24-5b*
- Successful logins (30d)
- Failed logins (30d) + failed today &larr; *today sub-line new in pi24-5b*

**User table:** username + admin badge, created, last login, doc count,
status, actions (promote/demote, lock/unlock, delete). Sortable.

**Audit log:** time, username, action (color-badged
SUCCESS/FAILED/ADMIN_*), IP.

**Zero-knowledge reminder** at the bottom.

## What pi24-5b changed

1. `/api/admin/stats` returns 5 new fields: `lockouts_today`,
   `logins_failed_today`, `new_users_today`, `deletions_30d`,
   `deletions_today`. All `INTERVAL '24 hours'`.
2. Stats row 1 expanded 4 &rarr; 5 cards (`lg:grid-cols-5`) to fit
   the new deletions card.
3. Four cards get a `N today` sub-line beneath the main 30d counter.
   The sub-line text turns `var(--danger)` when `> 0`, otherwise
   `var(--text-muted)`. New-users-today stays muted regardless
   (registrations are good news).
4. New i18n keys: `admin.today`, `admin.deletions` across DE/EN/FR/IT.

## What's still missing (backlog, ordered by leverage)

### High leverage — would actually change operator behavior

1. **Anomaly affordance, not just a counter.** Red `15 today` is
   noise unless paired with "your baseline is 0-2/day; this is a
   spike." A rolling 7-day baseline per stat + visual delta would
   convert a number into a signal.
2. **Failed-login grouping in audit log.** A brute-force attempt
   today appears as 30 individual `LOGIN_FAILED` rows. Group by
   `(username, hour)` with a count badge so the pattern reads at
   a glance: `LOGIN_FAILED &times;30 for user "xyz" 14:00-15:00`.
3. **Drop-off detection.** Users with `created_at < NOW() - 30d`
   and `doc_count = 0` are real product-health signal. Add a
   "ghost users" count card or a table filter.

### Medium leverage

4. **`today` granularity is `24h` not `local-midnight`.** Operator
   in CET checking at 09:00 sees the "today" window as "yesterday
   09:00 onward." Acceptable for trend but mislabelled. Either
   relabel to "24h" or anchor to local midnight (server-side TZ
   awareness needed).
5. **Audit log retention.** `/api/admin/audit/retention` endpoint
   exists (`server.py:1590`) — no UI to invoke it. Add a "purge
   audit > 90 days" affordance gated behind a confirmation.
6. **User table search/filter.** Sortable is fine at n &le; 20;
   becomes friction at n &ge; 100. Username substring filter +
   role filter (admin only / locked only) buys runway.

### Low leverage (current scale)

7. Pagination on audit log. It's an `ORDER BY created_at DESC
   LIMIT 100` (default) — fine for a 10-user dev DB; rethink at
   1k+ users.
8. Export to CSV (audit + users). Useful if there's ever a SAR
   (subject access request) — until then, nobody is asking.

## Score rationale

- Operator primary surface? No. Cap applies.
- Functional? Yes — every action works, the table sorts, the
  audit log shows what it should.
- **Insightful?** Marginally. The today-lens is the first
  affordance that says "look at this" rather than "look at the
  numbers."
- **Honest gap:** anomaly detection is the next 4.2&rarr;4.5 step.
  We have it on the backlog, not in this PI.

## Out of scope for pi24-5b

- Anomaly detection (high leverage, backlog item #1).
- Audit-log retention UI (medium, backlog item #5).
- Real test coverage for the admin surface (none today — there
  are no `routes/admin/*.test.ts` files).
