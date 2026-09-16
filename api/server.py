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
import ipaddress
import logging
import secrets
import threading
import time
from contextlib import contextmanager
from functools import wraps
from datetime import datetime, timezone, timedelta

import jwt
import psycopg2
from psycopg2 import errors as pg_errors
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify
from werkzeug.exceptions import BadRequest
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
    # Enablement is its OWN switch, never a side effect of another flag.
    # RATELIMIT_ENABLED defaults ON; only an explicit '0' disables it (local
    # dev that wants no throttling). This used to be tied to CIPHRA_DEV_MOCKS,
    # so the mock-data toggle silently disabled the entire rate limiter — a
    # footgun: one env var set in a prod-like deploy killed a whole control
    # class with no independent signal. Decoupled 2026-08-22.
    enabled=os.environ.get('RATELIMIT_ENABLED', '1') != '0',
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


@app.errorhandler(500)
def _internal_error(_e):
    # The F5 contract above covered 400/404/405/413 but not 500 — so an
    # unhandled exception still escaped as Flask's raw HTML page, leaking the
    # framework and breaking res.json() for callers. A black-box scan hit this
    # by POSTing a non-object JSON body (see _json_object): the crash fired
    # before the route's try/except and fell through to here as HTML. Flask
    # still logs the traceback server-side before this runs; we only fix the
    # response shape.
    return jsonify({'error': 'internal_error'}), 500


def _json_object() -> dict:
    """Parse the request body as a JSON OBJECT, or 400.

    Every route previously wrote `data = request.get_json() or {}`. That
    guards an empty/absent body, but a body that is valid JSON yet not an
    object — a top-level array `[1,2,3]` or scalar `123` — is truthy, survives
    the `or {}`, and then blows up on the first `data.get(...)` with
    AttributeError (list/int has no `.get`). Because that happens above each
    route's try/except, it surfaced as an unhandled 500 on pre-auth endpoints
    (register, login, login/init) — a malformed-input contract bug reachable
    by anyone.

    `request.get_json()` (non-silent) keeps the existing behaviour for a
    genuinely malformed body: it raises BadRequest → the 400 handler. The only
    new rule is the isinstance check, which turns "valid JSON, wrong type" from
    a 500 into the same JSON-shaped 400 as every other bad request.
    """
    data = request.get_json() or {}
    if not isinstance(data, dict):
        raise BadRequest('Request body must be a JSON object')
    return data


def _str_field(data: dict, key: str) -> str:
    """A string field from a JSON body: '' when absent or null, 400 otherwise.

    Routes used to read `(data.get('username') or '').strip()`. The `or ''`
    covers a missing or null field, but any TRUTHY non-string — `123`, `[1]`,
    `{"a":1}` — sails through and `.strip()` raises AttributeError. Like the
    non-object body `_json_object` catches, that fired above the route's
    try/except, so it was an unhandled 500 on pre-auth endpoints (register,
    login, login/init, recover/init, recover). Raising BadRequest sends it to
    the JSON 400 handler instead.

    Call it only OUTSIDE a route's try/except: inside one, `except Exception`
    catches the BadRequest and turns it straight back into a 500.
    """
    value = data.get(key)
    if value is None:
        return ''
    if not isinstance(value, str):
        raise BadRequest(f'{key} must be a string')
    return value


def _is_text(value, max_len=None, min_len=1) -> bool:
    """True when `value` is a string PostgreSQL can store in a TEXT column.

    Two kinds of body field used to pass a truthiness check and fail in the
    database instead, as a 500: a non-string (psycopg2 cannot adapt a dict, and
    turns a list into an ARRAY the TEXT column rejects), and a string holding
    U+0000, which PostgreSQL text cannot contain at all (psycopg2 refuses it
    with ValueError). No ciphra field legitimately holds either — they are
    base64, compact JSON, an opaque key, or a short label. `max_len=None` leaves
    the length to MAX_CONTENT_LENGTH.
    """
    return (
        isinstance(value, str)
        and len(value) >= min_len
        and (max_len is None or len(value) <= max_len)
        and '\x00' not in value
    )


_DIGITS_RE = re.compile(r'[0-9]{1,18}')


