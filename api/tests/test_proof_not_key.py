"""Proof, not key (schema 10, 2026-11-12).

/recover used to receive the raw recovery_key and /family/grants/claim the raw
family_key. Each of those keys unwraps a copy of the master key that this
server stores (recovery_vault, wrapped_master), so anyone who saw the request
could decrypt the account. Now:

    proof    = SHA-256(key)      sent by the client
    verifier = SHA-256(proof)    stored by the server

Old cached clients still send the raw key (legacy fields), and old clients that
create a vault or grant send SHA-256(key), which IS the proof and must never be
stored as is.
"""
import base64
import hashlib
import os
import secrets

import pytest

VALID_KEY = base64.b64encode(b'\x01' * 32).decode()


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode('ascii')


def sha(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


@pytest.fixture
def chain():
    key = secrets.token_bytes(32)
    proof = sha(key)
    return {'key': b64(key), 'proof': b64(proof), 'verifier': b64(sha(proof)),
            'legacy_auth': b64(proof)}


class TestVerifyProof:
    def test_the_proof_passes(self, client, chain):
        import server
        assert server.verify_proof(chain['proof'], None, chain['verifier'])

    def test_an_old_client_sending_the_raw_key_still_passes(self, client, chain):
        import server
        assert server.verify_proof(None, chain['key'], chain['verifier'])

    def test_the_raw_key_in_the_proof_field_fails(self, client, chain):
        # SHA-256(key) != SHA-256(SHA-256(key)): a key is not a proof.
        import server
        assert not server.verify_proof(chain['key'], None, chain['verifier'])

    def test_the_stored_verifier_is_not_a_proof(self, client, chain):
        # A database leak hands out verifiers; they must not authenticate.
        import server
        assert not server.verify_proof(chain['verifier'], None, chain['verifier'])
        assert not server.verify_proof(None, chain['verifier'], chain['verifier'])

    def test_nothing_presented_fails(self, client, chain):
        import server
        assert not server.verify_proof(None, None, chain['verifier'])
        assert not server.verify_proof(chain['proof'], None, None)


class TestVerifierFrom:
    def test_a_current_client_verifier_is_stored_as_is(self, client, chain):
        import server
        assert server.verifier_from(chain['verifier'], None) == chain['verifier']

    def test_an_old_client_auth_is_hashed_once_more(self, client, chain):
        # The old `*_auth` value is SHA-256(key) - the proof. Storing it as is
        # would make a database leak a working credential.
        import server
        assert server.verifier_from(None, chain['legacy_auth']) == chain['verifier']


class TestEndpointsStoreVerifiers:
    def test_register_with_legacy_recovery_auth_stores_the_verifier(self, client, mock_db, chain):
        mock_db.queue(None, {'id': 1})
        resp = client.post('/api/register', json={
            'username': 'alice', 'auth_hash': VALID_KEY, 'auth_params': 'ap',
            'vault_params': 'vp', 'encrypted_master': 'em',
            'recovery_vault': 'rv', 'recovery_params': 'rp',
            'recovery_auth': chain['legacy_auth'],
        })
        assert resp.status_code == 201
        sql, params = next((s, p) for s, p in mock_db.executed if 'INSERT INTO users' in s)
        assert 'recovery_verifier' in sql and 'recovery_auth' not in sql
        assert chain['verifier'] in params
        assert chain['legacy_auth'] not in params

    def test_register_with_a_verifier_stores_it(self, client, mock_db, chain):
        mock_db.queue(None, {'id': 1})
        resp = client.post('/api/register', json={
            'username': 'alice', 'auth_hash': VALID_KEY, 'auth_params': 'ap',
            'vault_params': 'vp', 'encrypted_master': 'em',
            'recovery_vault': 'rv', 'recovery_params': 'rp',
            'recovery_verifier': chain['verifier'],
        })
        assert resp.status_code == 201
        _, params = next((s, p) for s, p in mock_db.executed if 'INSERT INTO users' in s)
        assert chain['verifier'] in params

    def test_grant_create_with_legacy_grant_auth_stores_the_verifier(
            self, client, mock_db, auth_token, chain):
        from datetime import datetime, timezone
        auth_row = {'password_version': 1, 'is_admin': False}
        mock_db.queue(auth_row, {'id': 3, 'created_at': datetime.now(timezone.utc)})
        resp = client.post('/api/family/grants',
                           headers={'Authorization': f'Bearer {auth_token}'},
                           json={'label': 'Mum', 'grant_params': 'p',
                                 'grant_auth': chain['legacy_auth'], 'wrapped_master': 'w'})
        assert resp.status_code == 201, resp.get_json()
        sql, params = next((s, p) for s, p in mock_db.executed if 'INSERT INTO family_grants' in s)
        assert 'grant_verifier' in sql
        assert chain['verifier'] in params
        assert chain['legacy_auth'] not in params


class TestMigration10:
    def _m(self):
        import server
        m = [x for x in server.MIGRATIONS if x[0] == 10]
        assert m, 'migration 10 is missing'
        return m[0]

    def test_recorded_and_bootable_by_an_older_image(self, client):
        import server
        _, _, sql, compatible = self._m()
        assert compatible is True
        assert server.SCHEMA_VERSION >= 10

    def test_clears_the_old_columns_and_only_converts_once(self, client):
        _, _, sql, _ = self._m()
        # Old value = SHA-256(key) = the new proof. Leaving it is a credential.
        assert 'recovery_auth = NULL' in sql and 'grant_auth = NULL' in sql
        # A ledger replay must not hash twice.
        assert 'recovery_verifier IS NULL' in sql and 'grant_verifier IS NULL' in sql


@pytest.mark.skipif(
    not os.environ.get('DATABASE_URL'),
    reason='needs a real PostgreSQL',
)
def test_migration_sql_matches_python_hashing_against_real_postgres(chain):
    """The SQL conversion must produce exactly what verify_proof expects."""
    import psycopg2
    import server

    sql = [x for x in server.MIGRATIONS if x[0] == 10][0][2]
    sql = sql.replace(' users ', ' pnk_users ').replace(' family_grants ', ' pnk_grants ')
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE pnk_users (id INT, recovery_auth TEXT) ON COMMIT DROP")
            cur.execute("CREATE TEMP TABLE pnk_grants (id INT, grant_auth TEXT NOT NULL) ON COMMIT DROP")
            cur.execute("INSERT INTO pnk_users VALUES (1, %s), (2, NULL)", (chain['legacy_auth'],))
            cur.execute("INSERT INTO pnk_grants VALUES (1, %s)", (chain['legacy_auth'],))
            cur.execute(sql)
            cur.execute(sql)  # replay: must be a no-op
            cur.execute("SELECT recovery_auth, recovery_verifier FROM pnk_users ORDER BY id")
            rows = cur.fetchall()
            assert rows[0] == (None, chain['verifier'])
            assert rows[1] == (None, None)
            cur.execute("SELECT grant_auth, grant_verifier FROM pnk_grants")
            assert cur.fetchall() == [(None, chain['verifier'])]
            assert server.verify_proof(chain['proof'], None, rows[0][1])
    finally:
        conn.rollback()
        conn.close()


class TestFieldPrecedence:
    def test_proof_wins_over_a_legacy_key(self, client, chain):
        # Both present: the proof decides, so a wrong legacy value can't help
        # and a right one can't override a wrong proof.
        import server
        assert server.verify_proof(chain['proof'], 'garbage', chain['verifier'])
        assert not server.verify_proof(b64(b'\0' * 32), chain['key'], chain['verifier'])

    def test_a_json_null_proof_falls_back_to_the_legacy_field_only(self, client, chain):
        import server
        assert server.verify_proof(None, chain['key'], chain['verifier'])
        assert not server.verify_proof(None, chain['proof'], chain['verifier'])

    def test_recover_rejects_a_null_proof_without_a_legacy_key(self, client, mock_db):
        resp = client.post('/api/recover', json={
            'username': 'alice', 'recovery_proof': None, 'auth_hash': VALID_KEY,
            'auth_params': 'ap', 'vault_params': 'vp', 'encrypted_master': 'em',
        })
        assert resp.status_code == 401
        assert mock_db.executed == []


class TestBootConversion:
    def test_init_db_reruns_the_conversion_every_boot(self, client):
        # A rollback lets an older image write recovery_auth / grant_auth after
        # migration 10 ran; the ledger will not run it again on roll-forward.
        import inspect
        import server
        src = inspect.getsource(server.init_db)
        assert '_PROOF_NOT_KEY_CONVERSION' in src
        assert 'IS NULL' in server._PROOF_NOT_KEY_CONVERSION  # idempotent
