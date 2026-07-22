---
name: deploy-prep
description: Assemble ciphra's deploy hand-off for the operator — confirm the release images built for the target main SHA, then produce the exact deploy-tag command and the post-deploy smoke. Use when a merge is done and prod should be updated. Never pushes the tag itself.
disable-model-invocation: true
---

# deploy-prep

Deploys are the operator's action, always. This skill does everything *up to*
the deploy — it never merges, never pushes the deploy tag, never touches the
VPS. It hands the operator a ready-to-run command block and then smokes the
result once they've run it.

## Steps

1. **Resolve the target SHA.**
   ```bash
   git fetch origin -q && git rev-parse --short origin/main
   git log --oneline -6 origin/main
   ```
   Confirm with the user this is the SHA to ship, and note what's included since
   the last `deploy-*` tag:
   ```bash
   git tag -l 'deploy-*' --sort=-creatordate | head -3
   ```

2. **Confirm the images built green** for that SHA (deploy targets a SHA whose
   images exist — never a SHA still building):
   ```bash
   gh run list --branch main --workflow "Release images" --limit 1 \
     --json status,conclusion,headSha,databaseId
   ```
   If still in progress, watch it: `gh run watch <id> --exit-status`. All three
   jobs (frontend-image, api-image, nginx-image) must be `success`.

3. **Hand over the deploy command** (DO NOT run it — the operator does, via `!`):
   ```
   git tag deploy-<sha> <sha> && git push origin deploy-<sha>
   ```
   Remind them: the VPS `ciphra-deploy.timer` pulls within ~3 min
   (cosign-verify → `.env` `CIPHRA_TAG` bump → restart). Watch live:
   `journalctl -u ciphra-deploy -f`. Rollback = push the previous SHA's tag.

4. **Post-deploy smoke** (public reads — fine to run here). Poll `sw.js` until it
   changes, then verify:
   ```bash
   curl -sI https://ciphra.ch/sw.js        # expect no-cache + fresh last-modified
   curl -sI https://ciphra.ch              # expect 200 + CSP/HSTS/X-Frame headers
   # plus the routes the deploy touched, e.g. /log/today, /migrate → 200
   ```
   A transient `523` right after the tag push is the restart blip — re-probe.

## Guardrails

- Never `gh pr merge` and never `git push origin deploy-*` yourself — the
  guardrail hook blocks both. Produce the commands; the operator runs them.
- If a shipped change had a pending on-device visual check, flag it before the
  operator deploys.