def _as_int(value):
    """An integer from a JSON body (a number, or a string of digits), else None.

    Refuses bool on purpose. In Python `True` IS an int: `int(True) == 1` and
    `True in (1, 3)` both hold, so a JSON `true` quietly passed as the number 1
    — as a share_class, a share_mask, a document id. Refuses floats rather
    than truncating 1.9 to 1.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and _DIGITS_RE.fullmatch(value.strip()):
        return int(value)
    return None


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


# --- Schema versioning ----------------------------------------------------
#
# The migrations below used to be an unordered pile of idempotent ALTERs at the
# bottom of init_db(). They worked, but nothing recorded WHICH of them a given
# database had, so "which schema is this database at" had no answer, and an
# older image meeting a newer database was undefined behaviour.
#
# Both matter here because the deploy is pull-based and rolls back on its own:
# a release that adds a column, fails its health check, and gets rolled back
# leaves the previous image running against the newer schema. That has to be a
# defined, survivable state — so:
#
#   compatible=True   an older image can still run against a database that has
#                     this migration. True for anything additive: a new
#                     nullable column or index is simply never selected by
#                     code that predates it.
#   compatible=False  it cannot. Raises the floor the server enforces at boot,
#                     and an image below that floor refuses to start rather
#                     than read a schema it will misinterpret.
#
# Refusing on ANY mismatch would be the wrong reflex: it would turn the
# auto-rollback safety net into an outage, because the rollback target would
# refuse to boot on the schema the failed release had already applied.
#
# To add one: append with the next number, set `compatible` honestly, and bump
# SCHEMA_VERSION. Never renumber or edit a shipped migration — databases in the
# field have already recorded it.
SCHEMA_VERSION = 9

# --- Sharing scope --------------------------------------------------------
#
# `share_class` is ONE bit of metadata the server is allowed to learn about a
# document: whether its owner considers it shareable, or personal. Operator
# decision 2026-08-30, and it is what makes a per-invite scope enforceable at
# all — the document TYPE lives inside the ciphertext, so the server cannot
# work this out for itself. It stays at two classes deliberately: a full
# per-type label would tell the server the type of every document, which is a
# larger disclosure and was not approved. Named in SECURITY_MODEL.md.
#
# NULL means "not classified yet" and is treated as NOT shareable. That
# direction is not an accident: a database predating this column must degrade
# to showing a caregiver LESS, never more. The owner's own client backfills it.
SHARE_CLASS_SHAREABLE = 1
SHARE_CLASS_PERSONAL = 2          # diary documents + anything the owner locked
SHARE_MASK_SHARED_ONLY = SHARE_CLASS_SHAREABLE                          # 1
SHARE_MASK_EVERYTHING = SHARE_CLASS_SHAREABLE | SHARE_CLASS_PERSONAL    # 3
VALID_SHARE_MASKS = (SHARE_MASK_SHARED_ONLY, SHARE_MASK_EVERYTHING)


def _share_class(data):
    """The share_class in a request body, or None if absent/invalid.

    Only the OWNER may set this. Caregiver write paths must not pass a body
    through to here — see family_documents_create.
    """
    value = _as_int(data.get('share_class'))
    return value if value in (SHARE_CLASS_SHAREABLE, SHARE_CLASS_PERSONAL) else None


def _valid_share_mask(raw) -> bool:
    """Exactly one of VALID_SHARE_MASKS, as a JSON number.

    `type(...) is int`, not `in VALID_SHARE_MASKS` alone: `True in (1, 3)` is
    True, so a JSON `true` used to be accepted and stored as mask 1.
    """
    return type(raw) is int and raw in VALID_SHARE_MASKS


# (number, name, sql, compatible)
MIGRATIONS = [
    (1, 'users.is_admin',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE", True),
    (2, 'users.auth_params',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_params TEXT", True),
    (3, 'users.recovery_auth',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_auth TEXT", True),
    (4, 'users.recovery_attempts',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0", True),
    (5, 'users.password_version',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INTEGER DEFAULT 1", True),
    (6, 'family_grants.last_access_at',
     "ALTER TABLE family_grants ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMP WITH TIME ZONE", True),
    # One metadata bit per user, used by /admin to count epilepc migrations.
    (7, 'users.registration_source',
     "ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source VARCHAR(16) DEFAULT 'web'", True),
    # Track-3 3.4 — bulk-import idempotency. `client_key` is an OPAQUE,
    # server-blind token the client supplies (sha256(username:source_id)) so a
    # retried migration batch is a no-op instead of duplicating docs. Nullable
    # + a PARTIAL unique index → existing rows and all normal single-doc saves
    # (which never set it) stay NULL and never collide.
    (8, 'encrypted_documents.client_key',
     "ALTER TABLE encrypted_documents ADD COLUMN IF NOT EXISTS client_key TEXT;"
     " CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_user_clientkey"
     " ON encrypted_documents (user_id, client_key) WHERE client_key IS NOT NULL", True),
    # Per-invite sharing scope. Additive, so an older image simply never
    # selects either column and keeps behaving as it did. `share_mask`
    # defaults to 1 (shareable only), which is what every existing grant
    # already effectively had after the client-side filter shipped — so no
    # grant's visible content changes on the day this lands.
    (9, 'sharing scope: share_class + share_mask',
     "ALTER TABLE encrypted_documents ADD COLUMN IF NOT EXISTS share_class SMALLINT;"
     " ALTER TABLE family_grants ADD COLUMN IF NOT EXISTS share_mask INTEGER NOT NULL DEFAULT 1", True),
]


class SchemaTooNewError(RuntimeError):
    """The database has a migration this image cannot safely read."""


def _apply_migrations(cur):
    """Bring the database up to SCHEMA_VERSION and record where it got to.

    Existing databases predate the ledger: they record version 0 while already
    carrying every column. That is why each statement stays idempotent — the
    first run after this ships replays 1-8 as no-ops and stamps the result.
    """
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_meta (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            version INTEGER NOT NULL DEFAULT 0,
            min_app_schema INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    cur.execute("INSERT INTO schema_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
    cur.execute("SELECT version, min_app_schema FROM schema_meta WHERE id = 1")
    row = cur.fetchone()
    current, floor = row['version'], row['min_app_schema']

    if floor > SCHEMA_VERSION:
        raise SchemaTooNewError(
            f"database schema is at version {current} and requires an app that "
            f"understands at least schema {floor}, but this image only knows "
            f"{SCHEMA_VERSION}. A newer release applied an incompatible "
            f"migration; roll forward instead of back, or restore the database "
            f"from the backup taken before that release."
        )

    if current > SCHEMA_VERSION:
        # Older image, newer-but-additive database. Fine: the columns this
        # image does not know about are simply never selected. Say so loudly
        # once, because it means a rollback happened.
        logger.warning(
            "schema: database is at version %s, this image knows %s. "
            "Running anyway — every migration in between is additive.",
            current, SCHEMA_VERSION,
        )
        return current

    for number, name, sql, compatible in MIGRATIONS:
        if number <= current:
            continue
        logger.info("schema: applying %s (%s)", number, name)
        cur.execute(sql)
        if not compatible:
            floor = number
        cur.execute(
            "UPDATE schema_meta SET version = %s, min_app_schema = %s, updated_at = NOW() WHERE id = 1",
            (number, floor),
        )
        current = number

    return current


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
            # Numbered, recorded migrations for existing databases. See
            # MIGRATIONS above for the ledger and what `compatible` means.
            # Localhost-only caveat, unchanged: if legacy rows still use the
            # old (server-side-KDF) auth_hash format, the operator must reset
            # the users table manually.
            applied = _apply_migrations(cur)
    logger.info("Database initialized (schema version %s)", applied)


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


class AuthStoreUnavailable(Exception):
    """The users table could not be consulted, so no token can be trusted."""


def _token_subject(user_id: int):
    """What the DATABASE says about a token's user, right now.

    Returns {'password_version', 'is_admin'}, or None when the row is gone.
    Raises AuthStoreUnavailable when the lookup itself fails.

    This is where a token's authority comes from — not from its claims. The
    lookup it replaces returned password_version 1 both for a missing row and
    on ANY exception, which failed open twice over: a deleted user's token
    (pv 1 unless they had changed their password) kept working until it
    expired, and during a database blip every pv-1 token passed while every
    other one was rejected as stale, logging its user out. `is_admin` came
    from the JWT claim, so a demoted admin kept the admin API for up to
    JWT_EXPIRATION_HOURS. The claim stays in the token for the frontend's UI;
    no server-side check reads it any more.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT password_version, is_admin FROM users WHERE id = %s",
                    (user_id,),
                )
                row = cur.fetchone()
    except Exception as e:
        # One line with the cause, not a traceback: during an outage this runs
        # for every authenticated request.
        logger.warning("token check: users lookup failed: %s: %s", type(e).__name__, e)
        raise AuthStoreUnavailable() from e
    if not row:
        return None
    return {
        'password_version': int(row['password_version'] or 1),
        'is_admin': bool(row['is_admin']),
    }


def _decode_and_verify_token(auth_header: str):
    """(payload, subject) for a valid token whose user still exists and whose
    password_version matches the DB, else raises. A password change, a
    recovery, or an admin lock increments pv and so invalidates old tokens."""
    if not auth_header.startswith('Bearer '):
        raise PermissionError('missing')
    payload = jwt.decode(auth_header[7:], SECRET_KEY, algorithms=[JWT_ALGORITHM])
    subject = _token_subject(payload['user_id'])
    if subject is None:
        raise PermissionError('gone')
    if int(payload.get('pv', 1)) != subject['password_version']:
        raise PermissionError('stale')
    return payload, subject


