"""
INC-001 — the bulk-import ON CONFLICT clause must match its partial index.

`uq_docs_user_clientkey` is a PARTIAL unique index (`WHERE client_key IS NOT
NULL`). PostgreSQL will only infer a partial index for `ON CONFLICT` when the
statement repeats that predicate. Without it every call raises:

    InvalidColumnReference: there is no unique or exclusion constraint
    matching the ON CONFLICT specification

...which the endpoint turned into a 500, which made the client fall back to one
request per document, which then hit nginx's rate limit. A real migration
needed four attempts and showed three errors before the data was in.

Why the existing batch tests missed it: `test_batch_creates_each_doc` and
`test_batch_skips_on_conflict` both run against `mock_db`. The bug lived
precisely in the layer that was mocked away — the SQL never reached a
PostgreSQL planner, so an unsatisfiable ON CONFLICT looked fine.

Two guards here:

  1. A static invariant that always runs, including in CI (which has no
     database): if the index is partial, every ON CONFLICT against those
     columns must carry the same predicate.
  2. A real round-trip against PostgreSQL, skipped when none is reachable.
     This is the one that reproduces the actual failure.
"""
import os
import re
from pathlib import Path

import pytest

SERVER_PY = Path(__file__).resolve().parents[1] / 'server.py'


def _source() -> str:
    return SERVER_PY.read_text()


def test_on_conflict_repeats_the_partial_index_predicate():
    """A partial unique index needs its predicate in the ON CONFLICT clause."""
    src = _source()

    index = re.search(
        r'CREATE UNIQUE INDEX[^;]*?ON\s+encrypted_documents\s*\(([^)]*)\)\s*WHERE\s+([^\s"\']+[^"\']*?)\s*"""',
        src,
        re.IGNORECASE | re.DOTALL,
    )
    assert index, 'could not find the partial unique index on encrypted_documents'
    predicate = ' '.join(index.group(2).split())

    conflicts = re.findall(
        r'ON CONFLICT\s*\(([^)]*)\)([^;]*?)DO NOTHING',
        src,
        re.IGNORECASE | re.DOTALL,
    )
    assert conflicts, 'no ON CONFLICT ... DO NOTHING found — did the batch endpoint move?'

    for columns, tail in conflicts:
        if 'client_key' not in columns:
            continue
        normalised = ' '.join(tail.split())
        assert predicate.lower() in normalised.lower(), (
            'ON CONFLICT ({}) does not repeat the partial index predicate "{}".\n'
            'PostgreSQL cannot infer a partial index without it and will raise\n'
            'InvalidColumnReference at runtime. This is INC-001.'.format(
                columns.strip(), predicate
            )
        )


@pytest.mark.skipif(
    not os.environ.get('DATABASE_URL'),
    reason='needs a real PostgreSQL; CI has none',
)
def test_batch_insert_is_idempotent_against_real_postgres():
    """The statement the endpoint actually runs, against a real planner."""
    import psycopg2

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TEMP TABLE inc001_docs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    encrypted_data TEXT NOT NULL,
                    client_key TEXT
                ) ON COMMIT DROP
            """)
            cur.execute("""
                CREATE UNIQUE INDEX inc001_uq ON inc001_docs (user_id, client_key)
                WHERE client_key IS NOT NULL
            """)

            stmt = """
                INSERT INTO inc001_docs (user_id, encrypted_data, client_key)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL
                DO NOTHING
                RETURNING id
            """
            cur.execute(stmt, (1, 'cipher', 'v1:abc'))
            assert cur.fetchone() is not None, 'first insert should create a row'

            # The replay a resumed migration performs.
            cur.execute(stmt, (1, 'cipher-again', 'v1:abc'))
            assert cur.fetchone() is None, 'replayed client_key must be skipped'

            # NULL client_key (every normal single-doc save) must never collide.
            for _ in range(3):
                cur.execute(stmt, (1, 'plain', None))
                assert cur.fetchone() is not None, 'NULL client_key must always insert'

            cur.execute('SELECT COUNT(*) FROM inc001_docs')
            assert cur.fetchone()[0] == 4
    finally:
        conn.rollback()
        conn.close()
