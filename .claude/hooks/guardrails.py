#!/usr/bin/env python3
"""
ciphra guardrail hook — mechanical enforcement of the hard rules that used to
live only in a human's head (or an assistant's memory). Wired as a PreToolUse
hook for Read / Edit / Write / Bash in .claude/settings.json.

Three concerns, one script:

  1. SECRET FILES — never read a whole age/ssh/gpg key or a live .env into the
     transcript. We leaked ciphra's age private key into context once, which
     forced a key rotation. Grepping a public key out is still allowed.

  2. PROD-MUTATING COMMANDS — the operator merges and deploys, never the
     assistant. Blocks `gh pr merge --admin`, direct pushes to main, deploy-tag
     pushes, `scripts/deploy-wizard.sh`, and ssh/scp/sftp to the VPS. Deploys
     here are pull-based (the operator pushes a `deploy-<sha>` tag via the
     wizard; the VPS timer pulls), so nothing in this repo legitimately needs
     SSH from the assistant.

  3. FORCED CHANGELOG — a `feat:` or `fix:` commit must update CHANGELOG.md in
     the same commit (the [Unreleased] section), because those are exactly the
     changes that earn a version bump (feat→MINOR, fix→PATCH — docs/VERSIONING.md).
     chore/docs/test/refactor/ci/style/perf are exempt. This is the per-commit
     companion to CI's `version-guard` (which enforces the release-level rule
     that VERSION has a changelog section). Escape hatch: put `[skip changelog]`
     in the message for a genuine exception. Binds the assistant; CI binds
     everyone else.

Contract: read the tool call as JSON on stdin. Exit 0 = allow. Exit 2 = block
(the message on stderr is shown to the model so it self-corrects). Any parse
error fails OPEN (exit 0) — a broken guard must never wedge the session; the
human rules still apply as backstop.

Self-test:  python3 .claude/hooks/guardrails.py --selftest
The cases live in this file on purpose. Kept in a shell script they would be
read as real invocations by this very hook — which is how the false-positive
case below was found.
"""
import json
import re
import sys

# ── Secret material: file paths that must never be read wholesale ───────────
SECRET_PATH = re.compile(
    r"""(
        \.age$ | \.key$ | \.pem$ | \.gpg$ | \.p12$ | \.pfx$ |
        (^|/)id_(rsa|ed25519|ecdsa|dsa)($|[^/]*$) |     # ssh private keys
        (^|/)keyfile($|[^/]*) |
        (^|/)\.env(\.|$)                                # .env, .env.local, …
    )""",
    re.VERBOSE,
)
# …but these env templates are safe (no real secrets, committed on purpose).
SECRET_ALLOW = re.compile(r"\.env\.(example|sample|template|docker\.example)")

# Shell readers that would dump a whole file into the transcript.
DUMP = re.compile(r"\b(cat|head|tail|less|more|bat|xxd|od|strings|base64)\b")

# Shell separators. Used to test a dump verb against the secret path in the
# SAME sub-command rather than anywhere on the line.
SEGMENT = re.compile(r"(?:\|\||&&|[;|\n])")

# ── Prod-mutating command patterns (operator-only) ──────────────────────────
# Matched against the command with quoted strings blanked out (see strip_quotes),
# so a commit message / echo / grep pattern that merely *mentions* these words is
# not mistaken for an actual invocation.
PROD_RULES = [
    (re.compile(r"\bgh\s+pr\s+merge\b[^\n]*--admin\b"),
     "gh pr merge --admin bypasses the main-protection review rule. The OPERATOR "
     "merges (with --admin if they choose). Push the branch + open/leave the PR."),
    (re.compile(r"\bgit\s+push\b[^\n]*?(\borigin\b\s+)?(HEAD:)?main(\s|:|$)"),
     "Direct push to origin/main is blocked — main is protected. Open a PR; the "
     "operator merges."),
    (re.compile(r"\bgit\s+push\b[^\n]*\bdeploy-"),
     "Pushing a deploy-<sha> tag triggers the prod deploy. That is the operator's "
     "action — run /deploy-prep to assemble the hand-off, then let them run "
     "scripts/deploy-wizard.sh themselves."),
    # The wizard IS the deploy path since 2026-08-10: it tags, pushes and polls
    # health. The rule above only ever matched the raw `git push … deploy-*`
    # flow the wizard replaced, so without this line the assistant could deploy
    # by simply invoking the script — the one action the whole rule exists to
    # prevent. Anchored at verb position so prose about the script is fine.
    (re.compile(r"(?:^|[;&|]|\n)\s*(?:sudo\s+)?(?:bash\s+|sh\s+)?\.?/?(?:scripts/)?deploy-wizard\.sh\b"),
     "scripts/deploy-wizard.sh performs the deploy (tag → push → health poll). "
     "That is the operator's action. Prepare the hand-off and let them run it "
     "themselves with `! scripts/deploy-wizard.sh`."),
    # ssh/scp/sftp only when it's the verb of a (sub)command, not a substring.
    (re.compile(r"(?:^|[;&|]|\n)\s*(?:sudo\s+)?(?:ssh|scp|sftp)\b"),
     "SSH/SCP to the VPS is blocked — the assistant never touches prod state. "
     "Deploys are pull-based (operator pushes a deploy tag; the VPS pulls)."),
]


