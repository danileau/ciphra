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
    logger.info("Database initialized")


# --- JWT ---
def generate_token(user_id: int, username: str) -> str:
    return jwt.encode({
        'user_id': user_id,
        'username': username,
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
                           login_attempts, locked_until
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
                    token = generate_token(user['id'], username)
                    return jsonify({
                        'success': True,
                        'token': token,
                        'username': username,
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


@app.route('/api/validate-recovery', methods=['POST'])
def validate_recovery():
    code = (request.get_json() or {}).get('recovery_code', '')
    return jsonify({'valid': RecoveryCode.validate(code)}), 200


if __name__ == '__main__':
    init_db()
    logger.info("ciphra API — encrypted by design")
    logger.info(f"Database: {DATABASE_URL}")
    app.run(host='0.0.0.0', port=5000, debug=False)