def _authenticate_request():
    """(subject, None) for an authenticated request, or (None, error response)."""
    try:
        payload, subject = _decode_and_verify_token(request.headers.get('Authorization', ''))
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, PermissionError):
        return None, (jsonify({'error': 'Token invalid or expired'}), 401)
    except AuthStoreUnavailable:
        # Fail CLOSED, but with 503 rather than 401. The frontend reads a 401
        # as "this session is dead" and logs the user out (api.ts dispatches
        # ciphra:unauthorized); it reads a 503 as "offline, try later" and
        # queues writes in the outbox. A database blip must refuse the request
        # without signing every open session out.
        return None, (jsonify({'error': 'service_unavailable'}), 503)
    request.user_id = payload['user_id']
    request.username = payload['username']
    return subject, None


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        _subject, error = _authenticate_request()
        if error:
            return error
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        subject, error = _authenticate_request()
        if error:
            return error
        if not subject['is_admin']:
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# --- Account locks ----------------------------------------------------------
#
# `users.locked_until` carries two different locks that must not behave alike:
#
#   automatic  5 wrong passwords, or 3 wrong recovery codes → 15 minutes. It
#              gates FAILED attempts only: a correct credential still gets in
#              and clears it. Otherwise anyone who knows a username can keep
#              its owner locked out indefinitely (the lockout-DoS fixed in #158).
#   admin      POST /api/admin/users/<id>/lock. Meant to stop the account being
#              used at all, so a correct credential must NOT clear it. Before
#              this split it did — login and recovery both cleared any lock on
#              success, which made the admin lock a no-op against anyone who
#              knew their own password.
#
# Told apart without a schema change, by how far ahead the lock points. An
# automatic lock is never more than 15 minutes out; an admin lock is set a
# century out. Anything more than a day ahead is an admin lock — a margin wide
# enough that no plausible clock skew between app and database blurs the two.
AUTO_LOCK_DURATION = timedelta(minutes=15)
ADMIN_LOCK_DURATION = timedelta(days=36500)
ADMIN_LOCK_THRESHOLD = timedelta(days=1)
LOGIN_MAX_ATTEMPTS = 5
RECOVERY_MAX_ATTEMPTS = 3

# Stable error code for "correct credential, but an admin locked this account".
# 403, not 429: waiting will not help. Only ever sent to a caller who has just
# proven the credential — a wrong guess against an admin-locked account gets
# the same 429 as any locked account, so the two locks look alike from outside.
ACCOUNT_SUSPENDED = 'account_suspended'


def _lock_state(locked_until, now):
    """'admin', 'auto', or None (no lock, or an expired one)."""
    if not locked_until:
        return None
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until <= now:
        return None
    return 'admin' if locked_until - now > ADMIN_LOCK_THRESHOLD else 'auto'


# Counting a failure is ONE statement. It used to be read-then-write — SELECT
# login_attempts, then SET login_attempts = <read value + 1> — so concurrent
# wrong guesses read the same count and wrote the same +1, and a parallel burst
# got many more than five guesses in before the lock.
#
# The CASEs handle an EXPIRED lock. Nothing but a success ever reset the
# counters, so once an account had been locked, the lock ran out with the
# counter still at 5 and every later typo re-locked it for another 15 minutes.
# An expired lock now means the cooldown was served: both counters restart —
# the lock is shared, so its expiry clears both — and this failure counts as
# the first. Every SET expression sees the row as it was before the UPDATE.
_COUNT_FAILED_LOGIN_SQL = """
    UPDATE users SET
        login_attempts = CASE WHEN locked_until <= %(now)s THEN 1
                              ELSE COALESCE(login_attempts, 0) + 1 END,
        recovery_attempts = CASE WHEN locked_until <= %(now)s THEN 0
                                 ELSE recovery_attempts END,
        locked_until = CASE WHEN locked_until <= %(now)s THEN NULL
                            ELSE locked_until END
    WHERE id = %(id)s
    RETURNING login_attempts AS attempts
"""
_COUNT_FAILED_RECOVERY_SQL = """
    UPDATE users SET
        recovery_attempts = CASE WHEN locked_until <= %(now)s THEN 1
                                 ELSE COALESCE(recovery_attempts, 0) + 1 END,
        login_attempts = CASE WHEN locked_until <= %(now)s THEN 0
                              ELSE login_attempts END,
        locked_until = CASE WHEN locked_until <= %(now)s THEN NULL
                            ELSE locked_until END
    WHERE id = %(id)s
    RETURNING recovery_attempts AS attempts
"""


def _count_failed_attempt(cur, sql, user_id, now):
    """Record one failure atomically; the new count, or None if the row is gone."""
    cur.execute(sql, {'now': now, 'id': user_id})
    row = cur.fetchone()
    return int(row['attempts']) if row else None


def _apply_auto_lock(cur, user_id, now):
    """Start a 15-minute lock — unless an admin lock is already in place.

    The guard matters for a lock that lands between this request's SELECT and
    here: overwriting a century-long admin lock with a 15-minute one would
    quietly undo it.
    """
    cur.execute("""
        UPDATE users SET locked_until = %(until)s
        WHERE id = %(id)s
          AND (locked_until IS NULL OR locked_until <= %(admin_floor)s)
    """, {'until': now + AUTO_LOCK_DURATION, 'id': user_id,
          'admin_floor': now + ADMIN_LOCK_THRESHOLD})


AUDIT_RETENTION_DAYS = int(os.environ.get('AUDIT_RETENTION_DAYS', 90))
AUDIT_IP_ANONYMIZE_DAYS = int(os.environ.get('AUDIT_IP_ANONYMIZE_DAYS', 30))


def _anonymize_ip(ip):
    """Keep the network, drop the host: IPv4 → its /24, IPv6 → its /48 (the
    last 80 bits zeroed). Keeps coarse, city-level signal for forensic use but
    strips the unique identifier (nDSG Art. 6).

    An IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) is an IPv4 client and is
    truncated as one. Idempotent: an already-anonymized value maps to itself,
    which is what lets the retention job skip rows it has already done.
    Anything unparseable returns None — dropping a value we cannot truncate is
    the safe direction.

    Reimplemented on `ipaddress`: the string-splitting version mangled
    compressed IPv6 (`2001:db8::1` → `2001:db8:::`, `::ffff:1.2.3.4` →
    `::ffff::`) — invalid addresses, and for the mapped form one that kept
    nothing of the network at all.
    """
    if not ip or not isinstance(ip, str):
        return None
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return None
    if addr.version == 6 and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    if addr.version == 4:
        return str(ipaddress.IPv4Address(int(addr) & ~0xFF))
    # int() drops any %zone suffix, so this works for scoped addresses too.
    return str(ipaddress.IPv6Address((int(addr) >> 80) << 80))


def audit(conn, user_id, action):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO audit_log (user_id, action, ip_address) VALUES (%s, %s, %s)",
            (user_id, action, request.remote_addr),
        )


# Any constant works as long as nothing else in the database uses it; this one
# is "ciphra" read as bytes.
_RETENTION_LOCK_KEY = 0x636970687261


