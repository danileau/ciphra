# CIPH-pi20-LB-4 — multi-stage build so dev tools (pytest) ship in the
# `dev` stage only. Production keeps the original minimal surface.
#
#   docker build --target prod ./api      # default, what compose uses
#   docker build --target dev  ./api      # adds pytest + dev deps
#
# Tests run via:  docker compose run --rm --build api pytest -q
# (compose.api.target=dev — see docker-compose.yml).

FROM python:3.11-slim AS base

# `apt-get upgrade` patches the Debian base packages (the slim base lags the
# security repo); install build/runtime extras; then drop the apt lists.
#
# CACHEBUST is set per CI run (release-images.yml). It forces this layer to
# re-run on every release so the upgrade hits the CURRENT Debian security repo.
# Without it BuildKit's gha cache replays a stale upgrade layer and the
# published :latest silently drifts behind fixed-upstream CVEs — which is
# exactly how curl/libssh2 (deb13u4/deb13u1) turned the daily scan red in
# 2026-07 while this Dockerfile already "did the right thing".
#
# It is deliberately NOT the commit SHA: a workflow_dispatch rebuild of an
# unchanged main would reuse the same SHA, replay the cached layer, and
# republish the identical stale packages — defeating the one control that
# clears base-layer CVEs (util-linux 2.41-5, 36 HIGHs, 2026-08-21).
ARG CACHEBUST=none
RUN echo "cachebust: ${CACHEBUST}" \
 && apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends gcc curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Patch the build tooling bundled in the python base (wheel / setuptools, which
# vendors jaraco.context). These are NOT runtime deps of the Flask app — their
# CVEs (malicious tar/wheel during install) aren't reachable in the running
# container — but upgrading clears the scan and shrinks the supply-chain surface.
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ─── dev: pytest + dev tooling for `docker compose run api pytest`. ───
FROM base AS dev

COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . .

RUN chmod +x entrypoint.sh \
 && useradd --system --uid 1001 --create-home --home-dir /home/ciphra ciphra \
 && chown -R ciphra:ciphra /app /home/ciphra
USER ciphra

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["./entrypoint.sh"]


# ─── prod: minimal surface, no test tooling. Default target. ───
FROM base AS prod

# Drop pip from the production image. Both Python HIGHs in the 2026-08-21
# scan came from pip's vendored tree, not from anything the Flask app
# imports:
#
#   msgpack 1.1.2 (GHSA-6v7p-g79w-8964) — real code, at
#     site-packages/pip/_vendor/msgpack. Reachable only through
#     cachecontrol while `pip install` writes its HTTP cache.
#   setuptools 70.3.0 (CVE-2025-47273) — NOT code. pip vendors
#     `pkg_resources` and its vendor.txt/bom.cdx.json attribute that to
#     setuptools 70.3.0; Trivy reads pip's own CycloneDX SBOM and reports
#     it as an installed package (hence the "Third-party SBOM" warning and
#     the target literally named "Python"). The vulnerable module,
#     setuptools/package_index.py, exists nowhere in the image — the real
#     setuptools here is 84.0.0, well past the 78.1.1 fix.
#
# Nothing at runtime needs pip; entrypoint.sh runs gunicorn. Removing it
# deletes the reachable msgpack copy AND the SBOM that manufactures the
# false positive, rather than ignoring either. `dev` keeps pip — that
# stage branches off `base` above and still installs requirements-dev.
#
# Trade-off: no `pip install` inside a running prod container. Debugging
# that needs an extra package uses the dev target.
#
# The trailing import is the guard: if stripping pip ever takes a runtime
# dependency with it, the build fails here instead of at the first request.
RUN PURELIB="$(python -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')" \
 && STDLIB="$(python -c 'import sysconfig; print(sysconfig.get_paths()["stdlib"])')" \
 && rm -rf "$PURELIB"/pip "$PURELIB"/pip-*.dist-info "$STDLIB"/ensurepip \
 && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
 && python -c "import flask, flask_cors, flask_limiter, redis, psycopg2, argon2, cryptography, jwt, gunicorn"

COPY . .

RUN chmod +x entrypoint.sh \
 && useradd --system --uid 1001 --create-home --home-dir /home/ciphra ciphra \
 && chown -R ciphra:ciphra /app /home/ciphra
USER ciphra

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["./entrypoint.sh"]
