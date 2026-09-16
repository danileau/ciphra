"""
API hardening pass, 2026-09 — one class per finding.

Each of these was a verified bug on main, not a hypothetical:

  1. truthy non-strings (`{"username": 123}`) reached `.strip()` or SQL → 500s,
     some of them pre-auth, and one bad item could abort a whole batch;
  2. `share_mask: true` passed validation, because `True in (1, 3)`;
  3. a token's authority came from its claims and a lookup that failed open:
     deleted users and demoted admins kept access, and a DB error let every
     token through;
  4. the admin lock was cleared by the next correct login or recovery;
  5. failed-attempt counting was read-then-write, and never restarted after a
     lock expired;
  6. decoy grants had negative ids, and claim answered 404 for them;
  7. a family claim could be taken over by a concurrent claimer, and a
     caregiver holding two grants got whichever scope the planner picked;
  8. deleting a caregiver put their grant back up for claiming;
  9. audit rows named deleted users, and admin stats undercounted;
 10. retention only ran at boot, mangled IPv6, and reported success blind;
 11. two concurrent registrations of one name → 500 for the loser.

Most assertions run against MockCursor. The SQL whose semantics carry the fix
(the atomic counters) also runs against a real PostgreSQL at the bottom,
skipped when none is configured — same pattern as test_batch_on_conflict.py.
"""
import base64
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import psycopg2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

VALID_KEY = base64.b64encode(b'\x00' * 32).decode('ascii')
AUTH_ROW = {'password_version': 1, 'is_admin': False}
ADMIN_ROW = {'password_version': 1, 'is_admin': True}


def _sql(mock_db):
    return [' '.join(sql.split()) for sql, _ in mock_db.executed]


def _audits(mock_db):
    return [params[1] for sql, params in mock_db.executed
            if sql.strip().startswith('INSERT INTO audit_log')]


def _bearer(token):
    return {'Authorization': f'Bearer {token}'}


def _user_row(**overrides):
    row = {
        'id': 1, 'auth_hash': 'h', 'auth_params': 'ap', 'vault_params': 'vp',
        'encrypted_master': 'em', 'login_attempts': 0, 'locked_until': None,
        'is_admin': False, 'password_version': 1, 'registration_source': 'web',
    }
    row.update(overrides)
    return row


def _recovery_row(**overrides):
    row = {'id': 1, 'recovery_auth': 'h', 'recovery_attempts': 0, 'locked_until': None}
    row.update(overrides)
    return row


RECOVER_BODY = {
    'username': 'alice', 'recovery_key': VALID_KEY, 'auth_hash': VALID_KEY,
    'auth_params': 'ap', 'vault_params': 'vp', 'encrypted_master': 'em',
}


# ═══════════════════════════════════════════════════════════════════
# 1 — type confusion
# ═══════════════════════════════════════════════════════════════════