def apply_audit_retention():
    """Delete audit rows older than AUDIT_RETENTION_DAYS; anonymize IPs older
    than AUDIT_IP_ANONYMIZE_DAYS. Idempotent — safe on every boot, daily, and
    on demand.

    Returns what actually happened, so callers stop reporting success blind:
      {'status': 'ok', 'deleted': n, 'anonymized': n}
      {'status': 'busy'}    another process holds the retention lock right now
      {'status': 'failed'}  the run raised; the traceback is in the log

    The transaction-scoped advisory lock keeps concurrent runs (two gunicorn
    workers, a boot run, an admin click) from working the same rows at once.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_try_advisory_xact_lock(%s) AS locked",
                    (_RETENTION_LOCK_KEY,),
                )
                got = cur.fetchone()
                if not got or not got['locked']:
                    return {'status': 'busy'}
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
                anonymized = 0
                for r in cur.fetchall():
                    anon = _anonymize_ip(r['ip_address'])
                    # Skip rows an earlier run already truncated. Without this
                    # every run rewrote a month of rows to the value they
                    # already held.
                    if anon == r['ip_address']:
                        continue
                    cur.execute(
                        "UPDATE audit_log SET ip_address = %s WHERE id = %s",
                        (anon, r['id']),
                    )
                    anonymized += 1
        logger.info("Audit retention: deleted %s, anonymized %s", deleted, anonymized)
        return {'status': 'ok', 'deleted': deleted, 'anonymized': anonymized}
    except Exception:
        logger.exception("Audit retention run failed")
        return {'status': 'failed'}


# --- Daily retention, without a scheduler ------------------------------------
#
# Retention used to run only when the container started (entrypoint.sh) or when
# an admin pressed the button, while SECURITY_MODEL.md promised raw IPs for 30
# days and deletion at 90. A container that stays up for two months kept both
# far longer. There is no cron in the image and adding one is new
# infrastructure, so the API runs it itself, opportunistically: /health hands
# _maybe_apply_audit_retention to the response's close hook, which the WSGI
# server calls AFTER the response is sent. Docker's healthcheck hits /health
# every 30 s whether or not anyone is using the app, and the check never waits
# on the job.
#
# Gated three ways, so it is cheap on every call but the first of the day:
#   - an in-process due-time: every call but one per day returns at a float
#     comparison. It starts a day out, because entrypoint.sh just ran it at boot.
#   - a non-blocking thread lock, for threaded servers.
#   - the advisory lock inside apply_audit_retention, across gunicorn workers.
# Each worker keeps its own due-time, so with N workers it can run up to N
# times a day. The later runs are no-ops: nothing new to delete, and rows
# already anonymized are skipped.
AUDIT_RETENTION_INTERVAL_SECONDS = 24 * 3600
# A failed run tries again sooner than a day, but not every 30 s.
AUDIT_RETENTION_RETRY_SECONDS = 3600
_retention_due_at = time.monotonic() + AUDIT_RETENTION_INTERVAL_SECONDS
_retention_gate = threading.Lock()


def _maybe_apply_audit_retention():
    """Run retention if a day has passed since this process last did. Never raises."""
    global _retention_due_at
    try:
        if time.monotonic() < _retention_due_at:
            return None
        if not _retention_gate.acquire(blocking=False):
            return None
        try:
            if time.monotonic() < _retention_due_at:
                return None
            # Push the due-time out BEFORE running, so a run that hangs or
            # raises cannot be re-entered by the next health check.
            _retention_due_at = time.monotonic() + AUDIT_RETENTION_INTERVAL_SECONDS
            result = apply_audit_retention()
            if result.get('status') == 'failed':
                _retention_due_at = time.monotonic() + AUDIT_RETENTION_RETRY_SECONDS
            return result
        finally:
            _retention_gate.release()
    except Exception:
        # A retention problem must never become a health-check problem.
        logger.exception("Scheduled audit retention failed")
        return None


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
    """Liveness probe.

    Carries the schema version the database reports and the one this image
    knows. It answers "which schema is prod at" from outside the box, which is
    exactly what you want mid-deploy, and it is not a disclosure: both numbers
    are in the public repository. A mismatch here is the tell that a rollback
    left an older image on a newer schema.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                try:
                    cur.execute("SELECT version FROM schema_meta WHERE id = 1")
                    row = cur.fetchone()
                    db_schema = row['version'] if row else None
                except Exception:
                    # Pre-ledger database, or the table is not there yet.
                    conn.rollback()
                    db_schema = None
        resp = jsonify({
            'status': 'healthy',
            'schema': db_schema,
            'app_schema': SCHEMA_VERSION,
        })
        # Runs after the response has gone out, and returns at once unless a
        # day has passed. See "Daily retention, without a scheduler".
        resp.call_on_close(_maybe_apply_audit_retention)
        return resp, 200
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
    data = _json_object()
    username = _str_field(data, 'username').strip().lower()
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
        if not _is_text(val, 8192):
            return jsonify({'error': f'Invalid {field}'}), 400
    # Recovery fields all-or-nothing. Each one is type-checked, not just
    # truthy: `{"recovery_vault": {"a": 1}}` used to reach the INSERT and 500.
    has_recovery = any([recovery_vault, recovery_params, recovery_auth])
    if has_recovery and not (_is_text(recovery_vault, 8192)
                             and _is_text(recovery_params, 8192)
                             and valid_b64(recovery_auth, 32, 32)):
        return jsonify({'error': 'Incomplete recovery bundle'}), 400
    if not has_recovery:
        # Falsy-but-present values (`[]`, `{}`, `0`) must not reach SQL either.
        recovery_vault = recovery_params = recovery_auth = None

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
                    # The 409 itself still says "taken" — an enumeration
                    # oracle registration cannot avoid; see SECURITY_MODEL.md.
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
    except pg_errors.UniqueViolation:
        # Two registrations of the same name at once both pass the SELECT
        # above; the unique index lets one INSERT through and rejects the
        # other. That loser is the same "taken" case as the pre-check, not a
        # server fault — same 409, same body.
        return jsonify({'error': 'registration_failed'}), 409
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
    data = _json_object()
    username = _str_field(data, 'username').strip().lower()
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
    data = _json_object()
    username = _str_field(data, 'username').strip().lower()
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

                # Compute the lock state, but DON'T reject on it yet. A correct
                # password must succeed even during an AUTOMATIC lock —
                # otherwise an attacker who only knows the username can lock
                # the account (5 wrong guesses → 15 min) and, with repeated
                # locks, deny the real user indefinitely. That lock gates
                # FAILED attempts, not a proven identity. (Guessing stays
                # bounded: wrong attempts are still rejected, and nginx +
                # flask-limiter cap the rate.) An ADMIN lock is the exception —
                # see "Account locks" above.
                now = datetime.now(timezone.utc)
                lock = _lock_state(user['locked_until'], now)

                if verify_auth(auth_key, user['auth_hash']):
                    if lock == 'admin':
                        audit(conn, user['id'], 'LOGIN_REFUSED_LOCKED')
                        return jsonify({'error': ACCOUNT_SUSPENDED}), 403
                    # Success clears both counters AND an automatic lock —
                    # identity is proven. The WHERE re-checks for an admin lock
                    # that landed after the SELECT above, which must survive;
                    # RETURNING hands back the password_version as of this
                    # write, so the token is not born stale.
                    cur.execute("""
                        UPDATE users
                        SET login_attempts = 0, recovery_attempts = 0,
                            locked_until = NULL, last_login = NOW()
                        WHERE id = %s
                          AND (locked_until IS NULL OR locked_until <= %s)
                        RETURNING password_version
                    """, (user['id'], now + ADMIN_LOCK_THRESHOLD))
                    fresh = cur.fetchone()
                    if not fresh:
                        audit(conn, user['id'], 'LOGIN_REFUSED_LOCKED')
                        return jsonify({'error': ACCOUNT_SUSPENDED}), 403
                    audit(conn, user['id'], 'LOGIN_SUCCESS')
                    is_admin = bool(user.get('is_admin', False))
                    token = generate_token(
                        user['id'], username, is_admin,
                        pwd_version=int(fresh['password_version'] or 1),
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
                    # Wrong password. If already locked — either kind — reject
                    # without letting the attacker make progress: no counter
                    # change, so an admin lock is never overwritten, and the
                    # same 429 for both, so a guesser cannot tell them apart.
                    if lock:
                        audit(conn, user['id'], 'LOGIN_FAILED')
                        return jsonify({'error': 'Account temporarily locked'}), 429
                    attempts = _count_failed_attempt(cur, _COUNT_FAILED_LOGIN_SQL, user['id'], now)
                    if attempts is None:
                        return jsonify({'error': 'Invalid credentials'}), 401
                    if attempts >= LOGIN_MAX_ATTEMPTS:
                        _apply_auto_lock(cur, user['id'], now)
                        audit(conn, user['id'], 'ACCOUNT_LOCKED')
                        return jsonify({'error': 'Too many failed attempts. Locked 15 min'}), 429
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
    data = _json_object()
    encrypted_data = data.get('encrypted_data')
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    if not _is_text(encrypted_data):
        return jsonify({'error': 'Invalid encrypted_data'}), 400

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
                    INSERT INTO encrypted_documents (user_id, encrypted_data, share_class)
                    VALUES (%s, %s, %s) RETURNING id, created_at
                """, (request.user_id, encrypted_data, _share_class(data)))
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
# A real client_key is `v1:` + 43 base64url chars. The cap is generous for a
# future scheme, and far below the ~2.7 KB a btree index entry may hold: a
# longer key made the INSERT itself fail, which aborts the whole transaction —
# the one bad blob failing the batch that the promise above rules out.
CLIENT_KEY_MAX_LEN = 256


@app.route('/api/documents/batch', methods=['POST'])
@limiter.limit("30 per minute")
@token_required
def store_documents_batch():
    data = _json_object()
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
                    # Every per-item check happens BEFORE the item touches SQL.
                    # A value the database rejects (a dict psycopg2 cannot
                    # adapt, a NUL byte, an over-long index key) raises inside
                    # the shared transaction and takes every other item in the
                    # batch down with it as a 500.
                    if ck and not _is_text(ck, CLIENT_KEY_MAX_LEN):
                        results.append({'client_key': None, 'status': 'error', 'error': 'invalid client_key'})
                        errored += 1
                        continue
                    if not enc:
                        results.append({'client_key': ck, 'status': 'error', 'error': 'missing encrypted_data'})
                        errored += 1
                        continue
                    if not _is_text(enc):
                        results.append({'client_key': ck, 'status': 'error', 'error': 'invalid encrypted_data'})
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
                            INSERT INTO encrypted_documents (user_id, encrypted_data, client_key, share_class)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL
                            DO NOTHING
                            RETURNING id
                        """, (request.user_id, enc, ck, _share_class(d)))
                    else:
                        cur.execute("""
                            INSERT INTO encrypted_documents (user_id, encrypted_data, share_class)
                            VALUES (%s, %s, %s) RETURNING id
                        """, (request.user_id, enc, _share_class(d)))
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


