"""
ciphra — API Server
Thin encrypted blob store. The server never sees plaintext health data.
"""

import os
import json
import logging
import secrets
from contextlib import contextmanager
from functools import wraps
from datetime import datetime, timezone, timedelta

import jwt
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from e2e_encryption import E2EEncryption, UserVault, RecoveryCode

# --- Config ---
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://ciphra:ciphra@localhost/ciphra')
SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# --- Flask ---
app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY
CORS(app, supports_credentials=True)
limiter = Limiter(get_remote_address, app=app, default_limits=["5000 per hour"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# --- Database ---
@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    auth_hash TEXT NOT NULL,
                    vault_params TEXT NOT NULL,
                    encrypted_master TEXT NOT NULL,
                    recovery_vault TEXT,
                    recovery_params TEXT,
                    is_admin BOOLEAN DEFAULT FALSE,
                    last_login TIMESTAMP WITH TIME ZONE,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            # Opaque document store — no record_type, no event dates.
            # Server sees only: user_id + encrypted blob + upload timestamp.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS encrypted_documents (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    encrypted_data TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    action VARCHAR(100) NOT NULL,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_user ON encrypted_documents(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)")
            # Migration: add is_admin column for existing databases
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
    logger.info("Database initialized")


# --- JWT ---
def generate_token(user_id: int, username: str, is_admin: bool = False) -> str:
    return jwt.encode({
        'user_id': user_id,
        'username': username,
        'is_admin': is_admin,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc),
    }, SECRET_KEY, algorithm=JWT_ALGORITHM)


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Token missing'}), 401
        try:
            payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[JWT_ALGORITHM])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'error': 'Token invalid or expired'}), 401
        request.user_id = payload['user_id']
        request.username = payload['username']
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Token missing'}), 401
        try:
            payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[JWT_ALGORITHM])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'error': 'Token invalid or expired'}), 401
        request.user_id = payload['user_id']
        request.username = payload['username']
        if not payload.get('is_admin', False):
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


def audit(conn, user_id, action):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO audit_log (user_id, action, ip_address) VALUES (%s, %s, %s)",
            (user_id, action, request.remote_addr),
        )


# --- Crypto ---
e2e = E2EEncryption()


def safe_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (bytes, bytearray)):
        return value.decode()
    return str(value)


# --- Routes ---

@app.route('/health', methods=['GET'])
def health():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return jsonify({'status': 'healthy'}), 200
    except Exception:
        return jsonify({'status': 'unhealthy'}), 503


@app.route('/api/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password')
    enable_recovery = data.get('enable_recovery', True)

    if not username or len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if not password or len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cur.fetchone():
                    return jsonify({'error': 'Username already exists'}), 409

                vault, recovery_code = e2e.register_user(username, password, enable_recovery)
                cur.execute("""
                    INSERT INTO users (username, auth_hash, vault_params, encrypted_master,
                                       recovery_vault, recovery_params)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                """, (
                    vault.username, vault.auth_hash,
                    safe_json(vault.vault_params), safe_json(vault.encrypted_master),
                    safe_json(vault.recovery_vault), safe_json(vault.recovery_params),
                ))
                user_id = cur.fetchone()['id']
                audit(conn, user_id, 'REGISTER')

        resp = {'success': True, 'username': username, 'user_id': user_id}
        if recovery_code:
            resp['recovery_code'] = recovery_code
        return jsonify(resp), 201
    except Exception as ex:
        logger.exception("Registration failed")
        return jsonify({'error': 'Registration failed'}), 500


