"""
ciphra — API Server
Thin encrypted blob store. The server never sees plaintext health data.
"""

import os
import re
import json
import base64
import hashlib
import hmac
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
from werkzeug.middleware.proxy_fix import ProxyFix

# --- Config ---
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://ciphra:ciphra@localhost/ciphra')
# JWT secret MUST be provided via env. A random fallback would invalidate all
# sessions on every restart (availability issue) and silently hide misconfig.
SECRET_KEY = os.environ.get('SECRET_KEY') or os.environ.get('JWT_SECRET')
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY (or JWT_SECRET) env var is required and must be ≥32 chars. "
        "Generate with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# --- Flask ---
app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

# Cap request body to 2 MiB. Prevents authenticated DoS via unbounded
# document upload. Single largest legitimate payload (export-import diary
# bundle) sits well under this; tune via MAX_REQUEST_BYTES env if needed.
app.config['MAX_CONTENT_LENGTH'] = int(
    os.environ.get('MAX_REQUEST_BYTES', 2 * 1024 * 1024)
)

# Trust nginx-supplied X-Forwarded-* headers ONE proxy hop deep so
# request.is_secure / get_remote_address / HSTS gating reflect the real
# client. Without this the rate-limiter sees the LB IP and HSTS never
# fires in prod (the security review's LB-1 finding).
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# CORS: restrict to configured app origins. Comma-separated list in CORS_ORIGINS,
# or '*' for wildcard (dev only). Default matches the docker-compose dev setup.
_raw_cors = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:8080')
CORS_ORIGINS = [o.strip() for o in _raw_cors.split(',') if o.strip()]
CORS(app, supports_credentials=True, origins=CORS_ORIGINS)

# Storage: redis in production (survives `systemctl restart ciphra-app`,
# shared across gunicorn workers). Falls back to in-memory if REDIS_URL
# is unset — fine for local dev + tests, NOT for prod (counters reset on
# restart + are per-worker, so the effective limit becomes N_workers ×
# configured limit).
_RATELIMIT_STORAGE = os.environ.get('REDIS_URL', 'memory://')
limiter = Limiter(
    get_remote_address,
    app=app,
    storage_uri=_RATELIMIT_STORAGE,
    default_limits=["5000 per hour"],
    enabled=os.environ.get('CIPHRA_DEV_MOCKS') != '1',
)


@app.errorhandler(413)
def _too_large(_e):
    return jsonify({'error': 'request_too_large'}), 413


# SAST/DAST F5 — keep every API error in the JSON shape clients expect.
# Flask's default error pages are HTML ("The browser or proxy sent a request
# that this server could not understand…") which both leaks the framework and
# breaks the API contract for callers doing res.json(). These handlers catch
# only RAISED HTTPExceptions (e.g. malformed-JSON 400, unknown route 404,
# wrong method 405); explicit `return jsonify(...), 4xx` returns are untouched.
@app.errorhandler(400)
def _bad_request(_e):
    return jsonify({'error': 'bad_request'}), 400


@app.errorhandler(404)
def _not_found(_e):
    return jsonify({'error': 'not_found'}), 404


@app.errorhandler(405)
def _method_not_allowed(_e):
    return jsonify({'error': 'method_not_allowed'}), 405


@app.after_request
def set_security_headers(resp):
    """Defense-in-depth headers. CSP is strict: no inline scripts, no eval,
    scripts must come from same origin. The argon2 lib is served from /static
    and hash-pinned via SRI in the frontend."""
    resp.headers.setdefault('Content-Security-Policy',
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'DENY')
    resp.headers.setdefault('Referrer-Policy', 'same-origin')
    resp.headers.setdefault('Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=()'
    )
    # Only set HSTS when the request itself was HTTPS — avoids locking dev
    # setups out of plain-http localhost.
    if request.is_secure:
        resp.headers.setdefault(
            'Strict-Transport-Security', 'max-age=31536000; includeSubDomains'
        )
    return resp

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
                    auth_params TEXT NOT NULL,
                    vault_params TEXT NOT NULL,
                    encrypted_master TEXT NOT NULL,
                    recovery_vault TEXT,
                    recovery_params TEXT,
                    recovery_auth TEXT,
                    is_admin BOOLEAN DEFAULT FALSE,
                    last_login TIMESTAMP WITH TIME ZONE,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP WITH TIME ZONE,
                    registration_source VARCHAR(16) DEFAULT 'web',
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
            # Family sharing (Approach C): source user wraps their master_key
            # with a family-code-derived key. Caregiver can unwrap and gets
            # equal access. Server sees the link metadata (who shares with
            # whom) but not the family code or the underlying health data.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS family_grants (
                    id SERIAL PRIMARY KEY,
                    source_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    label TEXT NOT NULL,
                    grant_params TEXT NOT NULL,
                    grant_auth TEXT NOT NULL,
                    wrapped_master TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    claimed_at TIMESTAMP WITH TIME ZONE,
                    revoked_at TIMESTAMP WITH TIME ZONE
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_user ON encrypted_documents(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_family_source ON family_grants(source_user_id) WHERE revoked_at IS NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_family_claimed ON family_grants(claimed_by_user_id) WHERE revoked_at IS NULL")
            # Migrations for existing databases. Localhost-only — if legacy rows
            # still use the old (server-side-KDF) auth_hash format, operator must
            # reset the users table manually.
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN auth_params TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN recovery_auth TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE family_grants ADD COLUMN last_access_at TIMESTAMP WITH TIME ZONE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            # Registration source — one metadata bit per user, used by the
            # /admin dashboard to count epilepc migrations. No content leak.
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN registration_source VARCHAR(16) DEFAULT 'web';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            # Track-3 3.4 — bulk-import idempotency. `client_key` is an OPAQUE,
            # server-blind token the client supplies (sha256(username:source_id))
            # so a retried migration batch is a no-op instead of duplicating docs.
            # Nullable + a PARTIAL unique index → existing rows and all normal
            # single-doc saves (which never set it) stay NULL and never collide.
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE encrypted_documents ADD COLUMN client_key TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_user_clientkey
                ON encrypted_documents (user_id, client_key) WHERE client_key IS NOT NULL
            """)
    logger.info("Database initialized")


# --- JWT ---
def generate_token(user_id: int, username: str, is_admin: bool = False, pwd_version: int = 1) -> str:
    return jwt.encode({
        'user_id': user_id,
        'username': username,
        'is_admin': is_admin,
        'pv': pwd_version,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc),
    }, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _current_password_version(user_id: int) -> int:
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT password_version FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                return int(row['password_version']) if row and row['password_version'] else 1
    except Exception:
        return 1


def _decode_and_verify_token(auth_header: str):
    """Returns decoded payload if token valid and password_version matches DB,
    else raises. A password change increments pv and invalidates old tokens."""
    if not auth_header.startswith('Bearer '):
        raise PermissionError('missing')
    payload = jwt.decode(auth_header[7:], SECRET_KEY, algorithms=[JWT_ALGORITHM])
    current_pv = _current_password_version(payload['user_id'])
    if int(payload.get('pv', 1)) != current_pv:
        raise PermissionError('stale')
    return payload


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            payload = _decode_and_verify_token(request.headers.get('Authorization', ''))
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, PermissionError):
            return jsonify({'error': 'Token invalid or expired'}), 401
        request.user_id = payload['user_id']
        request.username = payload['username']
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            payload = _decode_and_verify_token(request.headers.get('Authorization', ''))
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, PermissionError):
            return jsonify({'error': 'Token invalid or expired'}), 401
        request.user_id = payload['user_id']
        request.username = payload['username']
        if not payload.get('is_admin', False):
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


AUDIT_RETENTION_DAYS = int(os.environ.get('AUDIT_RETENTION_DAYS', 90))
AUDIT_IP_ANONYMIZE_DAYS = int(os.environ.get('AUDIT_IP_ANONYMIZE_DAYS', 30))


def _anonymize_ip(ip):
    """Truncate last octet of IPv4 / last 80 bits of IPv6. Keeps city-level
    signal for forensic use but strips the unique identifier (nDSG Art. 6)."""
    if not ip:
        return None
    if ':' in ip:  # IPv6
        parts = ip.split(':')
        return ':'.join(parts[:3]) + '::' if len(parts) > 2 else '::'
    parts = ip.split('.')
    if len(parts) == 4:
        return '.'.join(parts[:3]) + '.0'
    return None


def audit(conn, user_id, action):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO audit_log (user_id, action, ip_address) VALUES (%s, %s, %s)",
            (user_id, action, request.remote_addr),
        )


def apply_audit_retention():
    """Delete audit rows older than AUDIT_RETENTION_DAYS; anonymize IPs older
    than AUDIT_IP_ANONYMIZE_DAYS. Idempotent — safe to call on startup and cron."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM audit_log WHERE created_at < NOW() - (%s || ' days')::interval",
                    (AUDIT_RETENTION_DAYS,),
                )
                deleted = cur.rowcount
                cur.execute("""
                    SELECT id, ip_address FROM audit_log
                    WHERE ip_address IS NOT NULL
                      AND created_at < NOW() - (%s || ' days')::interval
                """, (AUDIT_IP_ANONYMIZE_DAYS,))
                rows = cur.fetchall()
                for r in rows:
                    anon = _anonymize_ip(r['ip_address'])
                    cur.execute(
                        "UPDATE audit_log SET ip_address = %s WHERE id = %s",
                        (anon, r['id']),
                    )
                logger.info(f"Audit retention: deleted {deleted}, anonymized {len(rows)}")
    except Exception:
        logger.exception("Audit retention run failed")