@app.route('/api/documents/classify', methods=['POST'])
@limiter.limit("30 per minute")
@token_required
def classify_documents():
    """Backfill `share_class` for the caller's OWN documents.

    Documents written before the sharing scope existed carry NULL, which the
    caregiver read treats as not-shareable. That is the safe direction, but it
    means a caregiver sees less until the owner's client says which is which —
    so the client sends the whole set in one call after its next load, and
    again before it creates or rescopes an invitation, where correctness
    actually matters.

    Owner-only by construction: the WHERE clause is pinned to request.user_id,
    so a caregiver cannot reclassify a patient's documents through it.
    """
    data = _json_object()
    items = data.get('documents')
    if not isinstance(items, list) or not items:
        return jsonify({'error': 'documents must be a non-empty array'}), 400
    if len(items) > BATCH_MAX_DOCS:
        return jsonify({'error': f'at most {BATCH_MAX_DOCS} documents per call'}), 413

    pairs = []
    for item in items:
        if not isinstance(item, dict):
            continue
        share_class = _share_class(item)
        doc_id = _as_int(item.get('id'))
        if doc_id is None:
            continue
        if share_class is not None:
            pairs.append((share_class, doc_id))
    if not pairs:
        return jsonify({'error': 'no valid {id, share_class} pairs'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                updated = 0
                for share_class, doc_id in pairs:
                    cur.execute(
                        "UPDATE encrypted_documents SET share_class = %s"
                        " WHERE id = %s AND user_id = %s",
                        (share_class, doc_id, request.user_id),
                    )
                    updated += cur.rowcount
        return jsonify({'success': True, 'updated': updated}), 200
    except Exception:
        logger.exception("classify_documents failed")
        return jsonify({'error': 'Failed to classify documents'}), 500


@app.route('/api/documents', methods=['GET'])
@token_required
def get_documents():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, encrypted_data, share_class, created_at, updated_at
                    FROM encrypted_documents
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                """, (request.user_id,))
                docs = cur.fetchall()
        return jsonify({
            'documents': [{
                'id': d['id'],
                'encrypted_data': d['encrypted_data'],
                # The owner's own classification, so their client can spot the
                # documents it has not classified yet and backfill them.
                'share_class': d['share_class'],
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
    data = _json_object()
    encrypted_data = data.get('encrypted_data')
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    if not _is_text(encrypted_data):
        return jsonify({'error': 'Invalid encrypted_data'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # COALESCE so a client that does not send the class leaves it
                # alone rather than wiping it back to unclassified. Locking an
                # entry IS a reclassification, which is why the owner's update
                # path has to carry it at all.
                cur.execute("""
                    UPDATE encrypted_documents
                    SET encrypted_data = %s, share_class = COALESCE(%s, share_class),
                        updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    RETURNING id
                """, (encrypted_data, _share_class(data), doc_id, request.user_id))
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
    data = _json_object()
    username = _str_field(data, 'username').strip().lower()
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
    data = _json_object()
    username = _str_field(data, 'username').strip().lower()
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
        if not _is_text(val, 8192):
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

                # Same lockout gate as login — 3 failed recoveries → 15 min
                # lock — and the same DoS fix: compute the lock but let a
                # correct recovery code through an AUTOMATIC lock, so an
                # attacker who knows a username can't lock the real user out of
                # recovery. An admin lock holds here too: recovery resets the
                # password, and must not become the way around it.
                now = datetime.now(timezone.utc)
                lock = _lock_state(user['locked_until'], now)

                if not verify_auth(recovery_key, user['recovery_auth']):
                    if lock:
                        audit(conn, user['id'], 'RECOVERY_FAILED')
                        return jsonify({'error': 'Account temporarily locked'}), 429
                    attempts = _count_failed_attempt(cur, _COUNT_FAILED_RECOVERY_SQL, user['id'], now)
                    if attempts is None:
                        return jsonify({'error': 'Invalid recovery code'}), 401
                    if attempts >= RECOVERY_MAX_ATTEMPTS:
                        _apply_auto_lock(cur, user['id'], now)
                        audit(conn, user['id'], 'RECOVERY_LOCKED')
                        return jsonify({'error': 'Too many failed attempts. Locked 15 min'}), 429
                    audit(conn, user['id'], 'RECOVERY_FAILED')
                    return jsonify({'error': 'Invalid recovery code'}), 401

                if lock == 'admin':
                    audit(conn, user['id'], 'RECOVERY_REFUSED_LOCKED')
                    return jsonify({'error': ACCOUNT_SUSPENDED}), 403

                # The WHERE re-checks for an admin lock that landed after the
                # SELECT — the swap must not clear it (see login).
                cur.execute("""
                    UPDATE users
                    SET auth_hash = %s, auth_params = %s, vault_params = %s,
                        encrypted_master = %s, login_attempts = 0,
                        recovery_attempts = 0, locked_until = NULL,
                        password_version = COALESCE(password_version, 1) + 1,
                        updated_at = NOW()
                    WHERE id = %s
                      AND (locked_until IS NULL OR locked_until <= %s)
                    RETURNING id
                """, (
                    auth_hash, auth_params, vault_params, encrypted_master, user['id'],
                    now + ADMIN_LOCK_THRESHOLD,
                ))
                if not cur.fetchone():
                    audit(conn, user['id'], 'RECOVERY_REFUSED_LOCKED')
                    return jsonify({'error': ACCOUNT_SUSPENDED}), 403
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
    data = _json_object()
    current_auth_key = data.get('current_auth_key')
    auth_hash = data.get('auth_hash')
    auth_params = data.get('auth_params')
    vault_params = data.get('vault_params')
    encrypted_master = data.get('encrypted_master')

    if not valid_b64(current_auth_key, 32, 32) or not valid_b64(auth_hash, 32, 32):
        return jsonify({'error': 'Invalid credentials'}), 400
    for field, val in (('auth_params', auth_params), ('vault_params', vault_params),
                       ('encrypted_master', encrypted_master)):
        if not _is_text(val, 8192):
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


def _revoke_grants_claimed_by(cur, user_id):
    """Revoke every live family grant this user claimed as a caregiver.

    Call before deleting the user. `family_grants.claimed_by_user_id` is ON
    DELETE SET NULL, so deleting a caregiver used to put their grant back to
    "unclaimed" — still live, same family code — and whoever next held the
    link or the code could claim the patient's data. The patient can invite
    again; nobody should inherit an invitation by default.
    """
    cur.execute("""
        UPDATE family_grants SET revoked_at = NOW()
        WHERE claimed_by_user_id = %s AND revoked_at IS NULL
    """, (user_id,))


@app.route('/api/delete-account', methods=['POST'])
@limiter.limit("3 per minute")
@token_required
def delete_account():
    data = _json_object()
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
                _revoke_grants_claimed_by(cur, request.user_id)
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

                # Automatic lockouts from both gates: 5 wrong passwords
                # (ACCOUNT_LOCKED) or 3 wrong recovery codes (RECOVERY_LOCKED).
                # Counting only the first hid a recovery brute-force entirely.
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE action IN ('ACCOUNT_LOCKED', 'RECOVERY_LOCKED')
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
                    WHERE action IN ('ACCOUNT_LOCKED', 'RECOVERY_LOCKED')
                    AND created_at >= NOW() - INTERVAL '24 hours'
                """)
                lockouts_today = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM users
                    WHERE created_at >= NOW() - INTERVAL '24 hours'
                """)
                new_users_today = cur.fetchone()['cnt']

                # Both ways an account ends: an admin deleting it, and the
                # user deleting their own (ACCOUNT_DELETED — the row survives
                # with user_id and IP nulled). Only the admin path was counted,
                # so self-service deletions never showed up here.
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE (action = 'ACCOUNT_DELETED' OR action LIKE 'ADMIN_DELETE_USER%')
                    AND created_at >= NOW() - INTERVAL '30 days'
                """)
                deletions_30d = cur.fetchone()['cnt']

                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM audit_log
                    WHERE (action = 'ACCOUNT_DELETED' OR action LIKE 'ADMIN_DELETE_USER%')
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
                # Lock indefinitely (far future) — admin must manually unlock.
                # The distance is what marks it as an admin lock, which login
                # and recovery refuse to clear (see "Account locks").
                # Bumping password_version ends every session the user already
                # has; without it the lock only stopped NEW logins, and an open
                # tab kept full access until its token expired.
                locked_until = datetime.now(timezone.utc) + ADMIN_LOCK_DURATION
                cur.execute("""
                    UPDATE users
                    SET locked_until = %s,
                        password_version = COALESCE(password_version, 1) + 1
                    WHERE id = %s
                """, (locked_until, user_id))
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
                    "UPDATE users SET locked_until = NULL, login_attempts = 0,"
                    " recovery_attempts = 0 WHERE id = %s",
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
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                # Full erasure (GDPR Art. 17): null user_id AND ip_address so
                # deleted users can't be re-linked via IP forensics.
                cur.execute(
                    "UPDATE audit_log SET user_id = NULL, ip_address = NULL WHERE user_id = %s",
                    (user_id,),
                )
                _revoke_grants_claimed_by(cur, user_id)
                # CASCADE on encrypted_documents will delete all docs
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
                # The id, not the username. This row outlives the account, and
                # the erasure just above exists so nothing ties back to the
                # person; writing their username into it undid that. Once the
                # users row is gone the id resolves to no one.
                audit(conn, request.user_id, f'ADMIN_DELETE_USER:{user_id}')
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
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                cur.execute("UPDATE users SET is_admin = TRUE WHERE id = %s", (user_id,))
                # Id, not username — same reason as ADMIN_DELETE_USER: audit
                # rows must not carry a name that survives the account.
                audit(conn, request.user_id, f'ADMIN_PROMOTE:{user_id}')
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
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                # Takes effect on the demoted admin's next request: admin
                # routes read is_admin from the database, not from the token.
                cur.execute("UPDATE users SET is_admin = FALSE WHERE id = %s", (user_id,))
                audit(conn, request.user_id, f'ADMIN_DEMOTE:{user_id}')
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
    data = _json_object()
    label = _str_field(data, 'label').strip()
    grant_params = data.get('grant_params')
    grant_auth = data.get('grant_auth')
    wrapped_master = data.get('wrapped_master')

    if not _is_text(label, 64):
        return jsonify({'error': 'Invalid label'}), 400
    if not valid_b64(grant_auth, 32, 32):
        return jsonify({'error': 'Invalid grant_auth'}), 400
    for field, val in (('grant_params', grant_params), ('wrapped_master', wrapped_master)):
        if not _is_text(val, 8192):
            return jsonify({'error': f'Invalid {field}'}), 400
    # Absent = the narrow scope. A privacy control defaults closed, and an old
    # client that does not know about the field must not widen a grant.
    share_mask = data.get('share_mask', SHARE_MASK_SHARED_ONLY)
    if not _valid_share_mask(share_mask):
        return jsonify({'error': 'Invalid share_mask'}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO family_grants
                        (source_user_id, label, grant_params, grant_auth, wrapped_master,
                         share_mask)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at
                """, (request.user_id, label, grant_params, grant_auth, wrapped_master,
                      share_mask))
                row = cur.fetchone()
                audit(conn, request.user_id, f'FAMILY_GRANT_CREATED:mask={share_mask}')
        return jsonify({
            'id': row['id'],
            'created_at': row['created_at'].isoformat(),
            'share_mask': share_mask,
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
                           g.last_access_at, g.share_mask, u.username AS claimed_by_username
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
                'share_mask': r['share_mask'],
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


@app.route('/api/family/grants/<int:grant_id>/scope', methods=['POST'])
@limiter.limit("20 per hour")
@token_required
def family_grant_rescope(grant_id):
    """Change what an existing invitation may see. Owner only.

    Narrowing takes effect on the caregiver's next request, and stops there:
    whatever they have already downloaded stays on their device. That is the
    same limit revocation has, and the UI says so in both places rather than
    implying a reach we do not have.
    """
    data = _json_object()
    share_mask = data.get('share_mask')
    if not _valid_share_mask(share_mask):
        return jsonify({'error': 'Invalid share_mask'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE family_grants SET share_mask = %s
                    WHERE id = %s AND source_user_id = %s AND revoked_at IS NULL
                """, (share_mask, grant_id, request.user_id))
                if cur.rowcount == 0:
                    return jsonify({'error': 'Grant not found'}), 404
                audit(conn, request.user_id, f'FAMILY_GRANT_RESCOPED:{grant_id}:mask={share_mask}')
        return jsonify({'success': True, 'share_mask': share_mask}), 200
    except Exception:
        logger.exception("family_grant_rescope failed")
        return jsonify({'error': 'Rescope failed'}), 500


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