class TestTypeConfusion:
    @pytest.mark.parametrize('path', [
        '/api/register', '/api/login/init', '/api/login',
        '/api/recover/init', '/api/recover',
    ])
    @pytest.mark.parametrize('bad', [123, [1], {'a': 1}, True])
    def test_non_string_username_is_400_not_500(self, client, mock_db, path, bad):
        body = dict(RECOVER_BODY, username=bad, auth_key=VALID_KEY)
        resp = client.post(path, json=body)
        assert resp.status_code == 400, f'{path} username={bad!r} → {resp.status_code}'
        assert resp.is_json
        assert mock_db.executed == [], 'the bad value must be refused before any SQL'

    @pytest.mark.parametrize('field', ['label'])
    def test_non_string_label_is_400(self, client, mock_db, auth_token, field):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/grants', headers=_bearer(auth_token), json={
            'label': 42, 'grant_params': 'p', 'grant_auth': VALID_KEY, 'wrapped_master': 'w',
        })
        assert resp.status_code == 400

    def test_non_string_source_username_is_400(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/grants/claim/init', headers=_bearer(auth_token),
                           json={'source_username': ['alice']})
        assert resp.status_code == 400

    @pytest.mark.parametrize('bad', [{'a': 1}, [1, 2], 'ab\x00cd'])
    def test_store_document_refuses_what_text_cannot_hold(self, client, mock_db, auth_token, bad):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/documents', headers=_bearer(auth_token),
                           json={'encrypted_data': bad})
        assert resp.status_code == 400

    def test_update_document_refuses_a_dict(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW)
        resp = client.put('/api/documents/5', headers=_bearer(auth_token),
                          json={'encrypted_data': {'a': 1}})
        assert resp.status_code == 400

    def test_register_refuses_a_non_string_recovery_blob(self, client, mock_db):
        resp = client.post('/api/register', json={
            'username': 'alice', 'auth_hash': VALID_KEY, 'auth_params': 'ap',
            'vault_params': 'vp', 'encrypted_master': 'em',
            'recovery_vault': {'a': 1}, 'recovery_params': 'rp', 'recovery_auth': VALID_KEY,
        })
        assert resp.status_code == 400
        assert mock_db.executed == []

    def test_register_does_not_pass_falsy_junk_to_sql(self, client, mock_db):
        mock_db.queue(None, {'id': 1})
        resp = client.post('/api/register', json={
            'username': 'alice', 'auth_hash': VALID_KEY, 'auth_params': 'ap',
            'vault_params': 'vp', 'encrypted_master': 'em',
            'recovery_vault': [], 'recovery_params': {}, 'recovery_auth': 0,
        })
        assert resp.status_code == 201
        insert = next(p for s, p in mock_db.executed if 'INSERT INTO users' in s)
        assert insert[5:8] == (None, None, None)

    def test_one_bad_batch_item_never_fails_the_batch(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'n': 0}, {'id': 7})
        resp = client.post('/api/documents/batch', headers=_bearer(auth_token), json={'documents': [
            {'client_key': {'x': 1}, 'encrypted_data': 'e'},
            {'client_key': 'v1:' + 'a' * 300, 'encrypted_data': 'e'},
            {'client_key': 'v1:dict', 'encrypted_data': {'x': 1}},
            {'client_key': 'v1:nul', 'encrypted_data': 'a\x00b'},
            'not-an-object',
            {'client_key': 'v1:ok', 'encrypted_data': 'enc'},
        ]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert [r['status'] for r in data['results']] == \
            ['error', 'error', 'error', 'error', 'error', 'created']
        assert data['created'] == 1 and data['errored'] == 5
        inserts = [p for s, p in mock_db.executed if 'INSERT INTO encrypted_documents' in s]
        assert len(inserts) == 1 and inserts[0][1:3] == ('enc', 'v1:ok'), \
            'only the valid item may reach SQL'

    def test_claim_refuses_a_boolean_grant_id(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/grants/claim', headers=_bearer(auth_token),
                           json={'grant_id': True, 'proof': VALID_KEY})
        assert resp.status_code == 400

    @pytest.mark.parametrize('bad', [True, 1.9, 1e400, [1]])
    def test_family_create_does_not_coerce_the_patient_id(self, client, mock_db, auth_token, bad):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/documents', headers=_bearer(auth_token),
                           data=json.dumps({'source_user_id': bad, 'encrypted_data': 'e'})
                           .replace('Infinity', '1e400'),
                           content_type='application/json')
        assert resp.status_code == 403
        assert not any('family_grants' in s for s in _sql(mock_db)), \
            'a coerced id must not reach the grant lookup'

    def test_family_update_refuses_a_non_string_blob(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'id': 3, 'share_mask': 1})
        resp = client.put('/api/family/documents/5', headers=_bearer(auth_token),
                          json={'source_user_id': 2, 'encrypted_data': ['x']})
        assert resp.status_code == 400

    @pytest.mark.parametrize('raw,expected', [
        (5, 5), ('5', 5), (' 7 ', 7), (0, 0),
        (True, None), (False, None), (1.0, None), (1.9, None),
        ('1.5', None), ('x', None), ('', None), (None, None), ([1], None),
    ])
    def test_as_int(self, raw, expected):
        import server
        assert server._as_int(raw) == expected

    @pytest.mark.parametrize('raw', [True, 1.0, 2.0])
    def test_share_class_refuses_bool_and_float(self, raw):
        import server
        assert server._share_class({'share_class': raw}) is None


# ═══════════════════════════════════════════════════════════════════
# 2 — share_mask booleans
# ═══════════════════════════════════════════════════════════════════

class TestShareMaskIsStrict:
    @pytest.mark.parametrize('bad', [True, 1.0, 3.0, '1'])
    def test_create_refuses_non_int_masks(self, client, mock_db, auth_token, bad):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/grants', headers=_bearer(auth_token), json={
            'label': 'Mum', 'grant_params': 'p', 'grant_auth': VALID_KEY,
            'wrapped_master': 'w', 'share_mask': bad,
        })
        assert resp.status_code == 400
        assert not any('INSERT INTO family_grants' in s for s in _sql(mock_db))

    @pytest.mark.parametrize('bad', [True, 3.0])
    def test_rescope_refuses_non_int_masks(self, client, mock_db, auth_token, bad):
        mock_db.queue(AUTH_ROW)
        resp = client.post('/api/family/grants/1/scope', headers=_bearer(auth_token),
                           json={'share_mask': bad})
        assert resp.status_code == 400

    @pytest.mark.parametrize('good', [1, 3])
    def test_the_real_masks_still_pass(self, good):
        import server
        assert server._valid_share_mask(good)


# ═══════════════════════════════════════════════════════════════════
# 3 — token authority comes from the database
# ═══════════════════════════════════════════════════════════════════

