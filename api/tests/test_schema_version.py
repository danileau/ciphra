"""
Schema ledger — the migration runner and the boot-time compatibility check.

The behaviour that matters most here is the one that is easy to get backwards:
an older image meeting a NEWER database must keep running when every migration
between them is additive. ciphra's deploy rolls back on its own when a health
check fails, so the rollback target boots against the schema the failed release
already applied. A blanket "refuse on mismatch" would turn that safety net into
an outage.

Refusal is reserved for a migration that declares itself incompatible.
"""
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from server import (  # noqa: E402
    MIGRATIONS,
    SCHEMA_VERSION,
    SchemaTooNewError,
    _apply_migrations,
)


class FakeCursor:
    """Records SQL and answers the one SELECT the runner makes."""

    def __init__(self, version=0, min_app_schema=0):
        self.meta = {'version': version, 'min_app_schema': min_app_schema}
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((' '.join(sql.split()), params))
        if params and sql.strip().upper().startswith('UPDATE SCHEMA_META'):
            self.meta = {'version': params[0], 'min_app_schema': params[1]}

    def fetchone(self):
        return dict(self.meta)

    def applied_numbers(self):
        return [p[0] for sql, p in self.executed if p and sql.startswith('UPDATE schema_meta')]


class TestLedger:
    def test_numbers_are_unique_and_contiguous(self):
        numbers = [m[0] for m in MIGRATIONS]
        assert numbers == sorted(numbers), 'migrations must be in order'
        assert len(set(numbers)) == len(numbers), 'duplicate migration number'
        assert numbers == list(range(1, len(numbers) + 1)), 'gap in the migration numbers'

    def test_schema_version_matches_the_last_migration(self):
        # The constant is what the image advertises; drift between the two is
        # how a database gets stamped with a version it does not have.
        assert SCHEMA_VERSION == MIGRATIONS[-1][0]

    def test_every_statement_is_idempotent(self):
        # Databases that predate the ledger record 0 while already carrying
        # every column, so the first run after this ships replays all of them.
        for number, name, sql, _compatible in MIGRATIONS:
            assert 'IF NOT EXISTS' in sql.upper(), (
                f'migration {number} ({name}) is not idempotent; it will fail '
                f'on a database that predates the ledger'
            )


class TestApply:
    def test_fresh_database_gets_every_migration(self):
        cur = FakeCursor(version=0)
        assert _apply_migrations(cur) == SCHEMA_VERSION
        assert cur.applied_numbers() == [m[0] for m in MIGRATIONS]

    def test_up_to_date_database_applies_nothing(self):
        cur = FakeCursor(version=SCHEMA_VERSION)
        assert _apply_migrations(cur) == SCHEMA_VERSION
        assert cur.applied_numbers() == []

    def test_partially_migrated_database_resumes(self):
        cur = FakeCursor(version=5)
        assert _apply_migrations(cur) == SCHEMA_VERSION
        assert cur.applied_numbers() == [6, 7, 8]

    def test_older_image_on_a_newer_additive_database_still_runs(self):
        # The rollback case. Nothing is applied, nothing is downgraded, and
        # the server comes up.
        cur = FakeCursor(version=SCHEMA_VERSION + 3, min_app_schema=0)
        assert _apply_migrations(cur) == SCHEMA_VERSION + 3
        assert cur.applied_numbers() == []

    def test_older_image_refuses_a_database_that_declared_incompatibility(self):
        cur = FakeCursor(version=SCHEMA_VERSION + 1, min_app_schema=SCHEMA_VERSION + 1)
        with pytest.raises(SchemaTooNewError) as exc:
            _apply_migrations(cur)
        # The message has to tell the operator what to do, not just what broke.
        assert 'roll forward' in str(exc.value)

    def test_an_incompatible_migration_raises_the_floor(self):
        cur = FakeCursor(version=0)
        original = list(MIGRATIONS)
        MIGRATIONS.append((SCHEMA_VERSION + 1, 'test.breaking', 'SELECT 1', False))
        try:
            _apply_migrations(cur)
            assert cur.meta['min_app_schema'] == SCHEMA_VERSION + 1
        finally:
            MIGRATIONS[:] = original

    def test_a_compatible_migration_leaves_the_floor_alone(self):
        cur = FakeCursor(version=0)
        _apply_migrations(cur)
        assert cur.meta['min_app_schema'] == 0
