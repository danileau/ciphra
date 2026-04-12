"""
Shared fixtures for ciphra API tests.

Patches psycopg2.connect so no real database is needed, and provides
a Flask test client plus a valid JWT token for authenticated requests.
"""

import sys
import os
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest

# Ensure api/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ---------------------------------------------------------------------------
# Database mock helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """A cursor mock that returns pre-configured rows via a side_effect map."""

    def __init__(self):
        self._results = []  # stack of fetchone / fetchall results
        self.executed = []  # record of (sql, params) for assertions

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        if self._results:
            return self._results.pop(0)
        return None

    def fetchall(self):
        if self._results:
            return self._results.pop(0)
        return []

    def queue(self, *rows):
        """Queue one or more return values for successive fetchone/fetchall calls."""
        self._results.extend(rows)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class MockConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, *args, **kwargs):
        return self._cursor

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db():
    """Provide a MockCursor whose results can be pre-loaded per test."""
    return MockCursor()


@pytest.fixture
def client(mock_db):
    """
    Flask test client with psycopg2 + e2e mocked out.
    The mock_db cursor is available for queuing return values.
    """
    mock_conn = MockConnection(mock_db)

    with patch('psycopg2.connect', return_value=mock_conn):
        # Import server *after* patching psycopg2 so module-level calls are safe
        import server
        server.app.config['TESTING'] = True
        with server.app.test_client() as c:
            yield c


@pytest.fixture
def auth_token():
    """Return a valid JWT token for user_id=1, username='testuser', non-admin."""
    import server
    return server.generate_token(1, 'testuser', is_admin=False)


@pytest.fixture
def admin_token():
    """Return a valid JWT token for user_id=99, username='admin', is_admin=True."""
    import server
    return server.generate_token(99, 'admin', is_admin=True)