class TestTokenAuthority:
    def test_a_deleted_users_token_is_refused(self, client, mock_db, auth_token):
        mock_db.queue(None)  # no users row
        resp = client.get('/api/documents', headers=_bearer(auth_token))
        assert resp.status_code == 401

    def test_a_db_error_fails_closed_with_503(self, client, mock_db, auth_token):
        with patch.object(mock_db, 'execute', side_effect=psycopg2.OperationalError('db down')):
            resp = client.get('/api/documents', headers=_bearer(auth_token))
        # 503, not 401: a 401 would log every open session out during a blip.
        assert resp.status_code == 503
        assert resp.get_json() == {'error': 'service_unavailable'}

    def test_a_db_error_fails_closed_on_admin_routes_too(self, client, mock_db, admin_token):
        with patch.object(mock_db, 'execute', side_effect=psycopg2.OperationalError('db down')):
            resp = client.get('/api/admin/users', headers=_bearer(admin_token))
        assert resp.status_code == 503

    def test_a_demoted_admin_loses_admin_routes_at_once(self, client, mock_db, admin_token):
        # The token still says is_admin=True; the database no longer does.
        mock_db.queue(AUTH_ROW)
        resp = client.get('/api/admin/users', headers=_bearer(admin_token))
        assert resp.status_code == 403

    def test_admin_status_is_read_from_the_db_not_the_claim(self, client, mock_db, auth_token):
        mock_db.queue(ADMIN_ROW, [])  # promoted after this token was issued
        resp = client.get('/api/admin/users', headers=_bearer(auth_token))
        assert resp.status_code == 200

    def test_a_stale_password_version_is_refused(self, client, mock_db, auth_token):
        mock_db.queue({'password_version': 2, 'is_admin': False})
        resp = client.get('/api/documents', headers=_bearer(auth_token))
        assert resp.status_code == 401

    def test_nothing_server_side_reads_the_is_admin_claim(self):
        import inspect
        import server
        assert "payload.get('is_admin'" not in inspect.getsource(server)


# ═══════════════════════════════════════════════════════════════════
# 4 — the admin lock holds
# ═══════════════════════════════════════════════════════════════════

ADMIN_LOCKED = datetime.now(timezone.utc) + timedelta(days=36500)
AUTO_LOCKED = datetime.now(timezone.utc) + timedelta(minutes=10)


class TestAdminLock:
    @pytest.mark.parametrize('offset,expected', [
        (None, None),
        (timedelta(minutes=-1), None),
        (timedelta(minutes=15), 'auto'),
        (timedelta(hours=23), 'auto'),
        (timedelta(days=2), 'admin'),
        (timedelta(days=36500), 'admin'),
    ])
    def test_lock_state(self, offset, expected):
        import server
        now = datetime.now(timezone.utc)
        assert server._lock_state(None if offset is None else now + offset, now) == expected

    def test_lock_state_handles_naive_timestamps(self):
        import server
        now = datetime.now(timezone.utc)
        naive = (now + timedelta(days=5)).replace(tzinfo=None)
        assert server._lock_state(naive, now) == 'admin'

    @patch('server.verify_auth', return_value=True)
    def test_correct_password_does_not_open_an_admin_lock(self, _v, client, mock_db):
        mock_db.queue(_user_row(locked_until=ADMIN_LOCKED))
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 403
        assert resp.get_json() == {'error': 'account_suspended'}
        assert 'token' not in resp.get_json()
        assert not any('locked_until = NULL' in s for s in _sql(mock_db)), \
            'the admin lock must not be cleared'

    @patch('server.verify_auth', return_value=True)
    def test_an_admin_lock_landing_mid_login_is_not_cleared(self, _v, client, mock_db):
        # SELECT saw no lock; the guarded UPDATE matched nothing because one
        # landed in between.
        mock_db.queue(_user_row(), None)
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 403
        update = next(s for s in _sql(mock_db) if s.startswith('UPDATE users SET login_attempts = 0'))
        assert 'AND (locked_until IS NULL OR locked_until <= %s)' in update

    @patch('server.verify_auth', return_value=False)
    def test_wrong_password_on_an_admin_lock_looks_like_any_lock(self, _v, client, mock_db):
        mock_db.queue(_user_row(locked_until=ADMIN_LOCKED))
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 429
        assert resp.get_json()['error'] == 'Account temporarily locked'
        assert not any(s.startswith('UPDATE users') for s in _sql(mock_db)), \
            'no counter change, and nothing that could overwrite the admin lock'

    @patch('server.verify_auth', return_value=True)
    def test_correct_password_still_clears_an_automatic_lock(self, _v, client, mock_db):
        # PR #158's anti-lockout-DoS behaviour must survive.
        mock_db.queue(_user_row(login_attempts=5, locked_until=AUTO_LOCKED), {'password_version': 1})
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 200

    @patch('server.verify_auth', return_value=True)
    def test_recovery_does_not_open_an_admin_lock(self, _v, client, mock_db):
        mock_db.queue(_recovery_row(locked_until=ADMIN_LOCKED))
        resp = client.post('/api/recover', json=RECOVER_BODY)
        assert resp.status_code == 403
        assert resp.get_json() == {'error': 'account_suspended'}
        assert not any('SET auth_hash' in s for s in _sql(mock_db)), \
            'the credentials must not be swapped'

    @patch('server.verify_auth', return_value=True)
    def test_an_admin_lock_landing_mid_recovery_is_not_cleared(self, _v, client, mock_db):
        mock_db.queue(_recovery_row(), None)
        resp = client.post('/api/recover', json=RECOVER_BODY)
        assert resp.status_code == 403

    @patch('server.verify_auth', return_value=True)
    def test_recovery_still_clears_an_automatic_lock(self, _v, client, mock_db):
        mock_db.queue(_recovery_row(recovery_attempts=3, locked_until=AUTO_LOCKED), {'id': 1})
        resp = client.post('/api/recover', json=RECOVER_BODY)
        assert resp.status_code == 200

    def test_admin_lock_ends_existing_sessions(self, client, mock_db, admin_token):
        mock_db.queue(ADMIN_ROW, {'id': 2})
        resp = client.post('/api/admin/users/2/lock', headers=_bearer(admin_token))
        assert resp.status_code == 200
        sql, params = next((s, p) for s, p in mock_db.executed if 'SET locked_until' in s)
        assert 'password_version = COALESCE(password_version, 1) + 1' in ' '.join(sql.split())
        import server
        assert server._lock_state(params[0], datetime.now(timezone.utc)) == 'admin'

    def test_unlock_clears_the_lock_and_both_counters(self, client, mock_db, admin_token):
        mock_db.queue(ADMIN_ROW, {'id': 2})
        resp = client.post('/api/admin/users/2/unlock', headers=_bearer(admin_token))
        assert resp.status_code == 200
        update = next(s for s in _sql(mock_db) if s.startswith('UPDATE users'))
        assert 'locked_until = NULL' in update
        assert 'login_attempts = 0' in update and 'recovery_attempts = 0' in update


