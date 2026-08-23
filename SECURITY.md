# Security Policy

## Reporting a vulnerability

**[Open a private security advisory](https://github.com/danileau/ciphra/security/advisories/new)** — this is the preferred route. It gives us a private thread, keeps your report out of public view until there's a fix, and handles credit and CVE assignment.

No GitHub account, or you'd rather not use one? Email **security@ciphra.ch**.

Either way: **please don't open a public issue** for a suspected vulnerability. ciphra holds people's health data; a public report is a starting pistol.

If you're reporting a problem with a **self-hosted ciphra you don't operate**, report it to whoever runs that instance — every deployment carries a link to its own source in the footer, which is where its operator is reachable. We can only fix what's in this repository.

### What helps

The version or commit you tested, the request or steps that trigger it, and what you expected instead. A proof of concept is welcome but not required — a clear description of the flaw beats a broken exploit. If reproducing it needs an account, say so and we'll arrange one rather than have you test against another user.

## Scope

ciphra is zero-knowledge: health data is encrypted in the browser and the server only ever stores ciphertext. Anything that breaks or weakens that boundary is the most valuable thing you can report:

- The crypto itself — key derivation, the key hierarchy, nonce handling, the recovery-code path.
- Anything that would let the **server** read plaintext, or that leaks plaintext to a third party.
- Authentication and session handling, including the family-sharing grant flow.
- Injection reaching the client (XSS, CSP bypass), because that defeats browser-side encryption directly.
- Access control on the API — one account reaching another's data, even as ciphertext.
- Supply chain: the release pipeline, the signed images, the SRI-pinned Argon2 bundle.

**Out of scope** — these are known, documented, and accepted; a report about them tells us nothing new:

- Decrypted document plaintext cached in IndexedDB while logged in, and the JWT in `localStorage`. Both are deliberate tradeoffs, explained with their blast radius in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md#what-the-browser-stores-and-why).
- Anything requiring physical access to an unlocked device, a compromised browser, or a malicious extension.
- The absence of reproducible frontend builds (the "JS-swap" problem) — a structural limitation of every browser-served E2E app, tracked in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
- Missing headers or TLS-configuration nits with no demonstrated impact, and automated-scanner output without a working scenario.
- Rate limiting on a locally-run instance with `RATELIMIT_ENABLED=0`, and anything reachable only with `CIPHRA_DEV_MOCKS=1`. Those are development switches, off in production.
- Social engineering, physical attacks, and denial of service through sheer volume.

The rest of what is and isn't defended is in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) — read the threat model before deciding something is a bug.

## What to expect

Honestly: ciphra is maintained by one person, mostly outside working hours. We are not going to invent a contractual SLA we can't hold.

- We'll confirm we've seen your report as soon as we can — realistically within a few days, not the same hour. If a week passes with nothing, please nudge; it means it slipped, not that it was ignored.
- We'll tell you whether we consider it a vulnerability, and why.
- Anything that breaks the zero-knowledge boundary gets fixed ahead of everything else, and users get told what happened. That's what [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) is for.
- We'll agree a disclosure timeline with you rather than impose one. Publish whenever you like if we go quiet on you.
- You'll be credited in `CHANGELOG.md` and the advisory unless you'd rather not be.

**There is no bug bounty.** No money, no swag. If that's a dealbreaker, that's fair — say so and don't spend the time.

## Safe harbour

If you're acting in good faith to find and report a vulnerability, we won't pursue or support legal action against you. Stay within it: use your own test accounts, don't access, modify or retain other people's data, don't degrade the service for others, and don't hold data you stumbled across — tell us instead. If you're unsure whether something crosses a line, ask before you do it.

## How to verify our claims yourself

You don't have to take "zero-knowledge" on faith, and you shouldn't. The full step-by-step — inspect the registration request in DevTools, check what's actually in each browser store, verify the running images against our signed build pipeline — is in **[docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md#how-to-verify-our-claims-yourself)**.

The code is the truth; the documentation only tries to describe it accurately. Where they disagree, the code wins and the doc is the bug.

---

Machine-readable version of this policy: [`/.well-known/security.txt`](frontend/static/.well-known/security.txt) ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).