# --- Crypto ---
# All cryptographic key derivation happens in the browser.
# The server only ever sees hashes and encrypted blobs.

USERNAME_RE = re.compile(r'^[a-z0-9_]{3,64}$')


def safe_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (bytes, bytearray)):
        return value.decode()
    return str(value)


def hash_auth_key(b64_auth_key: str) -> str:
    """Server stores SHA-256(auth_key); client sends auth_key.
    A DB leak exposes only the hash-of-hash, not a replay credential."""
    raw = base64.b64decode(b64_auth_key)
    return base64.b64encode(hashlib.sha256(raw).digest()).decode('ascii')


def verify_auth(b64_auth_key: str, stored_hash: str) -> bool:
    if not b64_auth_key or not stored_hash:
        return False
    try:
        return hmac.compare_digest(hash_auth_key(b64_auth_key), stored_hash)
    except Exception:
        return False


_SENSITIVE_FIELDS = (
    'recovery_key',
    'recovery_auth',
    'auth_hash',
    'auth_key',
    'current_auth_key',
    'encrypted_master',
    'wrapped_master',
    'family_key',
    'family_code',
    'password',
)


def _redact_sensitive(data: dict) -> None:
    """Mutate `data` in place, deleting any sensitive field present.

    Called immediately after each sensitive endpoint has copied the
    fields it needs into local variables. Defensive: if a future
    `logger.exception` or custom error handler dumps `data`, the
    secrets are already gone. Operationally a no-op for current code
    paths because the existing `logger.exception` calls only log the
    message + traceback, never `data`.
    """
    for k in _SENSITIVE_FIELDS:
        if k in data:
            data.pop(k, None)


def valid_b64(value, min_bytes=1, max_bytes=4096) -> bool:
    if not isinstance(value, str):
        return False
    try:
        raw = base64.b64decode(value, validate=True)
        return min_bytes <= len(raw) <= max_bytes
    except Exception:
        return False


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
# Tightened from 5/min to 3/min specifically to slow down username
# enumeration: a 409 response still tells a script the username exists.
# Combined with the generic error message below (`registration_failed`
# instead of "Username already exists") an attacker now has neither a
# distinguishing message nor cheap throughput.
@limiter.limit("3 per minute")
def register():
    """Accepts a pre-built vault bundle from the browser. The server never
    sees the password, master_key, or recovery_code — those stay on device."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    auth_hash = data.get('auth_hash')
    auth_params = data.get('auth_params')
    vault_params = data.get('vault_params')
    encrypted_master = data.get('encrypted_master')
    recovery_vault = data.get('recovery_vault')
    recovery_params = data.get('recovery_params')
    recovery_auth = data.get('recovery_auth')
    # Optional metadata-only flag — the /migrate flow passes 'migrate' so
    # the /admin dashboard can count epilepc migrations vs. organic signups.
    # Unknown values are silently coerced to 'web' (no client-driven leak).
    raw_source = (data.get('source') or 'web')
    registration_source = raw_source if raw_source in ('web', 'migrate') else 'web'

    if not username or not USERNAME_RE.match(username):
        return jsonify({'error': 'Invalid username'}), 400
    if not valid_b64(auth_hash, 32, 32):
        return jsonify({'error': 'Invalid auth_hash'}), 400
    for field, val in (('auth_params', auth_params),
                       ('vault_params', vault_params),
                       ('encrypted_master', encrypted_master)):
        if not isinstance(val, str) or len(val) < 1 or len(val) > 8192:
            return jsonify({'error': f'Invalid {field}'}), 400
    # Recovery fields all-or-nothing
    has_recovery = any([recovery_vault, recovery_params, recovery_auth])
    if has_recovery and not (recovery_vault and recovery_params and valid_b64(recovery_auth, 32, 32)):
        return jsonify({'error': 'Incomplete recovery bundle'}), 400

    _redact_sensitive(data)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cur.fetchone():
                    # Generic error — same status code/string whether the
                    # username is taken, malformed, or the bundle is bad.
                    # The client distinguishes via the user-facing copy
                    # ("try another username"), the server doesn't disclose.
                    return jsonify({'error': 'registration_failed'}), 409

                cur.execute("""
                    INSERT INTO users (username, auth_hash, auth_params, vault_params,
                                       encrypted_master, recovery_vault, recovery_params,
                                       recovery_auth, registration_source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (
                    username, auth_hash, auth_params, vault_params,
                    encrypted_master, recovery_vault, recovery_params, recovery_auth,
                    registration_source,
                ))
                user_id = cur.fetchone()['id']
                audit(conn, user_id, 'REGISTER')

        return jsonify({'success': True, 'username': username, 'user_id': user_id}), 201
    except Exception:
        logger.exception("Registration failed")
        return jsonify({'error': 'Registration failed'}), 500