# ═══════════════════════════════════════════════════════════════════
# 5 — failed attempts count atomically and restart after a lock
# ═══════════════════════════════════════════════════════════════════

class TestAttemptCounters:
    @patch('server.verify_auth', return_value=False)
    def test_login_failure_is_counted_in_sql_not_python(self, _v, client, mock_db):
        mock_db.queue(_user_row(login_attempts=2), {'attempts': 3})
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 401
        import server
        sql, params = next((s, p) for s, p in mock_db.executed if 'login_attempts = CASE' in s)
        assert sql is server._COUNT_FAILED_LOGIN_SQL
        assert set(params) == {'now', 'id'}, 'the new count must not be computed in Python'

    @patch('server.verify_auth', return_value=False)
    def test_the_lock_follows_the_count_the_db_returns(self, _v, client, mock_db):
        # The SELECT saw 0 attempts, but a concurrent burst got there first:
        # the atomic UPDATE says this is the 5th.
        mock_db.queue(_user_row(login_attempts=0), {'attempts': 5})
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 429
        assert 'ACCOUNT_LOCKED' in _audits(mock_db)

    @patch('server.verify_auth', return_value=False)
    def test_an_expired_lock_does_not_relock_on_the_next_typo(self, _v, client, mock_db):
        expired = datetime.now(timezone.utc) - timedelta(minutes=1)
        # Counter still at 5 from the old lock; the UPDATE restarts it at 1.
        mock_db.queue(_user_row(login_attempts=5, locked_until=expired), {'attempts': 1})
        resp = client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        assert resp.status_code == 401
        assert 'ACCOUNT_LOCKED' not in _audits(mock_db)

    def test_both_counter_statements_restart_on_an_expired_lock(self):
        import server
        for sql in (server._COUNT_FAILED_LOGIN_SQL, server._COUNT_FAILED_RECOVERY_SQL):
            flat = ' '.join(sql.split())
            assert 'WHEN locked_until <= %(now)s THEN 1' in flat
            assert 'locked_until = CASE WHEN locked_until <= %(now)s THEN NULL' in flat

    @patch('server.verify_auth', return_value=False)
    def test_recovery_failure_is_atomic_and_locks_at_three(self, _v, client, mock_db):
        mock_db.queue(_recovery_row(recovery_attempts=0), {'attempts': 3})
        resp = client.post('/api/recover', json=RECOVER_BODY)
        assert resp.status_code == 429
        assert 'RECOVERY_LOCKED' in _audits(mock_db)
        import server
        assert any(s is server._COUNT_FAILED_RECOVERY_SQL for s, _ in mock_db.executed)

    @patch('server.verify_auth', return_value=False)
    def test_the_automatic_lock_cannot_overwrite_an_admin_lock(self, _v, client, mock_db):
        mock_db.queue(_user_row(), {'attempts': 5})
        client.post('/api/login', json={'username': 'alice', 'auth_key': VALID_KEY})
        sql, params = next((s, p) for s, p in mock_db.executed if 'SET locked_until = %(until)s' in s)
        assert 'locked_until <= %(admin_floor)s' in sql
        import server
        assert params['admin_floor'] - params['until'] == \
            server.ADMIN_LOCK_THRESHOLD - server.AUTO_LOCK_DURATION