# ── Forced changelog (concern 3) ─────────────────────────────────────────────
# A `git commit` whose message is a feat/fix (with optional scope and optional
# `!`) must include CHANGELOG.md in the same commit. Those are the version-bump-
# worthy types (docs/VERSIONING.md); chore/docs/test/refactor/ci/style/perf use
# other type words and are exempt.
IS_GIT_COMMIT = re.compile(r"\bgit\s+commit\b")
FEATFIX_MSG = re.compile(r"^(feat|fix)(\([^)]*\))?!?:", re.IGNORECASE)
SKIP_CHANGELOG = re.compile(r"\[skip changelog\]|\bno-changelog\b", re.IGNORECASE)


def commit_message(cmd: str) -> str | None:
    """Best-effort extraction of a commit message from a `git commit` command,
    read from the RAW command (quotes/heredocs intact — we need the content).

    Handles the two forms the assistant uses: `-m "…"`/`-m '…'` and a heredoc
    piped to `-F -`/`--file=-`. Returns the first line (the subject), or None
    when no inline message is present (e.g. `-F somefile`, or editor mode)."""
    # -m "msg"  /  -m 'msg'  /  --message="msg"
    m = re.search(r"(?:-m|--message)[=\s]+(['\"])(.*?)\1", cmd, re.DOTALL)
    if m:
        return m.group(2).strip().splitlines()[0] if m.group(2).strip() else None
    # heredoc body (git commit -F - <<'EOF' … EOF)
    h = HEREDOC.search(cmd)
    if h and re.search(r"-F\s*-|--file[=\s]+-", cmd):
        body = h.group(2).strip()
        return body.splitlines()[0] if body else None
    return None


def check_changelog(cmd: str, staged: "list[str]") -> "str | None":
    """Return a block reason if this is a feat/fix commit that omits
    CHANGELOG.md, else None. Pure (takes the staged file list) so the self-test
    can exercise it without a git repo."""
    if not IS_GIT_COMMIT.search(cmd):
        return None
    msg = commit_message(cmd)
    if not msg or not FEATFIX_MSG.match(msg):
        return None
    if SKIP_CHANGELOG.search(cmd):
        return None
    if any(f == "CHANGELOG.md" or f.endswith("/CHANGELOG.md") for f in staged):
        return None
    return (
        f"This is a '{msg.split(':', 1)[0]}' commit but CHANGELOG.md is not in it. "
        "feat/fix changes earn a version bump (docs/VERSIONING.md), so add a line "
        "under CHANGELOG.md's [Unreleased] section and stage it in the same commit. "
        "Genuine exception: put [skip changelog] in the message."
    )