def _encode_vault_params(params: dict) -> str:
    """Serialize Argon2 params EXACTLY as the client's encodeVaultParams does:
    `btoa(JSON.stringify(obj))`.

    The separators matter and are the whole point of this helper. A real
    user's blob is produced by JSON.stringify, which is COMPACT — no space
    after ',' or ':'. Python's json.dumps defaults to `', '` / `': '`, so a
    server-generated blob was 192 base64 chars where a real one is ~156. That
    single formatting gap turned the anti-enumeration fake params into an
    account-existence oracle: one unauthenticated /api/login/init told you
    whether a username was registered. Anything that emits vault params for an
    unknown user MUST go through here so fake and real stay byte-for-byte
    indistinguishable in shape.
    """
    return base64.b64encode(
        json.dumps(params, separators=(',', ':')).encode()
    ).decode('ascii')


def _fake_auth_params(username: str) -> str:
    """Deterministic fake params for unknown users, to thwart enumeration.
    Uses HMAC(SECRET_KEY, username) as the salt so timing + response shape
    match a real user. Params must match what the client expects — including
    the compact JSON serialization (see _encode_vault_params)."""
    fake_salt = hmac.new(SECRET_KEY.encode(), username.encode(), hashlib.sha256).digest()
    params = {
        'memory_cost': 65536,
        'time_cost': 3,
        'parallelism': 4,
        'hash_len': 32,
        'type': 'ID',
        'salt': base64.b64encode(fake_salt).decode('ascii'),
    }
    return _encode_vault_params(params)