def _fake_grant_id(seed: bytes, max_grant_id: int) -> int:
    """A decoy grant id that looks like a real one.

    Real ids are SERIAL: positive, and no larger than the newest grant. The
    decoy used to be NEGATIVE, so every fake list announced itself and one
    request told you whether a username had live invitations — which, when it
    did, meant the account existed.

    Drawn from [1, largest power of two <= max_grant_id], not [1, max]: a
    real grant's id never changes, so a decoy that moved with every new
    invitation anywhere on the server would be its own tell. This one moves
    only when the grant count crosses a power of two, and never exceeds an id
    an attacker could learn by creating a grant of their own.
    """
    span = 1 << (max_grant_id.bit_length() - 1) if max_grant_id > 0 else 1
    return 1 + int.from_bytes(seed[:4], 'big') % span


def _fake_grants_for_username(username: str, max_grant_id: int = 0):
    """Deterministic fake grant list for usernames with no live grants.

    That is an unknown username AND a real account with nothing to claim —
    both get this, so those two are indistinguishable. What stays visible is a
    count other than one: the decoy list always has exactly one entry, and a
    patient with several live invitations returns several. SECURITY_MODEL.md
    says so.
    """
    fake = []
    for i in range(1):
        seed = hmac.new(
            SECRET_KEY.encode(), f'{username}:fake_grant:{i}'.encode(), hashlib.sha256
        ).digest()
        fake.append({
            'id': _fake_grant_id(seed, max_grant_id),
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
    data = _json_object()
    source_username = _str_field(data, 'source_username').strip().lower()
    if not source_username or not USERNAME_RE.match(source_username):
        return jsonify({'error': 'Invalid username'}), 400

    max_grant_id = 0
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Asked on every call, real username or not, so both paths run
                # the same two queries. The decoy id needs it; see _fake_grant_id.
                cur.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM family_grants")
                max_grant_id = int(cur.fetchone()['max_id'])
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
        return jsonify({'grants': _fake_grants_for_username(source_username, max_grant_id)}), 200
    except Exception:
        logger.exception("family_grant_claim_init failed")
        return jsonify({'grants': _fake_grants_for_username(source_username, max_grant_id)}), 200


@app.route('/api/family/grants/claim', methods=['POST'])
@limiter.limit("10 per minute")
@token_required
def family_grant_claim():
    data = _json_object()
    grant_id = data.get('grant_id')
    proof = data.get('proof')  # base64 family_key — server SHA-256s and compares
    # `type(...) is int`: isinstance(True, int) holds, and `WHERE id = true`
    # is a type error in PostgreSQL — a 500.
    if type(grant_id) is not int or not valid_b64(proof, 32, 32):
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
                if g and g['source_user_id'] == request.user_id:
                    return jsonify({'error': 'Cannot claim your own grant'}), 400
                # One answer for "no such live grant" and "wrong code". They
                # used to differ — 404 and 401 — and claim/init hands out a
                # decoy grant for usernames with nothing to claim, so posting
                # any proof against the decoy's id sorted decoys (404) from real
                # invitations (401). The client only ever special-cases 409.
                if not g or not verify_auth(proof, g['grant_auth']):
                    audit(conn, request.user_id, f'FAMILY_CLAIM_FAILED:{grant_id}')
                    return jsonify({'error': 'Invalid family code'}), 401
                if g['claimed_by_user_id'] and g['claimed_by_user_id'] != request.user_id:
                    return jsonify({'error': 'Grant already claimed'}), 409
                # Conditional, because the check above is not atomic with this
                # write: two people holding the same code could both pass it,
                # both get a 200, and the later UPDATE silently took the grant
                # from the earlier one. Now the row lock serialises them and the
                # loser matches nothing.
                cur.execute("""
                    UPDATE family_grants
                    SET claimed_by_user_id = %s, claimed_at = COALESCE(claimed_at, NOW())
                    WHERE id = %s AND revoked_at IS NULL
                      AND (claimed_by_user_id IS NULL OR claimed_by_user_id = %s)
                    RETURNING id
                """, (request.user_id, grant_id, request.user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'Grant already claimed'}), 409
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


def _family_scope(caregiver_id: int, source_user_id: int):
    """The grant's share_mask, or None when there is no live grant.

    Access and scope resolve together on purpose: a caller that checks one
    without the other is the bug this shape prevents.

    A caregiver can hold more than one live grant from the same patient (two
    invitations, both claimed by the same account). `LIMIT 1` without an
    ORDER BY let PostgreSQL pick either, so the scope could flip between
    requests. Now the NARROWEST grant wins, deterministically: privacy-
    conservative, and never a surprise to the patient, who can rescope or
    revoke the other. Ordering by the mask's value is exact for the masks that
    exist, because they nest (1 is a subset of 3); a mask that did not nest
    would need an intersection here instead.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, share_mask FROM family_grants
                WHERE source_user_id = %s AND claimed_by_user_id = %s
                  AND revoked_at IS NULL
                ORDER BY share_mask ASC, id ASC
                LIMIT 1
            """, (source_user_id, caregiver_id))
            row = cur.fetchone()
            if not row:
                return None
            # Stamp the access so the patient sees "last seen X" in Settings.
            cur.execute(
                "UPDATE family_grants SET last_access_at = NOW() WHERE id = %s",
                (row['id'],),
            )
            return row['share_mask']


def _family_access(caregiver_id: int, source_user_id: int) -> bool:
    return _family_scope(caregiver_id, source_user_id) is not None


@app.route('/api/family/documents', methods=['GET'])
@token_required
def family_documents_list():
    try:
        source_user_id = int(request.args.get('source_user_id', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_user_id'}), 400
    share_mask = _family_scope(request.user_id, source_user_id)
    if not source_user_id or share_mask is None:
        return jsonify({'error': 'Not authorized'}), 403
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # THE boundary. Out-of-scope rows are not filtered client-side,
                # not marked, not sent — the caregiver never holds the
                # ciphertext, so no modified client and no look at IndexedDB
                # gets them back.
                #
                # `share_class IS NOT NULL` makes it fail CLOSED: a document
                # written before this column existed is withheld until its
                # owner's client classifies it. A caregiver seeing less for a
                # while is a nuisance; the other direction re-releases every
                # diary in the database.
                cur.execute("""
                    SELECT id, encrypted_data, created_at, updated_at
                    FROM encrypted_documents
                    WHERE user_id = %s
                      AND share_class IS NOT NULL
                      AND (share_class & %s) <> 0
                    ORDER BY created_at DESC
                """, (source_user_id, share_mask))
                docs = cur.fetchall()
                # How many were withheld. CIPH-726: a caregiver has to know
                # they are seeing a partial record, or they read a quiet week
                # as a quiet week. The client used to count this out of the
                # documents it held, which only worked while it held them.
                # A count is what the banner already disclosed; the content
                # stays on the server.
                cur.execute(
                    "SELECT COUNT(*) AS n FROM encrypted_documents"
                    " WHERE user_id = %s"
                    "   AND (share_class IS NULL OR (share_class & %s) = 0)",
                    (source_user_id, share_mask),
                )
                withheld = cur.fetchone()['n']
        return jsonify({
            'documents': [{
                'id': d['id'],
                'encrypted_data': d['encrypted_data'],
                'created_at': d['created_at'].isoformat(),
                'updated_at': d['updated_at'].isoformat() if d['updated_at'] else None,
            } for d in docs],
            'share_mask': share_mask,
            'withheld': withheld,
        }), 200
    except Exception:
        logger.exception("family_documents_list failed")
        return jsonify({'error': 'Failed to list documents'}), 500


@app.route('/api/family/documents', methods=['POST'])
@token_required
def family_documents_create():
    data = _json_object()
    # _as_int, not int(): int() took `true` as patient 1, truncated 1.9, and
    # raised an uncaught OverflowError on 1e400 (JSON's infinity).
    source_user_id = _as_int(data.get('source_user_id')) or 0
    encrypted_data = data.get('encrypted_data')
    if not source_user_id or not _family_access(request.user_id, source_user_id):
        return jsonify({'error': 'Not authorized'}), 403
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    if not _is_text(encrypted_data):
        return jsonify({'error': 'Invalid encrypted_data'}), 400
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
                # The class is NOT read from the body. A caregiver who could
                # set it could file a document outside their own scope, or
                # reclassify their way into one. What they write is by
                # definition something they can see, so it is shareable.
                cur.execute("""
                    INSERT INTO encrypted_documents (user_id, encrypted_data, share_class)
                    VALUES (%s, %s, %s) RETURNING id, created_at
                """, (source_user_id, encrypted_data, SHARE_CLASS_SHAREABLE))
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
    data = _json_object()
    source_user_id = _as_int(data.get('source_user_id')) or 0  # see family_documents_create
    encrypted_data = data.get('encrypted_data')
    share_mask = _family_scope(request.user_id, source_user_id)
    if not source_user_id or share_mask is None:
        return jsonify({'error': 'Not authorized'}), 403
    if not encrypted_data:
        return jsonify({'error': 'No encrypted data'}), 400
    if not _is_text(encrypted_data):
        return jsonify({'error': 'Invalid encrypted_data'}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Scoped exactly like the read. Without this a narrow-scope
                # caregiver could overwrite a diary entry by guessing its id —
                # they could not READ it, but destroying what you cannot see is
                # not meaningfully better. `share_class` is deliberately absent
                # from the SET: a caregiver never reclassifies.
                cur.execute("""
                    UPDATE encrypted_documents
                    SET encrypted_data = %s, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                      AND share_class IS NOT NULL
                      AND (share_class & %s) <> 0
                    RETURNING id, updated_at
                """, (encrypted_data, doc_id, source_user_id, share_mask))
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
    share_mask = _family_scope(request.user_id, source_user_id)
    if not source_user_id or share_mask is None:
        return jsonify({'error': 'Not authorized'}), 403
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Same scope as the read — see family_documents_update.
                cur.execute(
                    "DELETE FROM encrypted_documents"
                    " WHERE id = %s AND user_id = %s"
                    "   AND share_class IS NOT NULL AND (share_class & %s) <> 0",
                    (doc_id, source_user_id, share_mask),
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
    # Report what happened. This used to answer success regardless, including
    # when the run had raised and changed nothing.
    result = apply_audit_retention()
    if result['status'] == 'ok':
        return jsonify({'success': True, 'deleted': result['deleted'],
                        'anonymized': result['anonymized']}), 200
    if result['status'] == 'busy':
        return jsonify({'error': 'retention_in_progress'}), 409
    return jsonify({'error': 'retention_failed'}), 500


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
