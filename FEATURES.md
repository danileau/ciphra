# ciphra — Feature List & Roadmap

## UX Rework: Dual-Mode Tracking ✅

### Concept
Two tracking modes based on user intent, selected during setup and switchable in settings.
Both modes write the same underlying encrypted documents — reports work regardless of input method.

### Mode 1: Protokoll (Reflective / Daily Review) ✅
- End-of-day structured review: "How was your day?"
- Current protocol grid reframed as the primary daily input
- Home screen shows today's status + "Tag ausfüllen" CTA
- Calendar view as navigation into past days

### Mode 2: Legacy (Reactive / Quick Capture) ✅
- Log a specific event as it happens: "something just happened"
- Floating action button → quick-add bottom sheet → done in 10 seconds
- Auto-timestamps, episode type selection from blueprint
- Recent events list on home screen

### Home Screen ✅
- Adapts to selected mode (Companion.svelte)
- Protokoll: today's status card + CTA, streak, charts
- Legacy: recent events, FAB with quick-add sheet, streak, charts

### Reports (Both Modes) ✅
- **Analytics PDF**: summary stats, episode trend bar chart, symptom frequency, medication adherence
- **Grid PDF**: detailed day-by-day protocol table with sums and percentages
- Dropdown selector on protocol page to choose report type

---

## Critical for Launch

- [x] **Test suite** — 45 pytest API tests + vitest frontend tests (crypto, blueprints, documents)
- [ ] **Browser E2E crypto verification** — test Argon2 WASM in Chrome/Firefox/Safari
- [x] **Change password endpoint** — POST /api/change-password, re-encrypts vault with new key
- [x] **Delete account endpoint** — POST /api/delete-account, GDPR self-service with password confirmation
- [x] **Rate limiting** — flask-limiter on login (10/min), register (5/min), recover (5/min), change-password (5/min), delete-account (3/min)

## Product Quality

- [ ] **Component decomposition** — split +page.svelte (33KB), setup (24KB), protocol (22KB)
- [ ] **Responsive / mobile testing** — real device testing for PWA
- [x] **Client-side input validation** — login/register forms with on:blur validation
- [x] **Loading / error states** — loading bar in layout, skeleton in companion, error banner with retry, document store error tracking
- [ ] **Landing page polish** — screenshots, interactive demo, conversion-focused

## Future Roadmap

- [ ] Caregiver accounts (shared access, limited permissions)
- [ ] 2FA (TOTP or WebAuthn)
- [ ] Shareable doctor reports (time-limited links)
- [ ] epilepc migration tool
- [ ] Native mobile wrappers (Capacitor / TWA)
- [ ] API versioning (/api/v1/*)
- [ ] Offline-first sync strategy (conflict resolution)
- [ ] Blueprint validation (structural correctness checks)