# ═══════════════════════════════════════════════════════════════════
# 6 — the claim-init decoy
# ═══════════════════════════════════════════════════════════════════

class TestClaimDecoy:
    @pytest.mark.parametrize('max_id', [0, 1, 2, 7, 64, 1000, 2 ** 31 - 1])
    def test_decoy_ids_are_positive_and_within_real_ids(self, max_id):
        import server
        for name in ('ghost', 'alice', 'bob_2'):
            seed = server.hmac.new(b'k', name.encode(), server.hashlib.sha256).digest()
            fid = server._fake_grant_id(seed, max_id)
            assert 1 <= fid <= max(max_id, 1)

    def test_decoy_id_is_stable_while_grants_accumulate(self):
        # A real grant's id never moves; a decoy that moved with every new
        # invitation on the server would give itself away.
        import server
        seed = server.hmac.new(b'k', b'ghost', server.hashlib.sha256).digest()
        ids = {server._fake_grant_id(seed, m) for m in range(1024, 2048)}
        assert len(ids) == 1

    def test_unknown_user_gets_a_real_looking_grant(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'max_id': 500}, [])
        resp = client.post('/api/family/grants/claim/init', headers=_bearer(auth_token),
                           json={'source_username': 'ghost'})
        grants = resp.get_json()['grants']
        assert len(grants) == 1
        g = grants[0]
        assert set(g) == {'id', 'grant_params', 'wrapped_master', 'grant_auth'}
        assert type(g['id']) is int and 1 <= g['id'] <= 500
        assert len(base64.b64decode(g['wrapped_master'])) == 60   # nonce + ct + tag
        assert len(base64.b64decode(g['grant_auth'])) == 32       # SHA-256
        params = base64.b64decode(g['grant_params']).decode()
        assert ', ' not in params and ': ' not in params          # compact, like the client

    def test_same_answer_for_unknown_and_for_no_live_grants(self, client, mock_db, auth_token):
        # Both reach the decoy; the response depends only on the name + MAX(id).
        mock_db.queue(AUTH_ROW, {'max_id': 40}, [])
        first = client.post('/api/family/grants/claim/init', headers=_bearer(auth_token),
                            json={'source_username': 'carol'}).get_json()
        mock_db.queue(AUTH_ROW, {'max_id': 40}, [])
        second = client.post('/api/family/grants/claim/init', headers=_bearer(auth_token),
                             json={'source_username': 'carol'}).get_json()
        assert first == second

    def test_claiming_a_decoy_id_looks_like_a_wrong_code(self, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, None)  # no live grant with that id
        resp = client.post('/api/family/grants/claim', headers=_bearer(auth_token),
                           json={'grant_id': 17, 'proof': VALID_KEY})
        assert resp.status_code == 401
        assert resp.get_json() == {'error': 'Invalid family code'}


# ═══════════════════════════════════════════════════════════════════
# 7 — claim race + deterministic scope
# ═══════════════════════════════════════════════════════════════════

GRANT = {'id': 5, 'source_user_id': 2, 'claimed_by_user_id': None, 'grant_auth': 'h'}


class TestClaimRaceAndScope:
    @patch('server.verify_auth', return_value=True)
    def test_the_claim_write_is_conditional(self, _v, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, dict(GRANT), {'id': 5}, {'username': 'pat'})
        resp = client.post('/api/family/grants/claim', headers=_bearer(auth_token),
                           json={'grant_id': 5, 'proof': VALID_KEY})
        assert resp.status_code == 200
        update = next(s for s in _sql(mock_db) if s.startswith('UPDATE family_grants'))
        assert 'AND (claimed_by_user_id IS NULL OR claimed_by_user_id = %s)' in update
        assert 'RETURNING id' in update

    @patch('server.verify_auth', return_value=True)
    def test_losing_the_race_is_409(self, _v, client, mock_db, auth_token):
        # Saw it unclaimed; someone else's UPDATE committed first.
        mock_db.queue(AUTH_ROW, dict(GRANT), None)
        resp = client.post('/api/family/grants/claim', headers=_bearer(auth_token),
                           json={'grant_id': 5, 'proof': VALID_KEY})
        assert resp.status_code == 409
        assert 'FAMILY_CLAIM_SUCCESS:5' not in _audits(mock_db)

    def test_two_grants_resolve_to_the_narrowest(self, client, mock_db):
        import server
        mock_db.queue({'id': 3, 'share_mask': 1})
        assert server._family_scope(7, 2) == 1
        select = _sql(mock_db)[0]
        assert 'ORDER BY share_mask ASC, id ASC LIMIT 1' in select

    def test_the_masks_nest_so_ordering_is_an_intersection(self):
        # If a mask that does not nest is ever added, ORDER BY stops being
        # "narrowest" and _family_scope must intersect instead.
        import server
        masks = sorted(server.VALID_SHARE_MASKS)
        for narrow, wide in zip(masks, masks[1:]):
            assert narrow & wide == narrow


