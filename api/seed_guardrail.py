"""
CIPH-pi20-LB-5 — production guardrail for the demo-seed scripts.

Why this lives in its own (tracked) file:

  - `api/seed_*.py` and `api/seed_common.py` are gitignored by repo
    policy because they ship literal test passwords ("Test$12345_")
    and we don't want them on disk in fresh clones.
  - But the GUARDRAIL itself must be tracked + reviewable + testable
    in a fresh clone, otherwise it's not a real security artifact.
  - So `seed_common.py` (gitignored) imports from this module
    (tracked), giving us a single enforcement point that survives
    git-clone-fresh.

Two checks run inside `assert_demo_seed_allowed(dsn)`:

  1. `CIPHRA_ALLOW_DEMO_SEED=1` must be exported. Explicit operator
     opt-in; the literal string '1' only — 'true' / 'yes' / 'on' do
     NOT count, to keep the gate unambiguous.
  2. `dsn` (typically the active DATABASE_URL) is checked against
     production-looking patterns. Even when opted in, a DSN
     containing 'prod' / 'production' / 'ciphra.ch' is refused.

Test coverage: `api/tests/test_seed_guardrail.py`.
Rationale: FULL_REVIEW 2026-05-05 P1.5.
"""
from __future__ import annotations
import os


_PROD_DSN_PATTERNS: tuple[str, ...] = ("prod", "production", "ciphra.ch")


class DemoSeedRefused(RuntimeError):
    """Raised when assert_demo_seed_allowed() rejects an attempt."""


def assert_demo_seed_allowed(dsn: str) -> None:
    """Two-layer gate. Raises DemoSeedRefused on failure."""
    if os.environ.get("CIPHRA_ALLOW_DEMO_SEED") != "1":
        raise DemoSeedRefused(
            "Demo seeding is disabled by default. To enable for a local "
            "dev database, export CIPHRA_ALLOW_DEMO_SEED=1. These scripts "
            "create users with the literal password 'Test$12345_' — never "
            "run them against real user data."
        )
    lower = dsn.lower()
    for pat in _PROD_DSN_PATTERNS:
        if pat in lower:
            raise DemoSeedRefused(
                f"Refusing to seed: DATABASE_URL contains production-looking "
                f"pattern '{pat}'. Seed scripts ship with literal test "
                f"passwords and would create exploitable accounts on prod. "
                f"If this DSN is genuinely a dev sandbox, rename it to "
                f"avoid the pattern."
            )