@app.route('/api/login/init', methods=['POST'])
@limiter.limit("20 per minute")
def login_init():
    """Returns the Argon2 params the client needs to derive auth_key.
    Always returns params (fake for unknown users) to prevent enumeration."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    if not username or not USERNAME_RE.match(username):
        return jsonify({'error': 'Invalid username'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT auth_params FROM users WHERE username = %s", (username,))
                row = cur.fetchone()
                auth_params = row['auth_params'] if row and row['auth_params'] else _fake_auth_params(username)
        return jsonify({'auth_params': auth_params}), 200
    except Exception:
        logger.exception("login_init failed")
        return jsonify({'error': 'Login init failed'}), 500


@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    auth_key = data.get('auth_key')
    if not username or not USERNAME_RE.match(username) or not valid_b64(auth_key, 32, 32):
        return jsonify({'error': 'Invalid credentials'}), 401

    _redact_sensitive(data)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, auth_hash, auth_params, vault_params, encrypted_master,
                           login_attempts, locked_until, is_admin, password_version,
                           registration_source
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

                if verify_auth(auth_key, user['auth_hash']):
                    cur.execute(
                        "UPDATE users SET login_attempts = 0, last_login = NOW() WHERE id = %s",
                        (user['id'],),
                    )
                    audit(conn, user['id'], 'LOGIN_SUCCESS')
                    is_admin = bool(user.get('is_admin', False))
                    token = generate_token(
                        user['id'], username, is_admin,
                        pwd_version=int(user.get('password_version') or 1),
                    )
                    return jsonify({
                        'success': True,
                        'token': token,
                        'username': username,
                        'is_admin': is_admin,
                        'registration_source': user.get('registration_source') or 'web',
                        'vault': {
                            'auth_params': user['auth_params'],
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
                    cur.execute(
                        "UPDATE users SET login_attempts=%s WHERE id=%s",
                        (attempts, user['id']),
                    )
                    audit(conn, user['id'], 'LOGIN_FAILED')
                    return jsonify({'error': 'Invalid credentials'}), 401
    except Exception:
        logger.exception("Login failed")
        return jsonify({'error': 'Login failed'}), 500


DOCUMENT_QUOTA_PER_USER = int(os.environ.get('DOCUMENT_QUOTA_PER_USER', 8000))
"""Per-user document cap. Generous: ~10y of daily entries + diary + events.
Backstop against authenticated DoS via mass-insert. Tune via env."""


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
                cur.execute(
                    "SELECT COUNT(*) AS n FROM encrypted_documents WHERE user_id = %s",
                    (request.user_id,),
                )
                count = cur.fetchone()['n']
                if count >= DOCUMENT_QUOTA_PER_USER:
                    return jsonify({'error': 'quota_exceeded'}), 429
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


# Track-3 3.4 — bulk import. One round-trip stores up to BATCH_MAX_DOCS encrypted
# docs (vs one request per doc, the reason for the migration rate-limit bump).
# Partial-success: each blob gets its own status; one bad blob never fails the
# batch. Idempotent via the opaque client_key (ON CONFLICT DO NOTHING), so a
# retried/resumed migration re-sends the same batch and gets `skipped`, not
# duplicates. Additive — the single POST /api/documents above is unchanged.
BATCH_MAX_DOCS = int(os.environ.get('BATCH_MAX_DOCS', 100))


@app.route('/api/documents/batch', methods=['POST'])
@limiter.limit("30 per minute")
@token_required
def store_documents_batch():
    data = request.get_json() or {}
    docs = data.get('documents')
    if not isinstance(docs, list) or len(docs) == 0:
        return jsonify({'error': 'documents must be a non-empty array'}), 400
    if len(docs) > BATCH_MAX_DOCS:
        return jsonify({'error': 'batch_too_large', 'max': BATCH_MAX_DOCS}), 400

    results = []
    created = skipped = errored = 0
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS n FROM encrypted_documents WHERE user_id = %s",
                    (request.user_id,),
                )
                count = cur.fetchone()['n']
                for d in docs:
                    ck = d.get('client_key') if isinstance(d, dict) else None
                    enc = d.get('encrypted_data') if isinstance(d, dict) else None
                    if not enc:
                        results.append({'client_key': ck, 'status': 'error', 'error': 'missing encrypted_data'})
                        errored += 1
                        continue
                    if count >= DOCUMENT_QUOTA_PER_USER:
                        results.append({'client_key': ck, 'status': 'error', 'error': 'quota_exceeded'})
                        errored += 1
                        continue
                    if ck:
                        # `WHERE client_key IS NOT NULL` is REQUIRED, not decorative.
                        # uq_docs_user_clientkey is a PARTIAL unique index, and
                        # Postgres will only infer a partial index for ON CONFLICT
                        # if the statement repeats its predicate. Without it every
                        # call raised InvalidColumnReference ("no unique or
                        # exclusion constraint matching the ON CONFLICT
                        # specification") -> 500 -> the client fell back to one
                        # request per document. See docs/incidents/INC-001.md.
                        cur.execute("""
                            INSERT INTO encrypted_documents (user_id, encrypted_data, client_key)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL
                            DO NOTHING
                            RETURNING id
                        """, (request.user_id, enc, ck))
                    else:
                        cur.execute("""
                            INSERT INTO encrypted_documents (user_id, encrypted_data)
                            VALUES (%s, %s) RETURNING id
                        """, (request.user_id, enc))
                    row = cur.fetchone()
                    if row:
                        results.append({'client_key': ck, 'status': 'created', 'id': row['id']})
                        created += 1
                        count += 1
                    else:
                        # ON CONFLICT did nothing → this client_key already exists
                        # for this user (idempotent replay).
                        results.append({'client_key': ck, 'status': 'skipped'})
                        skipped += 1
                if created:
                    audit(conn, request.user_id, 'DOC_BATCH_CREATED')
        return jsonify({
            'results': results,
            'created': created,
            'skipped': skipped,
            'errored': errored,
        }), 200
    except Exception:
        logger.exception("Batch store failed")
        return jsonify({'error': 'Failed to store documents'}), 500


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


def _fake_recovery_params(username: str) -> str:
    fake_salt = hmac.new(
        SECRET_KEY.encode(), (username + ':recovery_salt').encode(), hashlib.sha256
    ).digest()
    params = {
        'memory_cost': 65536, 'time_cost': 3, 'parallelism': 4,
        'hash_len': 32, 'type': 'ID',
        'salt': base64.b64encode(fake_salt).decode('ascii'),
    }
    return _encode_vault_params(params)


def _fake_recovery_vault(username: str) -> str:
    # 60 bytes = nonce(12) + tag(16) + ct(32) — same shape as a real wrapped master key
    buf = b''
    counter = 0
    while len(buf) < 60:
        buf += hmac.new(
            SECRET_KEY.encode(),
            f'{username}:recovery_vault:{counter}'.encode(),
            hashlib.sha256,
        ).digest()
        counter += 1
    return base64.b64encode(buf[:60]).decode('ascii')


@app.route('/api/recover/init', methods=['POST'])
@limiter.limit("5 per minute")
def recover_init():
    """Returns recovery_params + recovery_vault so the browser can decrypt
    master_key locally using the recovery code.

    Always returns 200 with structurally valid values — fake deterministic
    blobs for unknown users or users without recovery. Prevents enumeration
    of who has an account and who has recovery enabled. Real attempts fail
    at the subsequent /api/recover step when the recovery_key hash mismatches."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    if not username or not USERNAME_RE.match(username):
        return jsonify({'error': 'Invalid username'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT recovery_params, recovery_vault
                    FROM users WHERE username = %s
                """, (username,))
                user = cur.fetchone()
                if user and user['recovery_params'] and user['recovery_vault']:
                    return jsonify({
                        'recovery_params': user['recovery_params'],
                        'recovery_vault': user['recovery_vault'],
                    }), 200
        return jsonify({
            'recovery_params': _fake_recovery_params(username),
            'recovery_vault': _fake_recovery_vault(username),
        }), 200
    except Exception:
        logger.exception("recover_init failed")
        return jsonify({
            'recovery_params': _fake_recovery_params(username),
            'recovery_vault': _fake_recovery_vault(username),
        }), 200


@app.route('/api/recover', methods=['POST'])
@limiter.limit("5 per minute")
def recover():
    """Client has decrypted master_key via recovery code and re-wrapped it with
    a new password. Server verifies SHA-256(recovery_key) against stored
    recovery_auth, then swaps auth/vault (recovery_vault stays untouched)."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    recovery_key = data.get('recovery_key')
    auth_hash = data.get('auth_hash')
    auth_params = data.get('auth_params')
    vault_params = data.get('vault_params')
    encrypted_master = data.get('encrypted_master')

    if not username or not USERNAME_RE.match(username):
        return jsonify({'error': 'Invalid request'}), 400
    if not valid_b64(recovery_key, 32, 32) or not valid_b64(auth_hash, 32, 32):
        return jsonify({'error': 'Invalid credentials'}), 401
    for field, val in (('auth_params', auth_params), ('vault_params', vault_params),
                       ('encrypted_master', encrypted_master)):
        if not isinstance(val, str) or not (1 <= len(val) <= 8192):
            return jsonify({'error': f'Invalid {field}'}), 400

    # Redact secrets from the request-data dict before any downstream
    # code (current or future) might log it.
    _redact_sensitive(data)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, recovery_auth, recovery_attempts, locked_until
                    FROM users WHERE username = %s
                """, (username,))
                user = cur.fetchone()
                if not user or not user['recovery_auth']:
                    return jsonify({'error': 'Invalid recovery code'}), 401

                # Same lockout gate as login — 3 failed recoveries → 15 min lock
                if user['locked_until']:
                    locked = user['locked_until']
                    if locked.tzinfo is None:
                        locked = locked.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) < locked:
                        return jsonify({'error': 'Account temporarily locked'}), 429

                if not verify_auth(recovery_key, user['recovery_auth']):
                    attempts = (user['recovery_attempts'] or 0) + 1
                    if attempts >= 3:
                        locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                        cur.execute(
                            "UPDATE users SET recovery_attempts=%s, locked_until=%s WHERE id=%s",
                            (attempts, locked_until, user['id']),
                        )
                        audit(conn, user['id'], 'RECOVERY_LOCKED')
                        return jsonify({'error': 'Too many failed attempts. Locked 15 min'}), 429
                    cur.execute(
                        "UPDATE users SET recovery_attempts=%s WHERE id=%s",
                        (attempts, user['id']),
                    )
                    audit(conn, user['id'], 'RECOVERY_FAILED')
                    return jsonify({'error': 'Invalid recovery code'}), 401

                cur.execute("""
                    UPDATE users
                    SET auth_hash = %s, auth_params = %s, vault_params = %s,
                        encrypted_master = %s, login_attempts = 0,
                        recovery_attempts = 0, locked_until = NULL,
                        password_version = COALESCE(password_version, 1) + 1,
                        updated_at = NOW()
                    WHERE id = %s
                """, (
                    auth_hash, auth_params, vault_params, encrypted_master, user['id'],
                ))
                audit(conn, user['id'], 'RECOVERY_SUCCESS')

        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Recovery failed")
        return jsonify({'error': 'Recovery failed'}), 500


@app.route('/api/change-password', methods=['POST'])
@limiter.limit("5 per minute")
@token_required
def change_password():
    """Client has re-wrapped its master_key under a new password. Server
    verifies current auth_key (to prove knowledge of current password), then
    swaps the stored credentials."""
    data = request.get_json() or {}
    current_auth_key = data.get('current_auth_key')
    auth_hash = data.get('auth_hash')
    auth_params = data.get('auth_params')
    vault_params = data.get('vault_params')
    encrypted_master = data.get('encrypted_master')

    if not valid_b64(current_auth_key, 32, 32) or not valid_b64(auth_hash, 32, 32):
        return jsonify({'error': 'Invalid credentials'}), 400
    for field, val in (('auth_params', auth_params), ('vault_params', vault_params),
                       ('encrypted_master', encrypted_master)):
        if not isinstance(val, str) or not (1 <= len(val) <= 8192):
            return jsonify({'error': f'Invalid {field}'}), 400

    _redact_sensitive(data)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, auth_hash FROM users WHERE id = %s", (request.user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404

                if not verify_auth(current_auth_key, user['auth_hash']):
                    return jsonify({'error': 'Current password is incorrect'}), 401

                cur.execute("""
                    UPDATE users
                    SET auth_hash = %s, auth_params = %s, vault_params = %s,
                        encrypted_master = %s,
                        password_version = COALESCE(password_version, 1) + 1,
                        updated_at = NOW()
                    WHERE id = %s
                """, (
                    auth_hash, auth_params, vault_params, encrypted_master, request.user_id,
                ))
                audit(conn, request.user_id, 'PASSWORD_CHANGED')

        return jsonify({
            'success': True,
            'vault': {
                'auth_params': auth_params,
                'vault_params': vault_params,
                'encrypted_master': encrypted_master,
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
    auth_key = data.get('auth_key')
    if not valid_b64(auth_key, 32, 32):
        return jsonify({'error': 'Invalid credentials'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, auth_hash FROM users WHERE id = %s", (request.user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404

                if not verify_auth(auth_key, user['auth_hash']):
                    return jsonify({'error': 'Invalid password'}), 401

                audit(conn, request.user_id, 'ACCOUNT_DELETED')
                # Full erasure (GDPR Art. 17): drop user_id AND ip_address from
                # residual audit rows so nothing ties back to this person.
                cur.execute(
                    "UPDATE audit_log SET user_id = NULL, ip_address = NULL WHERE user_id = %s",
                    (request.user_id,),
                )
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

                # CIPH-pi24-5b — today-lens + deletions-count.
                # Failed-logins 30d hides a today spike behind a 30d denominator;
                # today counters are the signal layer for an operator scanning
                # the dashboard once a day. Deletions covers a gap that wasn't
                # being surfaced at all.
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action = 'LOGIN_FAILED'
                    AND created_at >= NOW() - INTERVAL '24 hours'
                """)
                logins_failed_today = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action = 'ACCOUNT_LOCKED'
                    AND created_at >= NOW() - INTERVAL '24 hours'
                """)
                lockouts_today = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE created_at >= NOW() - INTERVAL '24 hours'
                """)
                new_users_today = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action LIKE 'ADMIN_DELETE_USER%'
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                deletions_30d = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action LIKE 'ADMIN_DELETE_USER%'
                    AND created_at >= NOW() - INTERVAL '24 hours'
                """)
                deletions_today = cur.fetchone()['cnt']

                # Slice 2 — migration metrics. Counts users whose registration
                # came via the epilepc /migrate flow (server-visible bit, no
                # content leak). Read [[project_epilepc_lifecycle_plan]] for
                # the design.
                cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE registration_source = 'migrate'")
                migrations_total = cur.fetchone()['cnt']
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE registration_source = 'migrate'
                    AND created_at >= NOW() - INTERVAL '7 days'
                """)
                migrations_7d = cur.fetchone()['cnt']
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE registration_source = 'migrate'
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                migrations_30d = cur.fetchone()['cnt']
                cur.execute("""
                    SELECT MAX(created_at) AS last_at FROM users
                    WHERE registration_source = 'migrate'
                """)
                last_migration_row = cur.fetchone()
                last_migration_at = last_migration_row['last_at'].isoformat() if last_migration_row and last_migration_row['last_at'] else None

                # Dormant accounts — users who haven't logged in for >90 days
                # and aren't brand-new (registered >90 days ago).
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE created_at < NOW() - INTERVAL '90 days'
                    AND (last_login IS NULL OR last_login < NOW() - INTERVAL '90 days')
                """)
                dormant_90d = cur.fetchone()['cnt']

        return jsonify({
            'total_users': total_users,
            'active_users_30d': active_30d,
            'active_users_7d': active_7d,
            'total_documents': total_docs,
            'avg_docs_per_user': round(total_docs / total_users, 1) if total_users > 0 else 0,
            'lockouts_30d': lockouts_30d,
            'lockouts_today': lockouts_today,
            'logins_success_30d': logins_success,
            'logins_failed_30d': logins_failed,
            'logins_failed_today': logins_failed_today,
            'new_users_7d': new_users_7d,
            'new_users_today': new_users_today,
            'deletions_30d': deletions_30d,
            'deletions_today': deletions_today,
            'migrations_total': migrations_total,
            'migrations_7d': migrations_7d,
            'migrations_30d': migrations_30d,
            'last_migration_at': last_migration_at,
            'dormant_90d': dormant_90d,
        }), 200
    except Exception:
        logger.exception("Admin stats failed")
        return jsonify({'error': 'Failed to retrieve stats'}), 500


@app.route('/api/admin/stats/timeseries', methods=['GET'])
@admin_required
def admin_timeseries():
    """26-week sparkline series for the /admin dashboard.

    Returns one bucket per ISO-week, padded with zeros for weeks with no
    data so the sparkline stays a continuous 26-point line. Cheap query —
    weekly aggregation over a ~half-year window."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Last 26 ISO weeks worth of new users, broken down by source.
                cur.execute("""
                    SELECT
                        date_trunc('week', created_at) AS week,
                        SUM(CASE WHEN registration_source = 'migrate' THEN 1 ELSE 0 END) AS migrations,
                        COUNT(*) AS new_users
                    FROM users
                    WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '25 weeks'
                    GROUP BY week
                    ORDER BY week
                """)
                user_rows = cur.fetchall()

                cur.execute("""
                    SELECT
                        date_trunc('week', created_at) AS week,
                        COUNT(*) AS cnt
                    FROM audit_log
                    WHERE action = 'LOGIN_SUCCESS'
                    AND created_at >= date_trunc('week', NOW()) - INTERVAL '25 weeks'
                    GROUP BY week
                    ORDER BY week
                """)
                login_rows = cur.fetchall()

        # Pad to a fixed 26-point series so sparklines align across metrics.
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        # Anchor on Monday of the current week, walk back 25 weeks.
        current_week_start = now - timedelta(days=now.weekday(), hours=now.hour, minutes=now.minute, seconds=now.second, microseconds=now.microsecond)
        weeks = [(current_week_start - timedelta(weeks=25 - i)).date().isoformat() for i in range(26)]

        def to_series(rows, key):
            by_week = {row['week'].date().isoformat(): int(row[key]) for row in rows if row['week']}
            return [by_week.get(w, 0) for w in weeks]

        return jsonify({
            'weeks': weeks,
            'new_users_per_week': to_series(user_rows, 'new_users'),
            'migrations_per_week': to_series(user_rows, 'migrations'),
            'logins_per_week': to_series(login_rows, 'cnt'),
        }), 200
    except Exception:
        logger.exception("Admin timeseries failed")
        return jsonify({'error': 'Failed to retrieve timeseries'}), 500


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
                # Full erasure (GDPR Art. 17): null user_id AND ip_address so
                # deleted users can't be re-linked via IP forensics.
                cur.execute(
                    "UPDATE audit_log SET user_id = NULL, ip_address = NULL WHERE user_id = %s",
                    (user_id,),
                )
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
                # Never expose raw IP via the admin API. Show only anonymized
                # (network-level) IP. Forensic access requires direct DB query.
                'ip_address': _anonymize_ip(e['ip_address']),
                'created_at': e['created_at'].isoformat() if e['created_at'] else None,
            } for e in entries]
        }), 200
    except Exception:
        logger.exception("Admin audit failed")
        return jsonify({'error': 'Failed to retrieve audit log'}), 500