# ═══════════════════════════════════════════════════════════════════
# 8 — deleting a caregiver revokes what they claimed
# ═══════════════════════════════════════════════════════════════════

REVOKE_CLAIMED = ('UPDATE family_grants SET revoked_at = NOW() '
                  'WHERE claimed_by_user_id = %s AND revoked_at IS NULL')


class TestCaregiverDeletion:
    @patch('server.verify_auth', return_value=True)
    def test_self_service_delete_revokes_claimed_grants(self, _v, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'id': 1, 'auth_hash': 'h'})
        resp = client.post('/api/delete-account', headers=_bearer(auth_token),
                           json={'auth_key': VALID_KEY})
        assert resp.status_code == 200
        sql = _sql(mock_db)
        assert REVOKE_CLAIMED in sql
        assert sql.index(REVOKE_CLAIMED) < sql.index('DELETE FROM users WHERE id = %s'), \
            'revoke first — after the delete, ON DELETE SET NULL has already erased who claimed it'
        params = mock_db.executed[sql.index(REVOKE_CLAIMED)][1]
        assert params == (1,)

    def test_admin_delete_revokes_claimed_grants(self, client, mock_db, admin_token):
        mock_db.queue(ADMIN_ROW, {'id': 2})
        resp = client.delete('/api/admin/users/2', headers=_bearer(admin_token))
        assert resp.status_code == 200
        sql = _sql(mock_db)
        assert sql.index(REVOKE_CLAIMED) < sql.index('DELETE FROM users WHERE id = %s')


# ═══════════════════════════════════════════════════════════════════
# 9 — audit hygiene
# ═══════════════════════════════════════════════════════════════════

class TestAuditHygiene:
    @pytest.mark.parametrize('method,path,action', [
        ('delete', '/api/admin/users/2', 'ADMIN_DELETE_USER:2'),
        ('post', '/api/admin/users/2/promote', 'ADMIN_PROMOTE:2'),
        ('post', '/api/admin/users/2/demote', 'ADMIN_DEMOTE:2'),
    ])
    def test_admin_actions_record_the_id_not_the_name(self, client, mock_db, admin_token,
                                                      method, path, action):
        mock_db.queue(ADMIN_ROW, {'id': 2, 'username': 'bob'})
        resp = getattr(client, method)(path, headers=_bearer(admin_token))
        assert resp.status_code == 200
        assert _audits(mock_db) == [action]
        assert not any('bob' in a for a in _audits(mock_db))

    def test_stats_count_both_lockouts_and_both_deletions(self, client, mock_db, admin_token):
        mock_db.queue(ADMIN_ROW, *([{'total': 1, 'active': 1, 'cnt': 0}] * 16), None, {'cnt': 0})
        resp = client.get('/api/admin/stats', headers=_bearer(admin_token))
        assert resp.status_code == 200
        sql = _sql(mock_db)
        lockouts = [s for s in sql if 'ACCOUNT_LOCKED' in s]
        deletions = [s for s in sql if 'ADMIN_DELETE_USER' in s]
        assert len(lockouts) == 2 and all('RECOVERY_LOCKED' in s for s in lockouts)
        assert len(deletions) == 2 and all("'ACCOUNT_DELETED'" in s for s in deletions)


# ═══════════════════════════════════════════════════════════════════
# 10 — audit retention
# ═══════════════════════════════════════════════════════════════════

class TestAnonymizeIp:
    @pytest.mark.parametrize('raw,expected', [
        ('203.0.113.77', '203.0.113.0'),
        ('203.0.113.0', '203.0.113.0'),
        ('2001:db8::1', '2001:db8::'),
        ('2001:db8:abcd:1234:5678::1', '2001:db8:abcd::'),
        ('2001:0db8:abcd:0012:0000:0000:0000:0001', '2001:db8:abcd::'),
        ('::1', '::'),
        ('::ffff:198.51.100.23', '198.51.100.0'),
        ('fe80::1%eth0', 'fe80::'),
        (' 192.0.2.9 ', '192.0.2.0'),
        ('not-an-ip', None),
        ('1.2.3', None),
        ('', None),
        (None, None),
    ])
    def test_truncation(self, raw, expected):
        import server
        assert server._anonymize_ip(raw) == expected

    @pytest.mark.parametrize('raw', ['203.0.113.77', '2001:db8::1', '::ffff:1.2.3.4', 'x'])
    def test_idempotent(self, raw):
        import server
        once = server._anonymize_ip(raw)
        assert once is None or server._anonymize_ip(once) == once


