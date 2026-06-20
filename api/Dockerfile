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
RUN apt-get update \
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

COPY . .

RUN chmod +x entrypoint.sh \
 && useradd --system --uid 1001 --create-home --home-dir /home/ciphra ciphra \
 && chown -R ciphra:ciphra /app /home/ciphra
USER ciphra

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["./entrypoint.sh"]