# ---------------------------------------------------------------------------
# Family sharing (Approach C)
# ---------------------------------------------------------------------------

@app.route('/api/family/grants', methods=['POST'])
@limiter.limit("20 per hour")
@token_required
def family_grant_create():
    data = request.get_json() or {}
    label = (data.get('label') or '').strip()
    grant_params = data.get('grant_params')
    grant_auth = data.get('grant_auth')
    wrapped_master = data.get('wrapped_master')

    if not label or len(label) > 64:
        return jsonify({'error': 'Invalid label'}), 400
    if not valid_b64(grant_auth, 32, 32):
        return jsonify({'error': 'Invalid grant_auth'}), 400
    for field, val in (('grant_params', grant_params), ('wrapped_master', wrapped_master)):
        if not isinstance(val, str) or not (1 <= len(val) <= 8192):
            return jsonify({'error': f'Invalid {field}'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO family_grants
                        (source_user_id, label, grant_params, grant_auth, wrapped_master)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at
                """, (request.user_id, label, grant_params, grant_auth, wrapped_master))
                row = cur.fetchone()
                audit(conn, request.user_id, 'FAMILY_GRANT_CREATED')
        return jsonify({
            'id': row['id'],
            'created_at': row['created_at'].isoformat(),
        }), 201
    except Exception:
        logger.exception("family_grant_create failed")
        return jsonify({'error': 'Grant creation failed'}), 500


@app.route('/api/family/grants', methods=['GET'])
@token_required
def family_grant_list():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT g.id, g.label, g.created_at, g.claimed_at, g.claimed_by_user_id,
                           g.last_access_at, u.username AS claimed_by_username
                    FROM family_grants g
                    LEFT JOIN users u ON u.id = g.claimed_by_user_id
                    WHERE g.source_user_id = %s AND g.revoked_at IS NULL
                    ORDER BY g.created_at DESC
                """, (request.user_id,))
                rows = cur.fetchall()
        return jsonify({
            'grants': [{
                'id': r['id'],
                'label': r['label'],
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                'claimed_at': r['claimed_at'].isoformat() if r['claimed_at'] else None,
                'claimed_by_username': r['claimed_by_username'],
                'last_access_at': r['last_access_at'].isoformat() if r['last_access_at'] else None,
            } for r in rows]
        }), 200
    except Exception:
        logger.exception("family_grant_list failed")
        return jsonify({'error': 'Failed to list grants'}), 500


@app.route('/api/family/claimed', methods=['GET'])
@token_required
def family_claimed_list():
    """Caregiver endpoint: return the grants this user has actively claimed
    (not revoked). Lets the client reconcile locally-cached family_link docs
    against server truth and flag ones that have been revoked by the patient."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT g.id, g.source_user_id, u.username AS source_username
                    FROM family_grants g
                    JOIN users u ON u.id = g.source_user_id
                    WHERE g.claimed_by_user_id = %s AND g.revoked_at IS NULL
                """, (request.user_id,))
                rows = cur.fetchall()
        return jsonify({
            'active': [
                {'grant_id': r['id'], 'source_user_id': r['source_user_id'],
                 'source_username': r['source_username']}
                for r in rows
            ]
        }), 200
    except Exception:
        logger.exception("family_claimed_list failed")
        return jsonify({'error': 'Failed to list claimed grants'}), 500


