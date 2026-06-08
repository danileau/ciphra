#!/bin/sh
# Production entrypoint. Runs schema init once (idempotent) before exec-ing
# gunicorn, so the gunicorn workers don't race on CREATE TABLE IF NOT EXISTS.
#
# init_db() and apply_audit_retention() are normally guarded by
# `if __name__ == '__main__':` in server.py, which only fires under
# `python server.py` — not under gunicorn. Production used to silently skip
# schema creation. This script closes that gap.

set -e

echo "[entrypoint] running init_db() + apply_audit_retention()…"
python -c "from server import init_db, apply_audit_retention; init_db(); apply_audit_retention()"
echo "[entrypoint] schema OK, handing off to gunicorn"

exec gunicorn \
  --bind 0.0.0.0:5000 \
  --workers 2 \
  --timeout 120 \
  --worker-tmp-dir /tmp \
  server:app
