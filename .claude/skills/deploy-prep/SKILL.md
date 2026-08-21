---
name: deploy-prep
description: Assemble ciphra's deploy hand-off for the operator — summarise what would ship, confirm the release images are green and signed, then hand over scripts/deploy-wizard.sh for them to run. Never deploys.
disable-model-invocation: true
---

# deploy-prep

Deploys are the operator's action, always. This skill does everything *up to*
the deploy: it works out what would ship and whether it is deployable, then
hands over. It never runs the wizard, never pushes a tag, never touches the
VPS. The guardrail hook blocks all three.

## The one command to hand over

```
! scripts/deploy-wizard.sh
```

`scripts/deploy-wizard.sh` is the single entry point and has been since
2026-08-10. It does the whole deploy itself — pick, tag, push, poll health.

**Do not hand over `git tag deploy-<sha> && git push origin deploy-<sha>`.**
That is the raw flow the wizard replaced, and it is not merely superseded, it
was broken: a lightweight tag carries no tagger date, the VPS selects the
deploy tag by `--sort=-creatordate`, and so a rollback to an older commit
sorted *older* than the tag already live and did nothing at all. The wizard's
tag is annotated, which makes newest-pushed win.

What the wizard already handles, so this skill does not repeat it:

- lists the deployable commits on `origin/main` with signing status, which are
  already deployed, and which one is currently live — no hunting for a 7-char
  SHA
- offers only commits with a **green and signed** release-images build
- checks the operator's repo permission (write = operator); read-only
  collaborators get a view-only wizard
- pushes an **annotated** tag
- polls health afterwards

## Steps

1. **Say what would ship.** The operator picks from a menu, so give them the
   context to pick with — not a SHA to copy.

   ```bash
   git fetch origin -q
   git log --oneline origin/main -12
   git tag -l 'deploy-*' --sort=-creatordate | head -3      # what is live now
   ```

   Summarise the user-visible change in the commits since the live tag. If a
   shipped change had a pending on-device visual check, say so **before** they
   deploy — that is the thing this step exists for.

2. **Confirm the images exist and are green** for the tip. The wizard enforces
   this too, but a red build here means "wait", and waiting is cheaper to learn
   now than three menu steps in.

   ```bash
   gh run list --branch main --workflow "Release images" --limit 1 \
     --json status,conclusion,headSha,databaseId
   ```

   Still running? `gh run watch <id> --exit-status`. All three jobs
   (frontend-image, api-image, nginx-image) must be `success`.

3. **Hand over.** Give them the command, and state which commit you expect them
   to choose from the menu:

   ```
   ! scripts/deploy-wizard.sh
   ```

   The VPS `ciphra-deploy.timer` pulls within ~3 min: cosign-verify → `.env`
   `CIPHRA_TAG` bump → restart → health check, with auto-rollback and an ntfy
   notification on OK / BLOCKED / FAILED.

4. **Post-deploy smoke** — public reads, fine to run here. The wizard polls
   health already; this checks the things it does not.

   ```bash
   curl -sI https://ciphra.ch/sw.js        # expect no-cache + fresh last-modified
   curl -sI https://ciphra.ch              # expect 200 + CSP/HSTS/X-Frame headers
   # plus the routes the deploy touched, e.g. /log/today, /migrate → 200
   ```

   A transient `523` right after the tag push is the restart blip — re-probe.

## Guardrails

- Never run `scripts/deploy-wizard.sh`, never `git push origin deploy-*`, never
  `gh pr merge`. The hook blocks all three. Produce the context; the operator
  runs the wizard.
- Rollback is the wizard again with an earlier commit chosen — not a hand-built
  tag command.