def staged_files() -> "list[str]":
    """Names staged for commit, or [] if git can't be queried (fail open)."""
    import subprocess
    try:
        out = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True, text=True, timeout=5,
        )
        return [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
    except Exception:
        return []


# Heredoc bodies are DATA, not code. A commit message, a doc block or a test
# fixture routinely quotes the very commands this hook forbids, and unlike a
# quoted argument they are not wrapped in quotes — so strip_quotes alone read
# them as invocations. That blocked three legitimate calls while this file was
# being written, including the commit message describing the rule itself.
HEREDOC = re.compile(r"<<-?\s*'?\"?([A-Za-z_][A-Za-z0-9_]*)'?\"?\n(.*?)\n\1", re.DOTALL)


def strip_heredocs(s: str) -> str:
    """Blank heredoc bodies, length-preserving (see strip_quotes)."""
    def blank(m: "re.Match[str]") -> str:
        whole, body = m.group(0), m.group(2)
        off = m.start(2) - m.start(0)
        return whole[:off] + " " * len(body) + whole[off + len(body):]
    return HEREDOC.sub(blank, s)


def strip_quotes(s: str) -> str:
    """Blank single/double-quoted spans so words inside string literals (commit
    messages, echo text, grep patterns) aren't read as command invocations.

    LENGTH-PRESERVING on purpose. The blanked copy is split on the same shell
    separators as the original and the segments are zipped together, so the two
    must stay index-aligned. Collapsing a quoted span to a single space shifts
    every later separator and pairs the wrong segments.
    """
    s = re.sub(r"'[^']*'", lambda m: " " * len(m.group(0)), s)
    s = re.sub(r'"[^"]*"', lambda m: " " * len(m.group(0)), s)
    return s


def check_bash(cmd: str):
    """Return a block reason for `cmd`, or None to allow."""
    # Verb detection ignores quoted literals AND heredoc bodies — both are data.
    code = strip_quotes(strip_heredocs(cmd))
    for rule, reason in PROD_RULES:
        if rule.search(code):
            return reason

    # Pair the dump verb with the secret path PER SEGMENT, not across the whole
    # line. A compound like
    #     git ls-files secrets/x.key ; git log --oneline | head -10
    # contains a dump verb and a secret path in DIFFERENT sub-commands, and
    # dumps nothing. Blocking it stopped exactly the audit that establishes a
    # key is not committed — a bad trade: this rule exists to prevent leaks,
    # not to prevent looking for them.
    #
    # Verb detection uses the quote-blanked segment (so an echoed word is not a
    # command); the path scan uses the ORIGINAL segment (so a quoted path is
    # still seen).
    for raw_seg, code_seg in zip(SEGMENT.split(cmd), SEGMENT.split(code)):
        if not DUMP.search(code_seg):
            continue
        for tok in re.split(r"[\s'\"=]+", raw_seg):
            if tok and SECRET_PATH.search(tok) and not SECRET_ALLOW.search(tok):
                return (
                    f"Dumping '{tok}' would print secret material into the "
                    "transcript. Use a key-only extractor like `grep 'public key'`."
                )
    return None


def check_file(path: str):
    """Return a block reason for a Read/Edit/Write path, or None to allow."""
    if path and SECRET_PATH.search(path) and not SECRET_ALLOW.search(path):
        return (
            f"'{path}' looks like secret key material or a live .env. Reading it "
            "wholesale risks leaking it into the transcript. Extract only what you "
            "need (e.g. `grep 'public key' …`) or use a template file."
        )
    return None


def block(reason: str) -> None:
    sys.stderr.write("⛔ ciphra guardrail: " + reason + "\n")
    sys.exit(2)


# ── Self-test ───────────────────────────────────────────────────────────────
# (expect_block, kind, payload)
CASES = [
    # Secret dumps
    (True, "bash", "cat ~/.config/ciphra/age.key"),
    (True, "bash", "cat golive/secrets/backup.age"),
    (True, "bash", "head -20 .env"),
    (True, "bash", "tail -5 .env.local"),
    (True, "bash", "cat ~/.ssh/id_ed25519"),
    (True, "bash", "strings /etc/ssl/private/server.pem"),
    (True, "bash", "base64 golive/keyfile"),
    (True, "bash", "cat secrets/x.key | grep -c BEGIN"),
    # Prod-mutating
    (True, "bash", "gh pr merge 42 --squash --admin"),
    (True, "bash", "git push origin main"),
    (True, "bash", "git push origin deploy-abc1234"),
    (True, "bash", "scripts/deploy-wizard.sh"),
    (True, "bash", "./scripts/deploy-wizard.sh -n 25"),
    (True, "bash", "bash scripts/deploy-wizard.sh"),
    (True, "bash", "ssh vps uptime"),
    (True, "bash", "scp file vps:/tmp/"),
    # File tools
    (True, "read", "golive/age/backup.key"),
    (True, "read", "/home/x/.ssh/id_rsa"),
    (False, "read", ".env.example"),
    (False, "read", "frontend/package.json"),
    # Allowed — the false-positive guards
    (False, "bash", "cat .env.example"),
    (False, "bash", "cat frontend/package.json"),
    (False, "bash", "grep 'public key' golive/keyfile"),
    (False, "bash", "git commit -m 'mention deploy-wizard.sh in the docs'"),
    (False, "bash", "echo 'do not run gh pr merge --admin'"),
    (False, "bash", "npm test"),
    (False, "bash", "git log --oneline -5"),
    # Heredoc bodies are data. A commit message or doc that quotes a forbidden
    # command is not an invocation of it.
    (False, "bash", "git commit -F - <<'MSG'\nhand over: git push origin deploy-abc\nMSG"),
    (False, "bash", "cat > /tmp/doc.md <<'EOF'\nrun scripts/deploy-wizard.sh yourself\nEOF"),
    # …but a real invocation AFTER a heredoc still blocks.
    (True, "bash", "cat > /tmp/x <<'EOF'\nharmless\nEOF\ngit push origin deploy-abc1234"),
    # The regression this file's segment logic exists for: a dump verb and a
    # secret path in different sub-commands dump nothing.
    (False, "bash", "git ls-files frontend/.devcerts/dev.key ; git log --oneline | head -10"),
    (False, "bash", "git check-ignore -v x.key && echo ok"),
]


# Changelog cases: (expect_block, command, staged_files). Pure — no git.
CHANGELOG_CASES = [
    # feat/fix WITHOUT CHANGELOG.md staged → block
    (True,  "git commit -m 'feat(reports): period picker'", ["frontend/src/routes/reports/+page.svelte"]),
    (True,  "git commit -m 'fix(api): batch import'", ["api/server.py"]),
    (True,  "git commit -m 'feat!: rotate the key hierarchy'", ["frontend/src/lib/crypto.ts"]),
    (True,  "git commit -m 'fix(nginx): buffer'", ["nginx/proxy_params.conf", "docs/OPERATIONS.md"]),
    # feat/fix WITH CHANGELOG.md staged → allow
    (False, "git commit -m 'feat(reports): period picker'", ["frontend/src/routes/reports/+page.svelte", "CHANGELOG.md"]),
    (False, "git commit -m 'fix(api): batch import'", ["api/server.py", "CHANGELOG.md"]),
    # non-bump types → exempt regardless of CHANGELOG
    (False, "git commit -m 'chore(deps): bump vite'", ["frontend/package.json"]),
    (False, "git commit -m 'docs: refresh operations'", ["docs/OPERATIONS.md"]),
    (False, "git commit -m 'test(api): cover edge case'", ["api/tests/test_api.py"]),
    (False, "git commit -m 'refactor(journal): extract narrative'", ["frontend/src/lib/journal/narrative.ts"]),
    # escape hatch
    (False, "git commit -m 'fix(api): emergency patch [skip changelog]'", ["api/server.py"]),
    # heredoc-form feat message, no CHANGELOG → block
    (True,  "git commit -F - <<'MSG'\nfeat(journal): v2 feed\n\nbody\nMSG", ["frontend/src/routes/journal/+page.svelte"]),
    # heredoc-form feat message WITH CHANGELOG → allow
    (False, "git commit -F - <<'MSG'\nfeat(journal): v2 feed\nMSG", ["frontend/src/routes/journal/+page.svelte", "CHANGELOG.md"]),
    # not a commit at all → n/a
    (False, "git add -A && echo feat: nope", ["api/server.py"]),
]


def selftest() -> int:
    fails = 0
    for expect_block, kind, payload in CASES:
        reason = check_bash(payload) if kind == "bash" else check_file(payload)
        got = reason is not None
        ok = got == expect_block
        if not ok:
            fails += 1
            want = "BLOCK" if expect_block else "ALLOW"
            print(f"FAIL want={want} got={'BLOCK' if got else 'ALLOW'}  {payload}")
    for expect_block, cmd, staged in CHANGELOG_CASES:
        got = check_changelog(cmd, staged) is not None
        ok = got == expect_block
        if not ok:
            fails += 1
            want = "BLOCK" if expect_block else "ALLOW"
            print(f"FAIL(changelog) want={want} got={'BLOCK' if got else 'ALLOW'}  {cmd!r}")
    total = len(CASES) + len(CHANGELOG_CASES)
    print(f"{total - fails}/{total} guardrail cases pass")
    return 1 if fails else 0


def main() -> None:
    if "--selftest" in sys.argv:
        sys.exit(selftest())

    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # fail open — never wedge the session on a parse error

    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {}) or {}

    if tool in ("Read", "Edit", "Write"):
        reason = check_file(str(ti.get("file_path", "") or ti.get("path", "")))
        if reason:
            block(reason)

    if tool == "Bash":
        cmd = str(ti.get("command", ""))
        reason = check_bash(cmd)
        if reason:
            block(reason)
        # Changelog rule needs live git state, so it runs here (not in
        # check_bash) with the actually-staged files.
        reason = check_changelog(cmd, staged_files())
        if reason:
            block(reason)

    sys.exit(0)


if __name__ == "__main__":
    main()