@app.route('/api/family/grants/revoke-all', methods=['POST'])
@token_required
def family_grant_revoke_all():
    """Panic revoke: cut every active grant the user has issued. Server-side
    access is stopped immediately; caregivers who already downloaded data
    keep those copies — revocation can't reach local caches."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE family_grants SET revoked_at = NOW()
                    WHERE source_user_id = %s AND revoked_at IS NULL
                """, (request.user_id,))
                count = cur.rowcount
                audit(conn, request.user_id, f'FAMILY_REVOKE_ALL:{count}')
        return jsonify({'success': True, 'revoked': count}), 200
    except Exception:
        logger.exception("family_grant_revoke_all failed")
        return jsonify({'error': 'Revoke failed'}), 500


@app.route('/api/family/grants/<int:grant_id>', methods=['DELETE'])
@token_required
def family_grant_revoke(grant_id):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE family_grants SET revoked_at = NOW()
                    WHERE id = %s AND source_user_id = %s AND revoked_at IS NULL
                """, (grant_id, request.user_id))
                if cur.rowcount == 0:
                    return jsonify({'error': 'Grant not found'}), 404
                audit(conn, request.user_id, f'FAMILY_GRANT_REVOKED:{grant_id}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("family_grant_revoke failed")
        return jsonify({'error': 'Revoke failed'}), 500


def _fake_grants_for_username(username: str):
    """Deterministic fake grant list for unknown users, to block enumeration."""
    fake = []
    for i in range(1):
        seed = hmac.new(
            SECRET_KEY.encode(), f'{username}:fake_grant:{i}'.encode(), hashlib.sha256
        ).digest()
        fake.append({
            'id': -abs(int.from_bytes(seed[:4], 'big')),
            'grant_params': _fake_recovery_params(f'{username}:fake:{i}'),
            'wrapped_master': _fake_recovery_vault(f'{username}:fake:{i}'),
            'grant_auth': base64.b64encode(seed[:32]).decode('ascii'),
        })
    return fake


@app.route('/api/family/grants/claim/init', methods=['POST'])
@limiter.limit("10 per minute")
@token_required
def family_grant_claim_init():
    """Given a source username, return all claimable grants so the caregiver
    client can test each against the family code locally. Fake list for
    unknown users (same anti-enumeration pattern as /login/init).

    SAST/DAST F1 — requires auth. The legit caller is always an authenticated
    caregiver (claiming itself needs a token), so this is no UX change, but it
    stops an ANONYMOUS party from harvesting `wrapped_master`/`grant_params`
    for any username (offline brute-force material). Family-code entropy
    (~49 bits + Argon2id) already makes that attack infeasible; gating behind
    a token makes harvesting attributable + rate-limit-bound to an account."""
    data = request.get_json() or {}
    source_username = (data.get('source_username') or '').strip().lower()
    if not source_username or not USERNAME_RE.match(source_username):
        return jsonify({'error': 'Invalid username'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT g.id, g.grant_params, g.wrapped_master, g.grant_auth
                    FROM family_grants g
                    JOIN users u ON u.id = g.source_user_id
                    WHERE u.username = %s AND g.revoked_at IS NULL
                """, (source_username,))
                rows = cur.fetchall()
                if rows:
                    return jsonify({'grants': [{
                        'id': r['id'],
                        'grant_params': r['grant_params'],
                        'wrapped_master': r['wrapped_master'],
                        'grant_auth': r['grant_auth'],
                    } for r in rows]}), 200
        return jsonify({'grants': _fake_grants_for_username(source_username)}), 200
    except Exception:
        logger.exception("family_grant_claim_init failed")
        return jsonify({'grants': _fake_grants_for_username(source_username)}), 200


