"""
ciphra API test suite.

Tests critical flows: auth, documents CRUD, admin, recovery.
All database access is mocked — no PostgreSQL required.
"""

import sys
import os
import json
import base64
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# Valid base64 of exactly 32 raw bytes — server.py:542 requires
# valid_b64(auth_key, 32, 32) before the login flow proceeds.
VALID_AUTH_KEY = base64.b64encode(b'\x00' * 32).decode('ascii')


# ═══════════════════════════════════════════════════════════════════
# Health
# ═══════════════════════════════════════════════════════════════════

class TestHealth:
    def test_health_returns_200(self, client, mock_db):
        # health does SELECT 1; queue a dummy result so fetchone succeeds
        mock_db.queue({'?column?': 1})
        resp = client.get('/health')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'healthy'


# ═══════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════

def _register_bundle(**overrides):
    """Vault bundle the browser uploads to /api/register. Server never sees
    the password or recovery code — both stay on device. Recovery is optional
    but all-or-nothing (server.py:462-465)."""
    bundle = {
        'username': 'alice',
        'auth_hash': VALID_AUTH_KEY,
        'auth_params': 'ap',
        'vault_params': 'vp',
        'encrypted_master': 'em',
    }
    bundle.update(overrides)
    return bundle


class TestRegister:
    def test_register_success(self, client, mock_db):
        # SELECT id WHERE username -> None (no duplicate); INSERT RETURNING id
        mock_db.queue(None, {'id': 1})

        resp = client.post('/api/register', json=_register_bundle(username='Alice'))
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['success'] is True
        assert data['username'] == 'alice'
        # Server does not return a recovery_code anymore — client generated it
        # locally from the recovery_vault during pre-registration setup.
        assert data['user_id'] == 1

    def test_register_short_username(self, client, mock_db):
        # 'ab' fails USERNAME_RE (3-64 chars). Bundle otherwise valid so the
        # username check is the actual short-circuit.
        resp = client.post('/api/register', json=_register_bundle(username='ab'))
        assert resp.status_code == 400
        assert 'username' in resp.get_json()['error'].lower()

    @pytest.mark.skip(reason=(
        'Password length validation moved client-side. Server never receives '
        'the password — only the client-derived auth_hash + re-wrapped '
        'encrypted_master. No server-side surface to test.'
    ))
    def test_register_short_password(self):
        pass

    def test_register_duplicate_username(self, client, mock_db):
        # SELECT id returns an existing user → 409.
        mock_db.queue({'id': 42})

        resp = client.post('/api/register', json=_register_bundle())
        assert resp.status_code == 409
        # Anti-enumeration: error string is generic "registration_failed",
        # not "already exists". Same response whether the username collides
        # or the bundle is otherwise rejected (server.py:478).
        assert resp.get_json()['error'] == 'registration_failed'

    def test_register_empty_body(self, client, mock_db):
        resp = client.post('/api/register', json={})
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════════════
# Login
# ═══════════════════════════════════════════════════════════════════

def _user_row(**overrides):
    """Default user row matching server.py:551 SELECT shape."""
    row = {
        'id': 1,
        'auth_hash': 'storedhash',
        'auth_params': 'ap',
        'vault_params': 'vp',
        'encrypted_master': 'em',
        'login_attempts': 0,
        'locked_until': None,
        'is_admin': False,
        'password_version': 1,
    }
    row.update(overrides)
    return row