@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, auth_hash, vault_params, encrypted_master,
                           login_attempts, locked_until, is_admin
                    FROM users WHERE username = %s
                """, (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'Invalid credentials'}), 401

                if user['locked_until']:
                    locked = user['locked_until']
                    if locked.tzinfo is None:
                        locked = locked.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) < locked:
                        return jsonify({'error': 'Account temporarily locked'}), 429

                vault = UserVault(
                    username=username,
                    auth_hash=user['auth_hash'],
                    vault_params=user['vault_params'],
                    encrypted_master=user['encrypted_master'],
                )

                if e2e.verify_login(password, vault):
                    cur.execute(
                        "UPDATE users SET login_attempts = 0, last_login = NOW() WHERE id = %s",
                        (user['id'],),
                    )
                    audit(conn, user['id'], 'LOGIN_SUCCESS')
                    is_admin = bool(user.get('is_admin', False))
                    token = generate_token(user['id'], username, is_admin)
                    return jsonify({
                        'success': True,
                        'token': token,
                        'username': username,
                        'is_admin': is_admin,
                        'vault': {
                            'vault_params': user['vault_params'],
                            'encrypted_master': user['encrypted_master'],
                        },
                    }), 200
                else:
                    attempts = user['login_attempts'] + 1
                    if attempts >= 5:
                        locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                        cur.execute(
                            "UPDATE users SET login_attempts=%s, locked_until=%s WHERE id=%s",
                            (attempts, locked_until, user['id']),
                        )
                        audit(conn, user['id'], 'ACCOUNT_LOCKED')
                        return jsonify({'error': 'Too many failed attempts. Locked 15 min'}), 429
                    else:
                        cur.execute(
                            "UPDATE users SET login_attempts=%s WHERE id=%s",
                            (attempts, user['id']),
                        )
                        audit(conn, user['id'], 'LOGIN_FAILED')
                        return jsonify({'error': 'Invalid credentials'}), 401
    except Exception:
        logger.exception("Login failed")
        return jsonify({'error': 'Login failed'}), 500


@app.route('/api/documents', methods=['POST'])
@token_required
def store_document():
    data = request.get_json() or {}
    encrypted_data = data.get('encrypted_data')
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO encrypted_documents (user_id, encrypted_data)
                    VALUES (%s, %s) RETURNING id, created_at
                """, (request.user_id, encrypted_data))
                doc = cur.fetchone()
                audit(conn, request.user_id, 'DOC_CREATED')
        return jsonify({
            'success': True,
            'id': doc['id'],
            'created_at': doc['created_at'].isoformat(),
        }), 201
    except Exception:
        logger.exception("Store document failed")
        return jsonify({'error': 'Failed to store document'}), 500


@app.route('/api/documents', methods=['GET'])
@token_required
def get_documents():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, encrypted_data, created_at, updated_at
                    FROM encrypted_documents
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                """, (request.user_id,))
                docs = cur.fetchall()
        return jsonify({
            'documents': [{
                'id': d['id'],
                'encrypted_data': d['encrypted_data'],
                'created_at': d['created_at'].isoformat(),
                'updated_at': d['updated_at'].isoformat(),
            } for d in docs]
        }), 200
    except Exception:
        logger.exception("Get documents failed")
        return jsonify({'error': 'Failed to retrieve documents'}), 500


@app.route('/api/documents/<int:doc_id>', methods=['PUT'])
@token_required
def update_document(doc_id):
    data = request.get_json() or {}
    encrypted_data = data.get('encrypted_data')
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE encrypted_documents
                    SET encrypted_data = %s, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    RETURNING id
                """, (encrypted_data, doc_id, request.user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'Document not found'}), 404
                audit(conn, request.user_id, 'DOC_UPDATED')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Update document failed")
        return jsonify({'error': 'Failed to update document'}), 500


@app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
@token_required
def delete_document(doc_id):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM encrypted_documents
                    WHERE id = %s AND user_id = %s RETURNING id
                """, (doc_id, request.user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'Document not found'}), 404
                audit(conn, request.user_id, 'DOC_DELETED')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Delete document failed")
        return jsonify({'error': 'Failed to delete document'}), 500


@app.route('/api/recover', methods=['POST'])
@limiter.limit("5 per minute")
def recover():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    recovery_code = (data.get('recovery_code') or '').strip()
    new_password = data.get('new_password')

    if not username or not recovery_code or not new_password:
        return jsonify({'error': 'Username, recovery code, and new password required'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not RecoveryCode.validate(recovery_code):
        return jsonify({'error': 'Invalid recovery code format'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, auth_hash, vault_params, encrypted_master,
                           recovery_vault, recovery_params
                    FROM users WHERE username = %s
                """, (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'Invalid credentials'}), 401

                if not user['recovery_vault'] or not user['recovery_params']:
                    return jsonify({'error': 'Recovery not enabled for this account'}), 400

                vault = UserVault(
                    username=username,
                    auth_hash=user['auth_hash'],
                    vault_params=user['vault_params'],
                    encrypted_master=user['encrypted_master'],
                    recovery_vault=user['recovery_vault'],
                    recovery_params=user['recovery_params'],
                )

                try:
                    new_vault = e2e.recover_account(
                        username, recovery_code, new_password, vault
                    )
                except Exception:
                    audit(conn, user['id'], 'RECOVERY_FAILED')
                    return jsonify({'error': 'Invalid recovery code'}), 401

                cur.execute("""
                    UPDATE users
                    SET auth_hash = %s, vault_params = %s, encrypted_master = %s,
                        login_attempts = 0, locked_until = NULL, updated_at = NOW()
                    WHERE id = %s
                """, (
                    new_vault.auth_hash,
                    safe_json(new_vault.vault_params),
                    safe_json(new_vault.encrypted_master),
                    user['id'],
                ))
                audit(conn, user['id'], 'RECOVERY_SUCCESS')

        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Recovery failed")
        return jsonify({'error': 'Recovery failed'}), 500