class TestRetentionRun:
    def test_skips_rows_already_anonymized(self, client, mock_db):
        import server
        old = datetime.now(timezone.utc) - timedelta(days=40)
        mock_db.rowcount = 4  # the DELETE
        mock_db.queue({'locked': True}, [
            {'id': 1, 'ip_address': '203.0.113.0', 'created_at': old},   # done already
            {'id': 2, 'ip_address': '203.0.113.9', 'created_at': old},
            {'id': 3, 'ip_address': '2001:db8::', 'created_at': old},    # done already
            {'id': 4, 'ip_address': '2001:db8::7', 'created_at': old},
        ])
        result = server.apply_audit_retention()
        assert result == {'status': 'ok', 'deleted': 4, 'anonymized': 2}
        updates = [p for s, p in mock_db.executed if s.startswith('UPDATE audit_log')]
        assert updates == [('203.0.113.0', 2), ('2001:db8::', 4)]

    def test_another_run_holding_the_lock_means_busy(self, client, mock_db):
        import server
        mock_db.queue({'locked': False})
        assert server.apply_audit_retention() == {'status': 'busy'}
        assert not any('DELETE' in s for s in _sql(mock_db))
        assert 'pg_try_advisory_xact_lock' in _sql(mock_db)[0]

    def test_a_failed_run_says_so(self, client, mock_db):
        import server
        with patch.object(mock_db, 'execute', side_effect=psycopg2.OperationalError('down')):
            assert server.apply_audit_retention() == {'status': 'failed'}

    @pytest.mark.parametrize('result,status', [
        ({'status': 'ok', 'deleted': 1, 'anonymized': 2}, 200),
        ({'status': 'busy'}, 409),
        ({'status': 'failed'}, 500),
    ])
    def test_the_admin_endpoint_reports_the_real_result(self, client, mock_db, admin_token,
                                                        result, status):
        mock_db.queue(ADMIN_ROW)
        with patch('server.apply_audit_retention', return_value=result):
            resp = client.post('/api/admin/audit/retention', headers=_bearer(admin_token))
        assert resp.status_code == status
        if status == 200:
            assert resp.get_json() == {'success': True, 'deleted': 1, 'anonymized': 2}


class TestDailyRetentionTrigger:
    def test_not_due_does_nothing(self, monkeypatch):
        import server
        monkeypatch.setattr(server, '_retention_due_at', server.time.monotonic() + 3600)
        with patch('server.apply_audit_retention') as run:
            assert server._maybe_apply_audit_retention() is None
        run.assert_not_called()

    def test_first_due_is_a_day_after_boot(self):
        # entrypoint.sh already ran it at boot; the daily one waits a day.
        import server
        assert server._retention_due_at > server.time.monotonic() + 23 * 3600 - 600

    def test_due_runs_once_then_waits_a_day(self, monkeypatch):
        import server
        monkeypatch.setattr(server, '_retention_due_at', 0)
        ok = {'status': 'ok', 'deleted': 0, 'anonymized': 0}
        with patch('server.apply_audit_retention', return_value=ok) as run:
            assert server._maybe_apply_audit_retention() == ok
            assert server._maybe_apply_audit_retention() is None
        run.assert_called_once()
        remaining = server._retention_due_at - server.time.monotonic()
        assert 23 * 3600 < remaining <= server.AUDIT_RETENTION_INTERVAL_SECONDS

    def test_a_failed_run_retries_within_the_hour_not_every_check(self, monkeypatch):
        import server
        monkeypatch.setattr(server, '_retention_due_at', 0)
        with patch('server.apply_audit_retention', return_value={'status': 'failed'}) as run:
            server._maybe_apply_audit_retention()
            server._maybe_apply_audit_retention()
        run.assert_called_once()
        remaining = server._retention_due_at - server.time.monotonic()
        assert 0 < remaining <= server.AUDIT_RETENTION_RETRY_SECONDS

    def test_it_never_raises(self, monkeypatch):
        import server
        monkeypatch.setattr(server, '_retention_due_at', 0)
        with patch('server.apply_audit_retention', side_effect=RuntimeError('boom')):
            assert server._maybe_apply_audit_retention() is None

    def test_a_run_in_progress_in_this_process_is_not_doubled(self, monkeypatch):
        import server
        monkeypatch.setattr(server, '_retention_due_at', 0)
        server._retention_gate.acquire()
        try:
            with patch('server.apply_audit_retention') as run:
                assert server._maybe_apply_audit_retention() is None
            run.assert_not_called()
        finally:
            server._retention_gate.release()

    def test_health_hands_it_to_the_close_hook(self, client, mock_db):
        mock_db.queue({'?column?': 1}, {'version': 9})
        with patch('server._maybe_apply_audit_retention') as trigger:
            resp = client.get('/health')
            assert resp.status_code == 200
            trigger.assert_not_called()  # not while the response is being built
            resp.close()
        trigger.assert_called_once()


# ═══════════════════════════════════════════════════════════════════
# 11 — concurrent registration
# ═══════════════════════════════════════════════════════════════════