class TestLogin:
    @patch('server.verify_auth')
    def test_login_success(self, mock_verify, client, mock_db):
        mock_verify.return_value = True
        mock_db.queue(_user_row())

        resp = client.post('/api/login', json={
            'username': 'alice',
            'auth_key': VALID_AUTH_KEY,
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert 'token' in data
        assert 'vault' in data
        assert data['is_admin'] is False

    @patch('server.verify_auth')
    def test_login_wrong_password(self, mock_verify, client, mock_db):
        mock_verify.return_value = False
        mock_db.queue(_user_row())

        resp = client.post('/api/login', json={
            'username': 'alice',
            'auth_key': VALID_AUTH_KEY,
        })
        assert resp.status_code == 401
        assert 'Invalid credentials' in resp.get_json()['error']

    @patch('server.verify_auth')
    def test_login_lockout_after_5_failures(self, mock_verify, client, mock_db):
        mock_verify.return_value = False
        # 4 prior failures → this attempt is the 5th, triggers lockout
        mock_db.queue(_user_row(login_attempts=4))

        resp = client.post('/api/login', json={
            'username': 'alice',
            'auth_key': VALID_AUTH_KEY,
        })
        assert resp.status_code == 429
        assert 'Locked' in resp.get_json()['error']

    def test_login_already_locked(self, client, mock_db):
        future = datetime.now(timezone.utc) + timedelta(minutes=10)
        mock_db.queue(_user_row(login_attempts=5, locked_until=future))

        resp = client.post('/api/login', json={
            'username': 'alice',
            'auth_key': VALID_AUTH_KEY,
        })
        assert resp.status_code == 429
        assert 'locked' in resp.get_json()['error'].lower()

    def test_login_nonexistent_user(self, client, mock_db):
        # SELECT returns None — user not found path (server.py:556-557)
        mock_db.queue(None)

        resp = client.post('/api/login', json={
            'username': 'nobody',
            'auth_key': VALID_AUTH_KEY,
        })
        assert resp.status_code == 401

    def test_login_missing_fields(self, client, mock_db):
        # Missing auth_key fails the validation gate (server.py:542-543).
        # Anti-enumeration policy collapses missing-field and bad-credential
        # responses into the same 401, so this hits the credentials path.
        resp = client.post('/api/login', json={'username': 'alice'})
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════
# Documents CRUD
# ═══════════════════════════════════════════════════════════════════

# Queued first by every authenticated test: token_required → _current_password_version
# runs SELECT password_version + fetchone before the route handler (server.py:243-249).
PWD_VERSION_ROW = {'password_version': 1}


class TestDocuments:
    def test_store_document(self, client, mock_db, auth_token):
        now = datetime.now(timezone.utc)
        # Queue order: token pwd_version check, then SELECT COUNT, then INSERT RETURNING.
        mock_db.queue(PWD_VERSION_ROW, {'n': 0}, {'id': 10, 'created_at': now})

        resp = client.post('/api/documents',
            json={'encrypted_data': 'ciphertext_blob'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['success'] is True
        assert data['id'] == 10

    def test_store_document_no_data(self, client, mock_db, auth_token):
        mock_db.queue(PWD_VERSION_ROW)
        resp = client.post('/api/documents',
            json={},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 400

    def test_get_documents(self, client, mock_db, auth_token):
        now = datetime.now(timezone.utc)
        # Queue: token pwd_version, then fetchall payload.
        mock_db.queue(
            PWD_VERSION_ROW,
            [
                {'id': 1, 'encrypted_data': 'enc1', 'created_at': now, 'updated_at': now},
                {'id': 2, 'encrypted_data': 'enc2', 'created_at': now, 'updated_at': now},
            ],
        )

        resp = client.get('/api/documents',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 200
        docs = resp.get_json()['documents']
        assert len(docs) == 2
        assert docs[0]['id'] == 1

    def test_update_document(self, client, mock_db, auth_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 5})

        resp = client.put('/api/documents/5',
            json={'encrypted_data': 'new_ciphertext'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_update_document_not_found(self, client, mock_db, auth_token):
        mock_db.queue(PWD_VERSION_ROW, None)

        resp = client.put('/api/documents/999',
            json={'encrypted_data': 'blob'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 404

    def test_delete_document(self, client, mock_db, auth_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 5})

        resp = client.delete('/api/documents/5',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_delete_document_not_found(self, client, mock_db, auth_token):
        mock_db.queue(PWD_VERSION_ROW, None)

        resp = client.delete('/api/documents/999',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 404


class TestDocumentsAuth:
    def test_store_without_token(self, client, mock_db):
        resp = client.post('/api/documents', json={'encrypted_data': 'x'})
        assert resp.status_code == 401

    def test_get_without_token(self, client, mock_db):
        resp = client.get('/api/documents')
        assert resp.status_code == 401

    def test_update_without_token(self, client, mock_db):
        resp = client.put('/api/documents/1', json={'encrypted_data': 'x'})
        assert resp.status_code == 401

    def test_delete_without_token(self, client, mock_db):
        resp = client.delete('/api/documents/1')
        assert resp.status_code == 401

    def test_invalid_token(self, client, mock_db):
        resp = client.get('/api/documents',
            headers={'Authorization': 'Bearer invalid.token.here'},
        )
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════
# Admin routes
# ═══════════════════════════════════════════════════════════════════

class TestAdmin:
    def test_admin_stats_requires_admin(self, client, mock_db, auth_token):
        resp = client.get('/api/admin/stats',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 403
        assert 'Admin' in resp.get_json()['error']

    def test_admin_users_requires_admin(self, client, mock_db, auth_token):
        resp = client.get('/api/admin/users',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert resp.status_code == 403

    def test_admin_stats_success(self, client, mock_db, admin_token):
        # admin_required pwd_version check + admin_stats's 8 count queries
        mock_db.queue(
            PWD_VERSION_ROW,
            {'total': 10},     # total users
            {'active': 5},     # active 30d
            {'active': 3},     # active 7d
            {'total': 42},     # total docs
            {'cnt': 1},        # lockouts 30d
            {'cnt': 20},       # logins success
            {'cnt': 4},        # logins failed
            {'cnt': 2},        # new users 7d
        )

        resp = client.get('/api/admin/stats',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['total_users'] == 10
        assert data['total_documents'] == 42

    def test_admin_users_success(self, client, mock_db, admin_token):
        now = datetime.now(timezone.utc)
        mock_db.queue(PWD_VERSION_ROW, [{
            'id': 1,
            'username': 'alice',
            'created_at': now,
            'last_login': now,
            'login_attempts': 0,
            'locked_until': None,
            'is_admin': False,
            'doc_count': 3,
        }])

        resp = client.get('/api/admin/users',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200
        users = resp.get_json()['users']
        assert len(users) == 1
        assert users[0]['username'] == 'alice'

    def test_admin_lock_user(self, client, mock_db, admin_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 2})  # admin pwd_version + user exists

        resp = client.post('/api/admin/users/2/lock',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200

    def test_admin_cannot_lock_self(self, client, mock_db, admin_token):
        # admin_token has user_id=99
        resp = client.post('/api/admin/users/99/lock',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 400

    def test_admin_unlock_user(self, client, mock_db, admin_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 2})

        resp = client.post('/api/admin/users/2/unlock',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200

    def test_admin_delete_user(self, client, mock_db, admin_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 2, 'username': 'bob'})

        resp = client.delete('/api/admin/users/2',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200

    def test_admin_cannot_delete_self(self, client, mock_db, admin_token):
        resp = client.delete('/api/admin/users/99',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 400

    def test_admin_promote_user(self, client, mock_db, admin_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 2, 'username': 'bob'})

        resp = client.post('/api/admin/users/2/promote',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200

    def test_admin_demote_user(self, client, mock_db, admin_token):
        mock_db.queue(PWD_VERSION_ROW, {'id': 2, 'username': 'bob'})

        resp = client.post('/api/admin/users/2/demote',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200

    def test_admin_cannot_demote_self(self, client, mock_db, admin_token):
        resp = client.post('/api/admin/users/99/demote',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 400

    def test_admin_audit_log(self, client, mock_db, admin_token):
        now = datetime.now(timezone.utc)
        mock_db.queue(PWD_VERSION_ROW, [{
            'id': 1,
            'user_id': 1,
            'username': 'alice',
            'action': 'LOGIN_SUCCESS',
            'ip_address': '127.0.0.1',
            'created_at': now,
        }])

        resp = client.get('/api/admin/audit',
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert resp.status_code == 200
        entries = resp.get_json()['entries']
        assert len(entries) == 1
        assert entries[0]['action'] == 'LOGIN_SUCCESS'


# ═══════════════════════════════════════════════════════════════════
# Recovery
# ═══════════════════════════════════════════════════════════════════

class TestRecovery:
    @patch('server.verify_auth')
    def test_recovery_success(self, mock_verify, client, mock_db):
        mock_verify.return_value = True
        # /api/recover SELECT shape: id, recovery_auth, recovery_attempts, locked_until
        mock_db.queue({
            'id': 1,
            'recovery_auth': 'storedhash',
            'recovery_attempts': 0,
            'locked_until': None,
        })

        resp = client.post('/api/recover', json={
            'username': 'alice',
            'recovery_key': VALID_AUTH_KEY,
            'auth_hash': VALID_AUTH_KEY,
            'auth_params': 'ap',
            'vault_params': 'vp',
            'encrypted_master': 'em',
        })
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_recovery_missing_fields(self, client, mock_db):
        # Missing recovery_key + auth_hash → fail validation gate (server.py:801).
        # Anti-enumeration: returns 401, not 400 (same response as bad credentials).
        resp = client.post('/api/recover', json={'username': 'alice'})
        assert resp.status_code == 401

    @patch('server.verify_auth')
    def test_recovery_wrong_code(self, mock_verify, client, mock_db):
        mock_verify.return_value = False
        mock_db.queue({
            'id': 1,
            'recovery_auth': 'storedhash',
            'recovery_attempts': 0,
            'locked_until': None,
        })

        resp = client.post('/api/recover', json={
            'username': 'alice',
            'recovery_key': VALID_AUTH_KEY,
            'auth_hash': VALID_AUTH_KEY,
            'auth_params': 'ap',
            'vault_params': 'vp',
            'encrypted_master': 'em',
        })
        assert resp.status_code == 401
        assert 'Invalid recovery code' in resp.get_json()['error']

    def test_recovery_not_enabled(self, client, mock_db):
        # User exists but recovery_auth is None — server.py:820 returns 401 with
        # 'Invalid recovery code' (anti-enumeration: hides 'no-recovery-set' from
        # 'wrong-code'). Test verifies the no-recovery branch reaches the same
        # collapsed response.
        mock_db.queue({
            'id': 1,
            'recovery_auth': None,
            'recovery_attempts': 0,
            'locked_until': None,
        })

        resp = client.post('/api/recover', json={
            'username': 'alice',
            'recovery_key': VALID_AUTH_KEY,
            'auth_hash': VALID_AUTH_KEY,
            'auth_params': 'ap',
            'vault_params': 'vp',
            'encrypted_master': 'em',
        })
        assert resp.status_code == 401
        assert 'Invalid recovery code' in resp.get_json()['error']

    @pytest.mark.skip(reason=(
        'Recovery code format validation moved client-side to '
        'frontend/src/lib/wordlist.ts:validateRecoveryCode in the zero-knowledge '
        'refactor. Server no longer sees the code phrase. '
        'PI v22 follow-up: add vitest coverage for validateRecoveryCode '
        '(currently 0 frontend tests).'
    ))
    def test_recovery_invalid_code_format(self):
        pass

    @pytest.mark.skip(reason=(
        'New-password length validation moved client-side. Server never receives '
        'the new password — only the client-derived auth_hash + re-wrapped '
        'encrypted_master. No server-side surface to test.'
    ))
    def test_recovery_short_password(self):
        pass


# ═══════════════════════════════════════════════════════════════════
# Validate recovery code — endpoint removed
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.skip(reason=(
    '/api/validate-recovery endpoint removed in zero-knowledge refactor. '
    'Recovery-code format validation lives in '
    'frontend/src/lib/wordlist.ts:validateRecoveryCode and runs entirely '
    'client-side. PI v22 follow-up: vitest coverage for validateRecoveryCode.'
))
class TestValidateRecovery:
    def test_validate_valid_code(self):
        pass

    def test_validate_invalid_code(self):
        pass