@app.route('/api/family/grants/claim', methods=['POST'])
@limiter.limit("10 per minute")
@token_required
def family_grant_claim():
    data = request.get_json() or {}
    grant_id = data.get('grant_id')
    proof = data.get('proof')  # base64 family_key — server SHA-256s and compares
    if not isinstance(grant_id, int) or not valid_b64(proof, 32, 32):
        return jsonify({'error': 'Invalid request'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, source_user_id, claimed_by_user_id, grant_auth
                    FROM family_grants
                    WHERE id = %s AND revoked_at IS NULL
                """, (grant_id,))
                g = cur.fetchone()
                if not g:
                    return jsonify({'error': 'Grant not available'}), 404
                if g['source_user_id'] == request.user_id:
                    return jsonify({'error': 'Cannot claim your own grant'}), 400
                if not verify_auth(proof, g['grant_auth']):
                    audit(conn, request.user_id, f'FAMILY_CLAIM_FAILED:{grant_id}')
                    return jsonify({'error': 'Invalid family code'}), 401
                if g['claimed_by_user_id'] and g['claimed_by_user_id'] != request.user_id:
                    return jsonify({'error': 'Grant already claimed'}), 409
                cur.execute("""
                    UPDATE family_grants
                    SET claimed_by_user_id = %s, claimed_at = COALESCE(claimed_at, NOW())
                    WHERE id = %s
                """, (request.user_id, grant_id))
                audit(conn, request.user_id, f'FAMILY_CLAIM_SUCCESS:{grant_id}')
                cur.execute(
                    "SELECT username FROM users WHERE id = %s",
                    (g['source_user_id'],),
                )
                src = cur.fetchone()
        return jsonify({
            'success': True,
            'source_user_id': g['source_user_id'],
            'source_username': src['username'] if src else None,
        }), 200
    except Exception:
        logger.exception("family_grant_claim failed")
        return jsonify({'error': 'Claim failed'}), 500


def _family_access(caregiver_id: int, source_user_id: int) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM family_grants
                WHERE source_user_id = %s AND claimed_by_user_id = %s
                  AND revoked_at IS NULL LIMIT 1
            """, (source_user_id, caregiver_id))
            row = cur.fetchone()
            if not row:
                return False
            # Stamp the access so the patient sees "last seen X" in Settings.
            cur.execute(
                "UPDATE family_grants SET last_access_at = NOW() WHERE id = %s",
                (row['id'],),
            )
            return True


@app.route('/api/family/documents', methods=['GET'])
@token_required
def family_documents_list():
    try:
        source_user_id = int(request.args.get('source_user_id', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_user_id'}), 400
    if not source_user_id or not _family_access(request.user_id, source_user_id):
        return jsonify({'error': 'Not authorized'}), 403
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, encrypted_data, created_at, updated_at
                    FROM encrypted_documents WHERE user_id = %s
                    ORDER BY created_at DESC
                """, (source_user_id,))
                docs = cur.fetchall()
        return jsonify({'documents': [{
            'id': d['id'],
            'encrypted_data': d['encrypted_data'],
            'created_at': d['created_at'].isoformat(),
            'updated_at': d['updated_at'].isoformat() if d['updated_at'] else None,
        } for d in docs]}), 200
    except Exception:
        logger.exception("family_documents_list failed")
        return jsonify({'error': 'Failed to list documents'}), 500


@app.route('/api/family/documents', methods=['POST'])
@token_required
def family_documents_create():
    data = request.get_json() or {}
    try:
        source_user_id = int(data.get('source_user_id') or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_user_id'}), 400
    encrypted_data = data.get('encrypted_data')
    if not source_user_id or not _family_access(request.user_id, source_user_id):
        return jsonify({'error': 'Not authorized'}), 403
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Quota counts against the OWNER (patient), not the
                # caregiver writing on their behalf.
                cur.execute(
                    "SELECT COUNT(*) AS n FROM encrypted_documents WHERE user_id = %s",
                    (source_user_id,),
                )
                if cur.fetchone()['n'] >= DOCUMENT_QUOTA_PER_USER:
                    return jsonify({'error': 'quota_exceeded'}), 429
                cur.execute("""
                    INSERT INTO encrypted_documents (user_id, encrypted_data)
                    VALUES (%s, %s) RETURNING id, created_at
                """, (source_user_id, encrypted_data))
                doc = cur.fetchone()
                audit(conn, request.user_id, f'FAMILY_DOC_CREATED:{source_user_id}')
        return jsonify({
            'success': True,
            'id': doc['id'],
            'created_at': doc['created_at'].isoformat(),
        }), 201
    except Exception:
        logger.exception("family_documents_create failed")
        return jsonify({'error': 'Failed to store document'}), 500


@app.route('/api/family/documents/<int:doc_id>', methods=['PUT'])
@token_required
def family_documents_update(doc_id):
    data = request.get_json() or {}
    try:
        source_user_id = int(data.get('source_user_id') or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_user_id'}), 400
    encrypted_data = data.get('encrypted_data')
    if not source_user_id or not _family_access(request.user_id, source_user_id):
        return jsonify({'error': 'Not authorized'}), 403
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE encrypted_documents
                    SET encrypted_data = %s, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    RETURNING id, updated_at
                """, (encrypted_data, doc_id, source_user_id))
                doc = cur.fetchone()
                if not doc:
                    return jsonify({'error': 'Document not found'}), 404
                audit(conn, request.user_id, f'FAMILY_DOC_UPDATED:{source_user_id}:{doc_id}')
        return jsonify({
            'success': True,
            'id': doc['id'],
            'updated_at': doc['updated_at'].isoformat(),
        }), 200
    except Exception:
        logger.exception("family_documents_update failed")
        return jsonify({'error': 'Failed to update document'}), 500


@app.route('/api/family/documents/<int:doc_id>', methods=['DELETE'])
@token_required
def family_documents_delete(doc_id):
    try:
        source_user_id = int(request.args.get('source_user_id') or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_user_id'}), 400
    if not source_user_id or not _family_access(request.user_id, source_user_id):
        return jsonify({'error': 'Not authorized'}), 403
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM encrypted_documents WHERE id = %s AND user_id = %s",
                    (doc_id, source_user_id),
                )
                if cur.rowcount == 0:
                    return jsonify({'error': 'Document not found'}), 404
                audit(conn, request.user_id, f'FAMILY_DOC_DELETED:{source_user_id}:{doc_id}')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("family_documents_delete failed")
        return jsonify({'error': 'Failed to delete document'}), 500


@app.route('/api/admin/audit/retention', methods=['POST'])
@admin_required
def admin_run_retention():
    apply_audit_retention()
    return jsonify({'success': True}), 200


# ───────────────────────────────────────────────────────────────────────────
# CIPH-714 — DEV-ONLY mock epilepc endpoint.
#
# Pretends to be an epilepc instance serving a `ciphra-export` bundle. Used
# to validate the receive-side migration flow (CIPH-712) without depending
# on the real epilepc service being deployed.
#
# Only registered when CIPHRA_DEV_MOCKS=1. MUST NOT ship to production.
# ───────────────────────────────────────────────────────────────────────────
if os.environ.get('CIPHRA_DEV_MOCKS') == '1':
    from pathlib import Path as _Path

    _FIXTURES_DIR = _Path(__file__).parent / 'fixtures' / 'epilepc'

    _DEV_ALLOWED_ORIGINS = {
        'https://ciphra.ch',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
    }

    def _dev_cors_headers():
        origin = request.headers.get('Origin', '')
        if origin in _DEV_ALLOWED_ORIGINS:
            return {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Vary': 'Origin',
            }
        return {'Access-Control-Allow-Origin': 'http://localhost:5173'}

    @app.route('/api/ciphra-export/<token>', methods=['GET', 'OPTIONS'])
    def mock_epilepc_export(token):
        # DEV ONLY — do not ship.
        headers = _dev_cors_headers()
        if request.method == 'OPTIONS':
            return ('', 204, headers)

        if token == 'dev-expired':
            return jsonify({'error': 'token_expired'}), 401, headers
        if token == 'dev-used':
            return jsonify({'error': 'token_already_used'}), 410, headers
        if token == 'dev-malformed':
            return ('{"schema_version": "1.1", "seizures": [   <-- not JSON', 200, {
                **headers, 'Content-Type': 'application/json'
            })
        if token == 'dev-wrong-version':
            path = _FIXTURES_DIR / 'edge-wrong-version.json'
        elif token.startswith('dev-'):
            name = token[len('dev-'):]
            # SAST/DAST F6 — defense-in-depth: reject anything that isn't a
            # plain fixture name before building the path. Flask's <token>
            # route converter already blocks slashes, but this removes any
            # doubt about path traversal even if this dev-only block (gated by
            # CIPHRA_DEV_MOCKS) were ever reached in an unexpected config.
            if not re.fullmatch(r'[a-z0-9-]+', name):
                return jsonify({'error': 'unknown_token'}), 404, headers
            path = _FIXTURES_DIR / f'{name}.json'
        else:
            return jsonify({'error': 'unknown_token'}), 404, headers

        if not path.exists():
            return jsonify({'error': 'fixture_missing', 'fixture': path.name}), 404, headers

        body = path.read_text()
        return (body, 200, {**headers, 'Content-Type': 'application/json'})

    logger.warning("CIPHRA_DEV_MOCKS=1 — mock epilepc endpoint registered. DO NOT enable in production.")


if __name__ == '__main__':
    # Dev mode only — `python server.py` runs Flask's built-in server.
    # Production runs under gunicorn via api/entrypoint.sh which calls
    # init_db() + apply_audit_retention() before exec, so this block
    # never fires under gunicorn. Both paths are intentional.
    init_db()
    apply_audit_retention()
    logger.info("ciphra API — encrypted by design")
    logger.info(f"Database: {DATABASE_URL}")
    app.run(host='0.0.0.0', port=5000, debug=False)