@app.route('/api/validate-recovery', methods=['POST'])
def validate_recovery():
    code = (request.get_json() or {}).get('recovery_code', '')
    return jsonify({'valid': RecoveryCode.validate(code)}), 200


@app.route('/api/change-password', methods=['POST'])
@limiter.limit("5 per minute")
@token_required
def change_password():
    data = request.get_json() or {}
    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not current_password or not new_password:
        return jsonify({'error': 'Current password and new password required'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, auth_hash, vault_params, encrypted_master,
                           recovery_vault, recovery_params
                    FROM users WHERE id = %s
                """, (request.user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404

                vault = UserVault(
                    username=request.username,
                    auth_hash=user['auth_hash'],
                    vault_params=user['vault_params'],
                    encrypted_master=user['encrypted_master'],
                    recovery_vault=user['recovery_vault'],
                    recovery_params=user['recovery_params'],
                )

                if not e2e.verify_login(current_password, vault):
                    return jsonify({'error': 'Current password is incorrect'}), 401

                try:
                    new_vault = e2e.change_password(current_password, new_password, vault)
                except Exception:
                    return jsonify({'error': 'Password change failed'}), 500

                cur.execute("""
                    UPDATE users
                    SET auth_hash = %s, vault_params = %s, encrypted_master = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (
                    new_vault.auth_hash,
                    safe_json(new_vault.vault_params),
                    safe_json(new_vault.encrypted_master),
                    request.user_id,
                ))
                audit(conn, request.user_id, 'PASSWORD_CHANGED')

        return jsonify({
            'success': True,
            'vault': {
                'vault_params': new_vault.vault_params,
                'encrypted_master': new_vault.encrypted_master,
            },
        }), 200
    except Exception:
        logger.exception("Change password failed")
        return jsonify({'error': 'Password change failed'}), 500


@app.route('/api/delete-account', methods=['POST'])
@limiter.limit("3 per minute")
@token_required
def delete_account():
    data = request.get_json() or {}
    password = data.get('password')

    if not password:
        return jsonify({'error': 'Password required'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, auth_hash, vault_params, encrypted_master
                    FROM users WHERE id = %s
                """, (request.user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404

                vault = UserVault(
                    username=request.username,
                    auth_hash=user['auth_hash'],
                    vault_params=user['vault_params'],
                    encrypted_master=user['encrypted_master'],
                )

                if not e2e.verify_login(password, vault):
                    return jsonify({'error': 'Invalid password'}), 401

                audit(conn, request.user_id, 'ACCOUNT_DELETED')
                cur.execute("UPDATE audit_log SET user_id = NULL WHERE user_id = %s", (request.user_id,))
                cur.execute("DELETE FROM users WHERE id = %s", (request.user_id,))

        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Delete account failed")
        return jsonify({'error': 'Account deletion failed'}), 500


# --- Admin Routes ---

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS total FROM users")
                total_users = cur.fetchone()['total']

                cur.execute("""
                    SELECT COUNT(*) AS active FROM users
                    WHERE last_login >= NOW() - INTERVAL '30 days'
                """)
                active_30d = cur.fetchone()['active']

                cur.execute("""
                    SELECT COUNT(*) AS active FROM users
                    WHERE last_login >= NOW() - INTERVAL '7 days'
                """)
                active_7d = cur.fetchone()['active']

                cur.execute("SELECT COUNT(*) AS total FROM encrypted_documents")
                total_docs = cur.fetchone()['total']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action = 'ACCOUNT_LOCKED'
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                lockouts_30d = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action = 'LOGIN_SUCCESS'
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                logins_success = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action = 'LOGIN_FAILED'
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                logins_failed = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE created_at >= NOW() - INTERVAL '7 days'
                """)
                new_users_7d = cur.fetchone()['cnt']

        return jsonify({
            'total_users': total_users,
            'active_users_30d': active_30d,
            'active_users_7d': active_7d,
            'total_documents': total_docs,
            'avg_docs_per_user': round(total_docs / total_users, 1) if total_users > 0 else 0,
            'lockouts_30d': lockouts_30d,
            'logins_success_30d': logins_success,
            'logins_failed_30d': logins_failed,
            'new_users_7d': new_users_7d,
        }), 200
    except Exception:
        logger.exception("Admin stats failed")
        return jsonify({'error': 'Failed to retrieve stats'}), 500


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_users():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.username, u.created_at, u.last_login,
                           u.login_attempts, u.locked_until, u.is_admin,
                           COUNT(d.id) AS doc_count
                    FROM users u
                    LEFT JOIN encrypted_documents d ON d.user_id = u.id
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                """)
                users = cur.fetchall()
        return jsonify({
            'users': [{
                'id': u['id'],
                'username': u['username'],
                'created_at': u['created_at'].isoformat() if u['created_at'] else None,
                'last_login': u['last_login'].isoformat() if u['last_login'] else None,
                'login_attempts': u['login_attempts'],
                'locked_until': u['locked_until'].isoformat() if u['locked_until'] else None,
                'is_admin': bool(u['is_admin']),
                'doc_count': u['doc_count'],
            } for u in users]
        }), 200
    except Exception:
        logger.exception("Admin users failed")
        return jsonify({'error': 'Failed to retrieve users'}), 500


@app.route('/api/admin/users/<int:user_id>/lock', methods=['POST'])
@admin_required
def admin_lock_user(user_id):
    if user_id == request.user_id:
        return jsonify({'error': 'Cannot lock your own account'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                if not cur.fetchone():
                    return jsonify({'error': 'User not found'}), 404
                # Lock indefinitely (far future) — admin must manually unlock
                locked_until = datetime.now(timezone.utc) + timedelta(days=36500)
                cur.execute(
                    "UPDATE users SET locked_until = %s WHERE id = %s",
                    (locked_until, user_id),
                )
                audit(conn, request.user_id, f'ADMIN_LOCK_USER:{user_id}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Admin lock user failed")
        return jsonify({'error': 'Failed to lock user'}), 500


@app.route('/api/admin/users/<int:user_id>/unlock', methods=['POST'])
@admin_required
def admin_unlock_user(user_id):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                if not cur.fetchone():
                    return jsonify({'error': 'User not found'}), 404
                cur.execute(
                    "UPDATE users SET locked_until = NULL, login_attempts = 0 WHERE id = %s",
                    (user_id,),
                )
                audit(conn, request.user_id, f'ADMIN_UNLOCK_USER:{user_id}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Admin unlock user failed")
        return jsonify({'error': 'Failed to unlock user'}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    if user_id == request.user_id:
        return jsonify({'error': 'Cannot delete your own account'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                # Nullify audit_log references (FK has no ON DELETE action)
                cur.execute("UPDATE audit_log SET user_id = NULL WHERE user_id = %s", (user_id,))
                # CASCADE on encrypted_documents will delete all docs
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
                audit(conn, request.user_id, f'ADMIN_DELETE_USER:{user["username"]}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Admin delete user failed")
        return jsonify({'error': 'Failed to delete user'}), 500


@app.route('/api/admin/users/<int:user_id>/promote', methods=['POST'])
@admin_required
def admin_promote_user(user_id):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                cur.execute("UPDATE users SET is_admin = TRUE WHERE id = %s", (user_id,))
                audit(conn, request.user_id, f'ADMIN_PROMOTE:{user["username"]}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Admin promote failed")
        return jsonify({'error': 'Failed to promote user'}), 500


@app.route('/api/admin/users/<int:user_id>/demote', methods=['POST'])
@admin_required
def admin_demote_user(user_id):
    if user_id == request.user_id:
        return jsonify({'error': 'Cannot demote yourself'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                cur.execute("UPDATE users SET is_admin = FALSE WHERE id = %s", (user_id,))
                audit(conn, request.user_id, f'ADMIN_DEMOTE:{user["username"]}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Admin demote failed")
        return jsonify({'error': 'Failed to demote user'}), 500


@app.route('/api/admin/audit', methods=['GET'])
@admin_required
def admin_audit():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT a.id, a.user_id, u.username, a.action, a.ip_address, a.created_at
                    FROM audit_log a
                    LEFT JOIN users u ON u.id = a.user_id
                    ORDER BY a.created_at DESC
                    LIMIT 100
                """)
                entries = cur.fetchall()
        return jsonify({
            'entries': [{
                'id': e['id'],
                'user_id': e['user_id'],
                'username': e['username'],
                'action': e['action'],
                'ip_address': e['ip_address'],
                'created_at': e['created_at'].isoformat() if e['created_at'] else None,
            } for e in entries]
        }), 200
    except Exception:
        logger.exception("Admin audit failed")
        return jsonify({'error': 'Failed to retrieve audit log'}), 500


if __name__ == '__main__':
    init_db()
    logger.info("ciphra API — encrypted by design")
    logger.info(f"Database: {DATABASE_URL}")
    app.run(host='0.0.0.0', port=5000, debug=False)
