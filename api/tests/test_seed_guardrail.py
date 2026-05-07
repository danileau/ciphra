"""
CIPH-pi20-LB-5 — demo-seed production guardrail.

Pinning the two-check contract on _assert_demo_seed_allowed():
  1. CIPHRA_ALLOW_DEMO_SEED=1 must be set.
  2. The DSN must not contain production-looking patterns.

Both layers are required even if one would alone be sufficient — the
env var is the explicit operator opt-in, the DSN sniff is the
defense-in-depth against a dev who exports the env var and forgets to
re-point DATABASE_URL.
"""
import os
import sys

import pytest

# Ensure api/ is importable.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from seed_common import _assert_demo_seed_allowed, DemoSeedRefused  # noqa: E402


@pytest.fixture(autouse=True)
def restore_env(monkeypatch):
    """Each test starts with no opt-in; tests can set it explicitly."""
    monkeypatch.delenv("CIPHRA_ALLOW_DEMO_SEED", raising=False)


def test_refuses_without_env_var():
    with pytest.raises(DemoSeedRefused, match="CIPHRA_ALLOW_DEMO_SEED"):
        _assert_demo_seed_allowed("postgresql://ciphra:ciphra@localhost/ciphra_dev")


def test_refuses_when_env_var_is_zero(monkeypatch):
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "0")
    with pytest.raises(DemoSeedRefused):
        _assert_demo_seed_allowed("postgresql://ciphra:ciphra@localhost/ciphra_dev")


def test_refuses_when_env_var_is_other_truthy(monkeypatch):
    """Only literal '1' opts in. 'true' / 'yes' / 'on' do NOT — keeps the
    gate unambiguous and prevents accidental opt-in via shell variable."""
    for val in ("true", "yes", "on", "TRUE", "True"):
        monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", val)
        with pytest.raises(DemoSeedRefused):
            _assert_demo_seed_allowed("postgresql://ciphra:ciphra@localhost/ciphra_dev")


def test_allows_when_env_set_and_dsn_dev(monkeypatch):
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "1")
    # Should not raise.
    _assert_demo_seed_allowed("postgresql://ciphra:ciphra@localhost/ciphra_dev")
    _assert_demo_seed_allowed("postgresql://ciphra:ciphra@localhost:5433/ciphra")
    _assert_demo_seed_allowed("postgresql://ciphra:ciphra@postgres/ciphra")


def test_refuses_dsn_with_prod_substring(monkeypatch):
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "1")
    for dsn in (
        "postgresql://ciphra:pwd@db.production.example/ciphra",
        "postgresql://ciphra:pwd@prod-host/ciphra",
        "postgresql://ciphra:pwd@host/ciphra_prod",
        "postgresql://prod_user:pwd@host/ciphra",
    ):
        with pytest.raises(DemoSeedRefused, match="prod"):
            _assert_demo_seed_allowed(dsn)


def test_refuses_dsn_with_production_substring(monkeypatch):
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "1")
    with pytest.raises(DemoSeedRefused, match="prod"):
        _assert_demo_seed_allowed("postgresql://ciphra:pwd@host/ciphra_production")


def test_refuses_dsn_pointing_at_ciphra_ch(monkeypatch):
    """ciphra.ch is the live deployment host. Refuse even if env var
    is set — this is the case where someone's env var is left over from
    earlier work and they switch DSN without thinking."""
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "1")
    with pytest.raises(DemoSeedRefused, match="ciphra\\.ch"):
        _assert_demo_seed_allowed("postgresql://ciphra:pwd@db.ciphra.ch/ciphra")


def test_pattern_check_is_case_insensitive(monkeypatch):
    """Capitalisation variants must still trip the gate — operators
    sometimes write env files in mixed case."""
    monkeypatch.setenv("CIPHRA_ALLOW_DEMO_SEED", "1")
    for dsn in (
        "postgresql://ciphra:pwd@PROD-host/ciphra",
        "postgresql://ciphra:pwd@db.PRODUCTION.example/ciphra",
        "postgresql://ciphra:pwd@db.Ciphra.CH/ciphra",
    ):
        with pytest.raises(DemoSeedRefused):
            _assert_demo_seed_allowed(dsn)