class TestRegisterRace:
    def test_losing_a_registration_race_is_the_same_409(self, client, mock_db):
        real_execute = mock_db.execute

        def execute(sql, params=None):
            if 'INSERT INTO users' in sql:
                raise psycopg2.errors.UniqueViolation('duplicate key value')
            return real_execute(sql, params)

        mock_db.queue(None)  # the pre-check saw the name free
        with patch.object(mock_db, 'execute', side_effect=execute):
            resp = client.post('/api/register', json={
                'username': 'alice', 'auth_hash': VALID_KEY, 'auth_params': 'ap',
                'vault_params': 'vp', 'encrypted_master': 'em',
            })
        assert resp.status_code == 409
        assert resp.get_json() == {'error': 'registration_failed'}


# ═══════════════════════════════════════════════════════════════════
# Real PostgreSQL — the counter statements' semantics
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not os.environ.get('DATABASE_URL'), reason='needs a real PostgreSQL; CI has none')
class TestCountersAgainstPostgres:
    @pytest.fixture
    def cur(self):
        from psycopg2.extras import RealDictCursor
        conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=RealDictCursor)
        try:
            with conn.cursor() as c:
                # A TEMP table named users shadows any real one for this session.
                c.execute("""
                    CREATE TEMP TABLE users (
                        id INTEGER PRIMARY KEY,
                        login_attempts INTEGER DEFAULT 0,
                        recovery_attempts INTEGER DEFAULT 0,
                        locked_until TIMESTAMP WITH TIME ZONE
                    ) ON COMMIT DROP
                """)
                yield c
        finally:
            conn.rollback()
            conn.close()

    def _row(self, cur):
        cur.execute('SELECT login_attempts, recovery_attempts, locked_until FROM users WHERE id = 1')
        return cur.fetchone()

    def test_counts_up_and_restarts_after_an_expired_lock(self, cur):
        import server
        now = datetime.now(timezone.utc)
        cur.execute("INSERT INTO users VALUES (1, 5, 2, %s)", (now - timedelta(minutes=1),))
        assert server._count_failed_attempt(cur, server._COUNT_FAILED_LOGIN_SQL, 1, now) == 1
        row = self._row(cur)
        assert row['locked_until'] is None and row['recovery_attempts'] == 0
        assert server._count_failed_attempt(cur, server._COUNT_FAILED_LOGIN_SQL, 1, now) == 2

    def test_a_live_lock_is_left_alone(self, cur):
        import server
        now = datetime.now(timezone.utc)
        until = now + timedelta(minutes=10)
        cur.execute("INSERT INTO users VALUES (1, 5, 1, %s)", (until,))
        assert server._count_failed_attempt(cur, server._COUNT_FAILED_RECOVERY_SQL, 1, now) == 2
        row = self._row(cur)
        assert row['locked_until'] == until and row['login_attempts'] == 5

    def test_null_counters_and_missing_rows(self, cur):
        import server
        now = datetime.now(timezone.utc)
        cur.execute("INSERT INTO users VALUES (1, NULL, NULL, NULL)")
        assert server._count_failed_attempt(cur, server._COUNT_FAILED_LOGIN_SQL, 1, now) == 1
        assert server._count_failed_attempt(cur, server._COUNT_FAILED_LOGIN_SQL, 99, now) is None

    def test_auto_lock_skips_an_admin_lock(self, cur):
        import server
        now = datetime.now(timezone.utc)
        admin = now + server.ADMIN_LOCK_DURATION
        cur.execute("INSERT INTO users VALUES (1, 5, 0, %s)", (admin,))
        server._apply_auto_lock(cur, 1, now)
        assert self._row(cur)['locked_until'] == admin
        cur.execute("UPDATE users SET locked_until = %s WHERE id = 1", (now - timedelta(minutes=1),))
        server._apply_auto_lock(cur, 1, now)
        assert self._row(cur)['locked_until'] == now + server.AUTO_LOCK_DURATION


# ═══════════════════════════════════════════════════════════════════
# a wrong re-entered password is not an expired session
# ═══════════════════════════════════════════════════════════════════

class TestWrongPasswordIsNotLogout:
    """The frontend treats a 401 on an authenticated request as "session
    expired" and logs out. A typo in the current password on change-password
    or delete-account must therefore be a 403."""

    @patch('server.verify_auth', return_value=False)
    def test_change_password_wrong_current_password_is_403(self, _v, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'id': 1, 'auth_hash': 'h'})
        resp = client.post('/api/change-password', headers=_bearer(auth_token), json={
            'current_auth_key': VALID_KEY, 'auth_hash': VALID_KEY,
            'auth_params': '{"s":"x"}', 'vault_params': '{"s":"y"}', 'encrypted_master': 'ZW5jcnlwdGVk',
        })
        assert resp.status_code == 403
        assert not any('UPDATE users' in sql for sql in _sql(mock_db))

    @patch('server.verify_auth', return_value=False)
    def test_delete_account_wrong_password_is_403(self, _v, client, mock_db, auth_token):
        mock_db.queue(AUTH_ROW, {'id': 1, 'auth_hash': 'h'})
        resp = client.post('/api/delete-account', headers=_bearer(auth_token), json={'auth_key': VALID_KEY})
        assert resp.status_code == 403
        assert not any('DELETE FROM users' in sql for sql in _sql(mock_db))
