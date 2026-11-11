#!/usr/bin/env bash
# Resolve the API's Python dependencies to exact versions so Trivy can scan them.
#
# api/requirements*.txt carry `>=` floors on purpose: every image build picks
# up the newest releases. Trivy's fs scanner only reads `==` pins, though, so
# without this step the repo scan saw no Python packages at all. The prod image
# scans cover the runtime deps, but two things went unscanned:
#   - the dev deps (requirements-dev.txt: pytest, …) are in no scanned image;
#   - the daily scan had no forward look at what the NEXT build would install.
#
# This installs both files into a throwaway target and writes the resolved set
# as a pinned requirements.txt that `trivy fs .` picks up like any lockfile.
#
# Usage: scripts/resolve-pydeps.sh [out-dir]   (default: ci-pydeps)
# Run it with the same Python minor as the api image (3.11), so environment
# markers resolve the way the image's do. CI does this via setup-python.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-ci-pydeps}"
py="${PYTHON:-python3}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

"$py" -m pip install --quiet --disable-pip-version-check --no-cache-dir \
  --target "$work/site" \
  -r "$root/api/requirements.txt" \
  -r "$root/api/requirements-dev.txt"

mkdir -p "$out"
"$py" -m pip freeze --disable-pip-version-check --path "$work/site" \
  > "$out/requirements.txt"

n="$(grep -c '==' "$out/requirements.txt" || true)"
[ "$n" -gt 0 ] || { echo "resolve-pydeps: resolved 0 packages — refusing to report an empty scan as clean" >&2; exit 1; }
echo "resolve-pydeps: $n packages pinned in $out/requirements.txt ($("$py" -V 2>&1))"
